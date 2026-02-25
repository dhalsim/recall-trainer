/**
 * Cashu deterministic wallet CLI — cashu-ts ^3.4.1 + @scure/bip39 ^2.0.1
 *
 * Usage:
 *   bun run wallet.ts                                          # generate new mnemonic, show balance
 *   bun run wallet.ts --mnemonic "word1 word2 ..."             # show balance
 *   bun run wallet.ts --mnemonic "word1 word2 ..." --token cashuXXX   # receive token
 *   bun run wallet.ts --mnemonic "word1 word2 ..." --send 1000         # send 1000 sats
 *
 * State (proofs + counters) is persisted in ~/.cashu-wallet/<fingerprint>.db (SQLite via bun:sqlite).
 * Each mnemonic gets its own isolated DB file.
 */

import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Wallet, getEncodedTokenV4 } from "@cashu/cashu-ts";
import type { Proof, OperationCounters } from "@cashu/cashu-ts";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ─── Constants ────────────────────────────────────────────────────────────────

const MINT_URL = "https://testnut.cashu.space";
const STATE_DIR = join(homedir(), ".cashu-wallet");

// ─── Logging ──────────────────────────────────────────────────────────────────

const log = {
  info:  (msg: string) => console.log(`  [info]  ${msg}`),
  ok:    (msg: string) => console.log(`  [✓]     ${msg}`),
  warn:  (msg: string) => console.log(`  [warn]  ${msg}`),
  error: (msg: string) => console.error(`  [✗]     ${msg}`),
  sep:   ()            => console.log("─".repeat(60)),
  title: (msg: string) => { log.sep(); console.log(`  ${msg}`); log.sep(); },
};

// ─── SQLite DB ────────────────────────────────────────────────────────────────

function openDb(mnemonic: string): Database {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
    log.info(`Created state dir: ${STATE_DIR}`);
  }
  const entropy = bip39.mnemonicToEntropy(mnemonic, wordlist);
  const fingerprint = bytesToHex(entropy).slice(0, 8);
  const dbPath = join(STATE_DIR, `wallet-${fingerprint}.db`);
  log.info(`Opening DB: ${dbPath}`);

  const db = new Database(dbPath);
  db.run(`
    CREATE TABLE IF NOT EXISTS proofs (
      secret TEXT PRIMARY KEY,
      id     TEXT NOT NULL,
      amount INTEGER NOT NULL,
      C      TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS counters (
      keyset_id TEXT PRIMARY KEY,
      next      INTEGER NOT NULL DEFAULT 0
    )
  `);
  return db;
}

// ─── Proof persistence ────────────────────────────────────────────────────────

function loadProofs(db: Database): Proof[] {
  const rows = db.query("SELECT id, amount, secret, C FROM proofs").all() as Proof[];
  log.info(`Loaded ${rows.length} proof(s) from DB`);
  return rows;
}

function saveProofs(db: Database, proofs: Proof[]): void {
  const insert = db.prepare(
    "INSERT OR REPLACE INTO proofs (secret, id, amount, C) VALUES ($secret, $id, $amount, $C)"
  );
  const insertMany = db.transaction((ps: Proof[]) => {
    for (const p of ps) insert.run({ $secret: p.secret, $id: p.id, $amount: p.amount, $C: p.C });
  });
  insertMany(proofs);
  log.ok(`Saved ${proofs.length} proof(s) to DB`);
}

function deleteProofs(db: Database, proofs: Proof[]): void {
  const del = db.prepare("DELETE FROM proofs WHERE secret = $secret");
  const deleteMany = db.transaction((ps: Proof[]) => {
    for (const p of ps) del.run({ $secret: p.secret });
  });
  deleteMany(proofs);
  log.ok(`Deleted ${proofs.length} spent proof(s) from DB`);
}

// ─── Counter persistence ──────────────────────────────────────────────────────

function loadCounters(db: Database): Record<string, number> {
  const rows = db.query("SELECT keyset_id, next FROM counters").all() as {
    keyset_id: string;
    next: number;
  }[];
  const counters: Record<string, number> = {};
  for (const row of rows) counters[row.keyset_id] = row.next;
  log.info(`Loaded counters: ${JSON.stringify(counters)}`);
  return counters;
}

function persistCounter(db: Database, op: OperationCounters): void {
  // OperationCounters = { keysetId: string, start: number, count: number, next: number }
  // `next` is the value to use for the NEXT operation — always persist this.
  log.info(
    `  countersReserved: keyset=${op.keysetId} start=${op.start} count=${op.count} next=${op.next}`
  );
  db.run(
    "INSERT OR REPLACE INTO counters (keyset_id, next) VALUES ($keysetId, $next)",
    { $keysetId: op.keysetId, $next: op.next }
  );
  log.ok(`  Counter for ${op.keysetId} persisted → next=${op.next}`);
}

// ─── Wallet factory ───────────────────────────────────────────────────────────

async function makeWallet(mnemonic: string, db: Database): Promise<Wallet> {
  const seed: Uint8Array = bip39.mnemonicToSeedSync(mnemonic);
  log.info(`BIP39 seed (hex): ${bytesToHex(seed)}`);

  const counters = loadCounters(db);
  log.info(`Constructing Wallet with counterInit: ${JSON.stringify(counters)}`);

  const wallet = new Wallet(MINT_URL, {
    unit: "sat",
    bip39seed: seed,
    // ★ Resume counters from DB so we never restart at 0 on re-instantiation.
    //   This is what prevents "outputs already signed".
    counterInit: counters,
  });

  log.info(`Calling loadMint()...`);
  await wallet.loadMint();
  log.ok(`Mint loaded. Active keyset: ${wallet.keysetId}`);

  // ★ countersReserved fires atomically BEFORE the mint HTTP call.
  //   Persisting here (not after run()) is crash-safe: if we crash between
  //   "mint signed" and "we processed the response", on retry we'll use
  //   fresh counter slots rather than re-submitting the same outputs.
  wallet.on.countersReserved((op: OperationCounters) => {
    log.info(`countersReserved event fired:`);
    persistCounter(db, op);
  });

  return wallet;
}

// ─── Balance ──────────────────────────────────────────────────────────────────

function totalBalance(proofs: Proof[]): number {
  return proofs.reduce((sum, p) => sum + p.amount, 0);
}

function printBalance(proofs: Proof[]): void {
  const total = totalBalance(proofs);
  log.ok(`Balance: ${total} sats across ${proofs.length} proof(s)`);
  const byKeyset: Record<string, { count: number; sats: number }> = {};
  for (const p of proofs) {
    if (!byKeyset[p.id]) byKeyset[p.id] = { count: 0, sats: 0 };
    byKeyset[p.id].count++;
    byKeyset[p.id].sats += p.amount;
  }
  for (const [id, info] of Object.entries(byKeyset)) {
    log.info(`  keyset ${id}: ${info.count} proof(s) = ${info.sats} sats`);
  }
  if (proofs.length === 0) log.info(`No proofs yet. Use --token cashuXXX to receive.`);
}

// ─── Receive ─────────────────────────────────────────────────────────────────

async function cmdReceive(encodedToken: string, mnemonic: string): Promise<void> {
  log.title("RECEIVE / SWAP TOKEN");
  log.info(`Token (preview): ${encodedToken.slice(0, 80)}...`);

  const db = openDb(mnemonic);
  const wallet = await makeWallet(mnemonic, db);

  log.info(`Swapping token at mint (wallet.ops.receive().asDeterministic().run())...`);

  // receive() returns Proof[] directly (confirmed from v3 README + your fix)
  // asDeterministic() with no arg = counter=0 = "auto-reserve from CounterSource"
  const newProofs = await wallet.ops
    .receive(encodedToken)
    .asDeterministic()
    .run();

  log.ok(`Swap successful! Received ${newProofs.length} new proof(s):`);
  for (const p of newProofs) {
    log.info(`  ${p.amount} sats — keyset: ${p.id} — secret: ${p.secret.slice(0, 16)}...`);
  }

  saveProofs(db, newProofs);

  log.sep();
  printBalance(loadProofs(db));
  db.close();
}

// ─── Send ─────────────────────────────────────────────────────────────────────

async function cmdSend(amount: number, mnemonic: string): Promise<void> {
  log.title("SEND TOKEN");

  const db = openDb(mnemonic);
  const proofs = loadProofs(db);
  const balance = totalBalance(proofs);

  log.info(`Requested: ${amount} sats | Available: ${balance} sats`);

  if (balance < amount) {
    log.error(`Insufficient funds. Have ${balance} sats, need ${amount} sats.`);
    db.close();
    process.exit(1);
  }

  const wallet = await makeWallet(mnemonic, db);

  log.info(`Splitting proofs (wallet.ops.send().asDeterministic().run())...`);

  // send() returns { keep: Proof[], send: Proof[] }
  // Both sides use deterministic secrets when asDeterministic() is called,
  // so change (keep) is also recoverable from the seed.
  const { keep, send } = await wallet.ops
    .send(amount, proofs)
    .asDeterministic()
    .run();

  log.ok(`Split complete:`);
  log.info(`  To send: ${send.length} proof(s) = ${totalBalance(send)} sats`);
  log.info(`  To keep: ${keep.length} proof(s) = ${totalBalance(keep)} sats`);

  // Replace all proofs: delete old ones, store change
  deleteProofs(db, proofs);
  if (keep.length > 0) saveProofs(db, keep);

  const token = getEncodedTokenV4({ mint: MINT_URL, proofs: send, unit: "sat" });

  log.sep();
  console.log("\n  ══ CASHU TOKEN — copy and share this ══\n");
  console.log(`  ${token}`);
  console.log("\n  ════════════════════════════════════════\n");
  log.sep();
  printBalance(keep);
  db.close();
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let mnemonic: string | null = null;
  let token: string | null = null;
  let send: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--mnemonic" && args[i + 1]) mnemonic = args[++i];
    else if (args[i] === "--token"    && args[i + 1]) token    = args[++i];
    else if (args[i] === "--send"     && args[i + 1]) send     = parseInt(args[++i], 10);
  }

  return { mnemonic, token, send };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { mnemonic: mnemonicArg, token, send } = parseArgs();

  log.title("CASHU DETERMINISTIC WALLET (testnut.cashu.space)");

  let mnemonic: string;
  if (mnemonicArg) {
    mnemonic = mnemonicArg;
    if (!bip39.validateMnemonic(mnemonic, wordlist)) {
      log.error("Invalid mnemonic — check spelling and word count (12 or 24 words).");
      process.exit(1);
    }
    log.ok(`Mnemonic validated (${mnemonic.split(" ").length} words)`);
  } else {
    mnemonic = bip39.generateMnemonic(wordlist); // 12 words, 128-bit entropy
    log.sep();
    console.log("\n  ★ NEW MNEMONIC — save this, it's your only recovery key ★\n");
    console.log(`  ${mnemonic}\n`);
    log.sep();
    log.warn(`Pass it next time with: --mnemonic "${mnemonic}"`);
  }

  if (token) {
    await cmdReceive(token, mnemonic);
  } else if (send !== null) {
    await cmdSend(send, mnemonic);
  } else {
    // Balance view
    log.title("BALANCE");
    const db = openDb(mnemonic);
    printBalance(loadProofs(db));
    const counters = loadCounters(db);
    log.info(`Counters: ${JSON.stringify(counters)}`);
    db.close();
  }
}

main().catch((err) => {
  log.error(`Fatal: ${(err as Error)?.message ?? String(err)}`);
  if ((err as Error)?.stack) console.error((err as Error).stack);
  process.exit(1);
});