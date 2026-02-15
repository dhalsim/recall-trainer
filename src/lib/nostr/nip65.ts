import type { Event, Filter } from 'nostr-tools';
import { createSignal } from 'solid-js';

const PROFILE_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.nos.social',
  'wss://user.kindpag.es',
  'wss://relay.nostr.band',
];

const CACHE_KEY_PREFIX = 'nip65-relays-';

export type Nip65Relays = {
  readRelays: string[];
  writeRelays: string[];
  flatRelays: { relay: string; read: boolean; write: boolean }[];
};

type Nip65Pool = {
  subscribe(
    relays: string[],
    filter: Filter,
    params: { onevent: (event: Event) => void; onclose?: (reasons: string[]) => void },
  ): { close: (reason?: string) => void };
};

// --- Internal signal ---

type Nip65StoreData = {
  pubkey: string;
  relays: Nip65Relays;
  createdAt: number;
};

const [nip65Signal, setNip65Signal] = createSignal<Nip65StoreData | null>(null);

// --- Cache (localStorage, key: nip65-relays-${pubkey}) ---

function getCacheKey(pubkey: string): string {
  return `${CACHE_KEY_PREFIX}${pubkey}`;
}

function readCache(pubkey: string): Nip65StoreData | null {
  try {
    const raw = localStorage.getItem(getCacheKey(pubkey));

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<Nip65StoreData>;

    if (
      typeof parsed.createdAt !== 'number' ||
      !parsed.relays ||
      !Array.isArray(parsed.relays.readRelays)
    ) {
      return null;
    }

    return { pubkey, relays: parsed.relays, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

function writeCache(pubkey: string, data: Nip65StoreData | null): void {
  try {
    if (data) {
      localStorage.setItem(
        getCacheKey(pubkey),
        JSON.stringify({ relays: data.relays, createdAt: data.createdAt }),
      );
    } else {
      localStorage.removeItem(getCacheKey(pubkey));
    }
  } catch (err) {
    console.error('[nip65] Failed to write cache:', err);
  }
}

// --- Internal setter: signal then cache ---

function setRelays(data: Nip65StoreData | null): void {
  if (data) {
    setNip65Signal(data);
    writeCache(data.pubkey, data);
  } else {
    const prev = nip65Signal();

    setNip65Signal(null);

    if (prev) {
      writeCache(prev.pubkey, null);
    }
  }
}

// --- Helpers ---

function toReadWriteRelays(tags: string[][]): Nip65Relays {
  const relayTags = tags.filter((tag) => tag[0] === 'r');
  const readRelays = relayTags.filter((tag) => tag[2] === 'read' || !tag[2]).map((tag) => tag[1]);
  const writeRelays = relayTags.filter((tag) => tag[2] === 'write' || !tag[2]).map((tag) => tag[1]);

  const flatRelays = relayTags.map((tag) => ({
    relay: tag[1],
    read: tag[2] === 'read' || !tag[2],
    write: tag[2] === 'write' || !tag[2],
  }));

  return { readRelays, writeRelays, flatRelays };
}

// --- Public API ---

/**
 * Get NIP-65 relays for the given pubkey (reactive).
 * Checks signal first; if null, hydrates from localStorage cache.
 * All UI and relay code should read relays from this function.
 */
export function getRelays(pubkey: string): Nip65Relays | null {
  const current = nip65Signal();

  if (current?.pubkey === pubkey) {
    return current.relays;
  }

  const cached = readCache(pubkey);

  if (cached) {
    setNip65Signal(cached);

    return cached.relays;
  }

  return null;
}

/**
 * Clear in-memory relay data only (signal). Does not remove localStorage cache.
 * Call on logout so next login can rehydrate from cache.
 */
export function clearRelays(): void {
  setNip65Signal(null);
}

/**
 * Subscribe to NIP-65 (kind 10002) for the given pubkey.
 * Hydrates from cache immediately, then keeps the subscription open.
 * On each event: if newer than current created_at, updates signal then cache.
 * Returns unsubscribe function (call on logout).
 */
export function subscribeRelays(pool: Nip65Pool, pubkey: string): () => void {
  // Hydrate from cache if signal is empty for this pubkey
  getRelays(pubkey);

  const sub = pool.subscribe(
    PROFILE_RELAYS,
    { kinds: [10002], authors: [pubkey] },
    {
      onevent: (event) => {
        const current = nip65Signal();

        if (current?.pubkey === pubkey && event.created_at <= current.createdAt) {
          return;
        }

        setRelays({
          pubkey,
          relays: toReadWriteRelays(event.tags),
          createdAt: event.created_at,
        });
      },
      onclose: (reasons) => {
        const nonNormal = reasons.filter(
          (r) =>
            !['closed automatically on eose', 'closed by client', 'closed by caller'].includes(r),
        );

        if (nonNormal.length > 0) {
          console.log('[nip65] Subscription closed:', nonNormal);
        }
      },
    },
  );

  return () => sub.close();
}
