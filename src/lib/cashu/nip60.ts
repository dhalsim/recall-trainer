import { sumProofs } from '@cashu/cashu-ts';
import type { Proof } from '@cashu/cashu-ts';
import type { Event, EventTemplate, Filter } from 'nostr-tools';

import { logger } from '../../utils/logger';
import { pool } from '../../utils/nostr';
import { getRelays } from '../nostr/nip65';
import type { Nip65Relays } from '../nostr/nip65';

/** NIP-60: Cashu wallet event (replaceable). Encrypted privkey + mints. */
export const NUTZAP_WALLET_KIND = 17375;

/** NIP-60: Token event. Encrypted unspent proofs per mint. */
export const NUTZAP_TOKEN_KIND = 7375;

/** NIP-60 / NIP-61: Redemption / spending history (optional). */
export const NUTZAP_REDEMPTION_KIND = 7376;
const { error: logError } = logger();

const DEFAULT_WRITE_RELAYS = ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://nos.lol'];

function getWriteRelays(pubkey: string): string[] {
  const nip65 = getRelays(pubkey) as Nip65Relays | undefined;

  return nip65?.writeRelays?.length ? nip65.writeRelays : DEFAULT_WRITE_RELAYS;
}

export type Nip60WalletContent = {
  privkey: string;
  mints: string[];
};

export type Nip60TokenContent = {
  mint: string;
  proofs: Proof[];
};

export type Nip44Decrypt = (pubkey: string, ciphertext: string) => Promise<string>;
export type Nip44Encrypt = (pubkey: string, plaintext: string) => Promise<string>;

/**
 * Query the user's NIP-60 wallet event (kind 17375). Returns the latest replaceable event or null.
 */
export async function queryWallet(
  relays: string[],
  pubkey: string,
  _signal?: AbortSignal,
): Promise<Event | null> {
  const filter: Filter = {
    kinds: [NUTZAP_WALLET_KIND],
    authors: [pubkey],
    limit: 1,
  };

  const events = await pool.querySync(relays, filter);

  if (events.length === 0) {
    return null;
  }

  const latest = events.reduce((a, b) => (a.created_at >= b.created_at ? a : b));

  return latest;
}

/**
 * Decrypt and parse wallet event content.
 * Content is an array of [key, value] pairs, e.g.:
 * [ ["privkey", "hexkey"], ["mint", "https://mint1"], ["mint", "https://mint2"] ]
 */
export async function decryptWalletContent(
  event: Event,
  nip44Decrypt: Nip44Decrypt,
  userPubkey: string,
): Promise<Nip60WalletContent> {
  const plain = await nip44Decrypt(userPubkey, event.content);
  const parsed = JSON.parse(plain) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('Invalid NIP-60 wallet content');
  }

  let privkey = '';
  const mints: string[] = [];

  for (const row of parsed) {
    if (!Array.isArray(row) || row.length < 2 || typeof row[0] !== 'string') {
      continue;
    }

    const key = String(row[0]);
    const value = String(row[1]);

    if (key === 'privkey') {
      privkey = value;
    } else if (key === 'mint') {
      mints.push(value);
    }
  }

  if (!privkey) {
    throw new Error('Invalid NIP-60 wallet content');
  }

  return { privkey, mints };
}

/**
 * Serialize wallet content to the NIP-60 array-of-arrays format for encryption and publishing.
 */
export function walletContentToArray(content: Nip60WalletContent): [string, string][] {
  const rows: [string, string][] = [['privkey', content.privkey]];

  for (const mint of content.mints) {
    rows.push(['mint', mint]);
  }

  return rows;
}

/**
 * Build kind 17375 wallet event template (content must be encrypted by caller after this).
 */
export function buildWalletEventTemplate(
  encryptedContent: string,
  createdAt: number = Math.floor(Date.now() / 1000),
): EventTemplate {
  return {
    kind: NUTZAP_WALLET_KIND,
    content: encryptedContent,
    tags: [],
    created_at: createdAt,
  };
}

/**
 * Build kind 7375 token event template (content must be encrypted by caller).
 */
export function buildTokenEventTemplate(
  encryptedContent: string,
  createdAt: number = Math.floor(Date.now() / 1000),
): EventTemplate {
  return {
    kind: NUTZAP_TOKEN_KIND,
    content: encryptedContent,
    tags: [],
    created_at: createdAt,
  };
}

/**
 * Query NIP-60 token events (kind 7375) for the user.
 */
export async function queryTokens(
  relays: string[],
  pubkey: string,
  _signal?: AbortSignal,
): Promise<Event[]> {
  const filter: Filter = {
    kinds: [NUTZAP_TOKEN_KIND],
    authors: [pubkey],
    limit: 100,
  };

  return pool.querySync(relays, filter);
}

/**
 * Decrypt and parse token event content. Returns mint URL and proofs (cashu-ts Proof format).
 */
export async function decryptTokenContent(
  event: Event,
  nip44Decrypt: Nip44Decrypt,
  userPubkey: string,
): Promise<Nip60TokenContent | null> {
  try {
    const plain = await nip44Decrypt(userPubkey, event.content);
    const parsed = JSON.parse(plain) as unknown;

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('mint' in parsed) ||
      !('proofs' in parsed)
    ) {
      return null;
    }

    const proofs = Array.isArray(parsed.proofs) ? (parsed.proofs as Proof[]) : [];

    return {
      mint: String(parsed.mint),
      proofs,
    };
  } catch (err) {
    logError('[nip60] Failed to decrypt token content:', err);

    return null;
  }
}

/**
 * Sum proof amounts grouped by mint URL. Returns a Map<mintUrl, totalAmount>.
 */
export function computeBalanceByMint(tokens: Nip60TokenContent[]): Map<string, number> {
  const byMint = new Map<string, number>();

  for (const { mint, proofs } of tokens) {
    const sum = sumProofs(proofs);
    const current = byMint.get(mint) ?? 0;
    byMint.set(mint, current + sum);
  }

  return byMint;
}

export type TokenStatus = 'created' | 'destroyed';
export type Direction = 'in' | 'out';

export async function publishTokenStatusEvent(
  direction: Direction,
  amount: string,
  unit: string,
  eventRef: string,
  status: TokenStatus,
  pubkey: string,
  signEvent: (template: EventTemplate) => Promise<Event>,
  nip44Encrypt: (pubkey: string, plaintext: string) => Promise<string>,
): Promise<string | null> {
  try {
    const content = JSON.stringify([
      ['direction', direction],
      ['amount', amount],
      ['unit', unit],
      ['e', eventRef, '', status],
    ]);

    const encryptedContent = await nip44Encrypt(pubkey, content);

    const template: EventTemplate = {
      kind: 7376,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: encryptedContent,
    };

    const signed = await signEvent(template);
    const eventId = signed.id;

    const writeRelays = getWriteRelays(pubkey);
    pool.publish(writeRelays, signed);

    return eventId;
  } catch (err) {
    logError('[nip60] Failed to publish token status event:', err);

    return null;
  }
}

// TODO: NOT USED
export function sumProofsAmount(proofs: Proof[]): string {
  const total = proofs.reduce((sum, p) => sum + p.amount, 0);

  return total.toString();
}

export function getProofKeysetId(proofs: Proof[]): string | null {
  if (proofs.length === 0) {
    return null;
  }

  return proofs[0].id;
}
