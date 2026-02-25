import { generateMnemonic, mnemonicToSeed } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

import { logger } from '../../utils/logger';

const uint8ArrayToBase64 = (uint8Array: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }

  return btoa(binary);
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const uint8Array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    uint8Array[i] = binary.charCodeAt(i);
  }

  return uint8Array;
};

const SEED_CACHE_PREFIX = 'recall-trainer-wallet-seed-';
const { error: logError } = logger();

export async function generateAndConvertMnemonic(): Promise<{
  mnemonic: string;
  seed: Uint8Array;
}> {
  const mnemonic = generateMnemonic(wordlist, 128);
  const seed = await mnemonicToSeed(mnemonic);

  return { mnemonic, seed };
}

export async function convertMnemonicToSeed(mnemonic: string): Promise<Uint8Array> {
  return mnemonicToSeed(mnemonic);
}

export function saveSeedToCache(
  pubkey: string,
  seed: Uint8Array,
  encryptFn: (pubkey: string, plaintext: string) => Promise<string>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const seedBase64 = uint8ArrayToBase64(seed);
      const encrypted = encryptFn(pubkey, seedBase64);

      encrypted
        .then((ciphertext) => {
          localStorage.setItem(`${SEED_CACHE_PREFIX}${pubkey}`, ciphertext);
          resolve();
        })
        .catch(reject);
    } catch (err) {
      logError('[seed] Failed to save seed:', err);
      reject(err);
    }
  });
}

export async function loadSeedFromCache(
  pubkey: string,
  decryptFn: (pubkey: string, ciphertext: string) => Promise<string>,
): Promise<Uint8Array | null> {
  try {
    const ciphertext = localStorage.getItem(`${SEED_CACHE_PREFIX}${pubkey}`);

    if (!ciphertext) {
      return null;
    }

    const seedBase64 = await decryptFn(pubkey, ciphertext);
    const seed = base64ToUint8Array(seedBase64);

    return seed;
  } catch (err) {
    logError('[seed] Failed to load seed:', err);

    return null;
  }
}

export function clearSeedCache(pubkey: string): void {
  try {
    localStorage.removeItem(`${SEED_CACHE_PREFIX}${pubkey}`);
  } catch (err) {
    logError('[seed] Failed to clear seed:', err);
  }
}
