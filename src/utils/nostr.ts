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

/**
 * Run a query function over items in chunks, with up to `concurrency` chunks in flight.
 * Returns flattened results in chunk order.
 */
export async function queryChunkedParallel<T>(
  items: string[],
  chunkSize: number,
  concurrency: number,
  queryFn: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const chunks: string[][] = [];

  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }

  if (chunks.length === 0) {
    return [];
  }

  const results: T[][] = new Array(chunks.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    const index = nextIndex++;

    if (index >= chunks.length) {
      return;
    }

    results[index] = await queryFn(chunks[index]);
    await runNext();
  }

  const workers = Array.from({ length: Math.min(concurrency, chunks.length) }, () => runNext());

  await Promise.all(workers);

  return results.flat();
}
