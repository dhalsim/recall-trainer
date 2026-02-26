/**
 * LocalStorage cache for the decrypted NIP-60 wallet data (wallet content + proofs by mint).
 * Allows instant hydration on dialog open; Nostr relay sync runs in the background.
 */

import type { Proof } from '@cashu/cashu-ts';

import { logger } from '../../utils/logger';

import type { Nip60WalletContent, HistoryEntry } from './nip60';

const CACHE_KEY_PREFIX = 'recall-trainer-wallet-cache-';
const { error } = logger();

type CachedWallet = {
  walletContent: Nip60WalletContent;
  proofsByMint: Record<string, Proof[]>;
  pendingProofsByMint: Record<string, Proof[]>;
  tokenEventIds: Record<string, string>;
  history: HistoryEntry[];
};

function cacheKey(pubkey: string): string {
  return `${CACHE_KEY_PREFIX}${pubkey}`;
}

export function readWalletCache(pubkey: string): CachedWallet | null {
  try {
    const raw = localStorage.getItem(cacheKey(pubkey));

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('walletContent' in parsed) ||
      !('proofsByMint' in parsed)
    ) {
      return null;
    }

    return parsed as CachedWallet;
  } catch (err) {
    error('[walletCache] Failed to read:', err);

    return null;
  }
}

export function writeWalletCache(
  pubkey: string,
  walletContent: Nip60WalletContent,
  proofsByMint: Map<string, Proof[]>,
  pendingProofsByMint: Map<string, Proof[]>,
  tokenEventIds: Record<string, string>,
): void {
  try {
    const cached = readWalletCache(pubkey);

    const serializable: CachedWallet = {
      walletContent,
      proofsByMint: Object.fromEntries(proofsByMint),
      pendingProofsByMint: Object.fromEntries(pendingProofsByMint),
      tokenEventIds,
      history: cached?.history ?? [],
    };

    localStorage.setItem(cacheKey(pubkey), JSON.stringify(serializable));
  } catch (err) {
    error('[walletCache] Failed to write:', err);
  }
}

export function proofMapFromCache(cached: CachedWallet): Map<string, Proof[]> {
  return new Map(Object.entries(cached.proofsByMint));
}

export function pendingProofsMapFromCache(cached: CachedWallet): Map<string, Proof[]> {
  return new Map(Object.entries(cached.pendingProofsByMint ?? {}));
}

export function readPendingAndEventIds(pubkey: string): {
  pendingProofsByMint: Map<string, Proof[]>;
  tokenEventIds: Record<string, string>;
} {
  const cached = readWalletCache(pubkey);

  return {
    pendingProofsByMint: new Map(Object.entries(cached?.pendingProofsByMint ?? {})),
    tokenEventIds: cached?.tokenEventIds ?? {},
  };
}

export function clearWalletCache(pubkey: string): void {
  try {
    localStorage.removeItem(cacheKey(pubkey));
  } catch (err) {
    error('[walletCache] Failed to clear:', err);
  }
}

export function getPendingProofsForMint(pubkey: string, mintUrl: string): Proof[] {
  const cached = readWalletCache(pubkey);

  if (!cached) {
    return [];
  }

  return cached.pendingProofsByMint?.[mintUrl] ?? [];
}

export function getAllPendingProofs(pubkey: string): Proof[] {
  const cached = readWalletCache(pubkey);

  if (!cached?.pendingProofsByMint) {
    return [];
  }

  return Object.values(cached.pendingProofsByMint).flat();
}

export function getPendingMintUrls(pubkey: string): string[] {
  const cached = readWalletCache(pubkey);

  if (!cached?.pendingProofsByMint) {
    return [];
  }

  return Object.keys(cached.pendingProofsByMint);
}

export function addPendingProofs(pubkey: string, mintUrl: string, proofs: Proof[]): void {
  const cached = readWalletCache(pubkey);

  if (!cached) {
    return;
  }

  const pending = cached.pendingProofsByMint ?? {};
  const existing = pending[mintUrl] ?? [];
  pending[mintUrl] = [...existing, ...proofs];

  localStorage.setItem(
    cacheKey(pubkey),
    JSON.stringify({ ...cached, pendingProofsByMint: pending }),
  );
}

export function removePendingProofs(pubkey: string, mintUrl: string, secrets: string[]): void {
  const cached = readWalletCache(pubkey);

  if (!cached?.pendingProofsByMint) {
    return;
  }

  const pending = cached.pendingProofsByMint;
  const existing = pending[mintUrl] ?? [];
  pending[mintUrl] = existing.filter((p) => !secrets.includes(p.secret));

  localStorage.setItem(
    cacheKey(pubkey),
    JSON.stringify({ ...cached, pendingProofsByMint: pending }),
  );
}

export function getTokenEventId(pubkey: string, mintUrl: string): string | null {
  const cached = readWalletCache(pubkey);

  if (!cached?.tokenEventIds) {
    return null;
  }

  return cached.tokenEventIds[mintUrl] ?? null;
}

export function setTokenEventId(pubkey: string, mintUrl: string, eventId: string): void {
  const cached = readWalletCache(pubkey);

  if (!cached) {
    return;
  }

  const tokenEventIds = { ...cached.tokenEventIds, [mintUrl]: eventId };

  localStorage.setItem(cacheKey(pubkey), JSON.stringify({ ...cached, tokenEventIds }));
}

export function getHistory(pubkey: string): HistoryEntry[] {
  const cached = readWalletCache(pubkey);

  return cached?.history ?? [];
}

export function setHistory(pubkey: string, entries: HistoryEntry[]): void {
  const cached = readWalletCache(pubkey);

  if (!cached) {
    return;
  }

  localStorage.setItem(cacheKey(pubkey), JSON.stringify({ ...cached, history: entries }));
}
