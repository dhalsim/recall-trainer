/**
 * LocalStorage cache for the decrypted NIP-60 wallet data (wallet content + proofs by mint).
 * Allows instant hydration on dialog open; Nostr relay sync runs in the background.
 */

import type { Proof } from '@cashu/cashu-ts';

import { logger } from '../../utils/logger';

import type { Nip60WalletContent } from './nip60';

const CACHE_KEY_PREFIX = 'recall-trainer-wallet-cache-';
const { error } = logger();

type CachedWallet = {
  walletContent: Nip60WalletContent;
  proofsByMint: Record<string, Proof[]>;
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
): void {
  try {
    const serializable: CachedWallet = {
      walletContent,
      proofsByMint: Object.fromEntries(proofsByMint),
    };

    localStorage.setItem(cacheKey(pubkey), JSON.stringify(serializable));
  } catch (err) {
    error('[walletCache] Failed to write:', err);
  }
}

export function proofMapFromCache(cached: CachedWallet): Map<string, Proof[]> {
  return new Map(Object.entries(cached.proofsByMint));
}

export function clearWalletCache(pubkey: string): void {
  try {
    localStorage.removeItem(cacheKey(pubkey));
  } catch (err) {
    error('[walletCache] Failed to clear:', err);
  }
}
