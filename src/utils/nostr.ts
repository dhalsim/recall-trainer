import { generateSecretKey, getPublicKey, SimplePool } from 'nostr-tools';

/** Singleton relay pool shared across the entire app. */
export const pool = new SimplePool();

/**
 * Create a new Nostr key pair (ephemeral or local use).
 * secret is raw bytes; use bytesToHex(secret) for storage if needed.
 */
export function createKeyPair(): { secret: Uint8Array; pubkey: string } {
  const secret = generateSecretKey();
  const pubkey = getPublicKey(secret);

  return { secret, pubkey };
}

/**
 * Generate a random hex string of the given length (number of hex chars).
 */
export function generateRandomHexString(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

/**
 * Exhaustive check helper for switch/union types. Throws if value is not handled.
 */
export function assertUnreachable(value: never): never {
  throw new Error(`Unreachable: ${String(value)}`);
}

export const DEFAULT_READ_RELAYS = [
  'wss://relay.nostr.band',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://nostr.bitcoiner.social',
  'wss://nostr.mom',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.nos.social',
];

export const DEFAULT_WRITE_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
];

export const PROFILE_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.nos.social',
  'wss://user.kindpag.es',
  'wss://relay.nostr.band',
];
