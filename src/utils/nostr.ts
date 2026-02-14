import { generateSecretKey, getPublicKey } from 'nostr-tools';

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
