import type { Event } from 'nostr-tools';
import { createSignal } from 'solid-js';

import { logger } from '../../utils/logger';
import { pool, PROFILE_RELAYS, queryChunkedParallel } from '../../utils/nostr';
import { toReadWriteRelays } from '../nostr/nip65';

import type { StoredProfile } from './profileParse';
import { parseProfileContent } from './profileParse';
const { error } = logger();

// ---------------------------------------------------------------------------
// IDB
// ---------------------------------------------------------------------------

const DB_NAME = 'recall-trainer-profiles';
const DB_VERSION = 1;
const STORE_NAME = 'profiles';

function openProfileDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'pubkey' });
      }
    };
  });
}

function getProfilesFromIDB(
  db: IDBDatabase,
  pubkeys: string[],
): Promise<Map<string, StoredProfile>> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const result = new Map<string, StoredProfile>();
    let pending = pubkeys.length;

    if (pending === 0) {
      resolve(result);

      return;
    }

    for (const pk of pubkeys) {
      const req = store.get(pk);

      req.onsuccess = () => {
        const row = req.result as StoredProfile | undefined;

        if (row) {
          result.set(pk, row);
        }

        pending--;

        if (pending === 0) {
          resolve(result);
        }
      };
    }

    tx.onerror = () => reject(tx.error);
  });
}

function putProfiles(db: IDBDatabase, profiles: StoredProfile[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (const p of profiles) {
      store.put(p);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Signal Map (reactive in-memory cache)
// ---------------------------------------------------------------------------

const [profileMap, setProfileMap] = createSignal<Map<string, StoredProfile>>(new Map());

function updateSignalMap(entries: StoredProfile[]): void {
  setProfileMap((prev) => {
    const next = new Map(prev);

    for (const p of entries) {
      next.set(p.pubkey, p);
    }

    return next;
  });
}

// ---------------------------------------------------------------------------
// Relay fetch (kinds 0 + 10002, deduped by pubkey)
// ---------------------------------------------------------------------------

function fetchProfilesFromRelays(pubkeys: string[]): Promise<StoredProfile[]> {
  if (pubkeys.length === 0) {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    const bestKind0 = new Map<string, Event>();
    const bestKind10002 = new Map<string, Event>();
    const receivedEventRelayMap = new Map<string, string[]>();

    const filter = {
      kinds: [0, 10002],
      authors: pubkeys,
      limit: Math.max(pubkeys.length * 3, 500),
    };

    const sub = pool.subscribe(PROFILE_RELAYS, filter, {
      receivedEvent: (relay, id) => {
        const relays = receivedEventRelayMap.get(id) ?? [];

        receivedEventRelayMap.set(id, [...relays, relay.url]);
      },
      onevent(ev: Event) {
        if (ev.kind === 0) {
          const existing = bestKind0.get(ev.pubkey);

          if (!existing || ev.created_at > existing.created_at) {
            bestKind0.set(ev.pubkey, ev);
          }
        } else if (ev.kind === 10002) {
          const existing = bestKind10002.get(ev.pubkey);

          if (!existing || ev.created_at > existing.created_at) {
            bestKind10002.set(ev.pubkey, ev);
          }
        }
      },
      oneose() {
        sub.close('eose');

        const now = Math.floor(Date.now() / 1000);
        const results: StoredProfile[] = [];

        for (const [pubkey, ev] of bestKind0) {
          const parsed = parseProfileContent(ev.content);
          const nip65Ev = bestKind10002.get(pubkey);

          results.push({
            pubkey,
            ...parsed,
            created_at: ev.created_at,
            relays: receivedEventRelayMap.get(ev.id) ?? [],
            nip65: nip65Ev ? toReadWriteRelays(nip65Ev.tags) : null,
            fetchedAt: now,
          });
        }

        for (const [pubkey, ev] of bestKind10002) {
          if (bestKind0.has(pubkey)) {
            continue;
          }

          results.push({
            pubkey,
            created_at: 0,
            relays: [],
            nip65: toReadWriteRelays(ev.tags),
            fetchedAt: now,
          });
        }

        resolve(results);
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Queue + debounced flush
// ---------------------------------------------------------------------------

const PROFILE_MAX_AGE_S = 3600;
const FLUSH_DEBOUNCE_MS = 300;
const CHUNK_SIZE = 80;
const CONCURRENCY = 3;

const fetchQueue = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function enqueue(pubkey: string): void {
  const cached = profileMap().get(pubkey);

  if (cached) {
    const now = Math.floor(Date.now() / 1000);

    if (now - cached.fetchedAt < PROFILE_MAX_AGE_S) {
      return;
    }
  }

  fetchQueue.add(pubkey);

  if (!flushTimer) {
    flushTimer = setTimeout(flushQueue, FLUSH_DEBOUNCE_MS);
  }
}

async function flushQueue(): Promise<void> {
  flushTimer = null;

  const batch = [...fetchQueue];
  fetchQueue.clear();

  const now = Math.floor(Date.now() / 1000);
  const map = profileMap();

  const notInCache = batch.filter((pk) => !map.has(pk));

  const staleInCache = batch.filter((pk) => {
    const p = map.get(pk);

    return p != null && now - p.fetchedAt >= PROFILE_MAX_AGE_S;
  });

  let toFetch: string[] = [...staleInCache];

  if (notInCache.length > 0) {
    try {
      const db = await openProfileDB();

      try {
        const fromIDB = await getProfilesFromIDB(db, notInCache);

        for (const pk of notInCache) {
          const stored = fromIDB.get(pk);

          if (stored && now - stored.fetchedAt < PROFILE_MAX_AGE_S) {
            updateSignalMap([stored]);
          } else {
            toFetch.push(pk);
          }
        }
      } finally {
        db.close();
      }
    } catch (err) {
      error('[profileCache] flushQueue IDB error:', err);
      toFetch = [...toFetch, ...notInCache];
    }
  }

  if (toFetch.length === 0) {
    return;
  }

  try {
    const db = await openProfileDB();

    const fetched = await queryChunkedParallel(toFetch, CHUNK_SIZE, CONCURRENCY, (chunk) =>
      fetchProfilesFromRelays(chunk),
    );

    if (fetched.length > 0) {
      await putProfiles(db, fetched);
      updateSignalMap(fetched);
    }

    db.close();
  } catch (err) {
    error('[profileCache] flushQueue fetch error:', err);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a profile from the reactive cache. Returns undefined on cache miss
 * and enqueues a background fetch. If cached but stale, returns stale data
 * and enqueues a background refresh. Components re-render when the profile arrives.
 */
export function getProfile(pubkey: string): StoredProfile | undefined {
  const cached = profileMap().get(pubkey);

  if (!cached) {
    enqueue(pubkey);

    return undefined;
  }

  const now = Math.floor(Date.now() / 1000);

  if (now - cached.fetchedAt >= PROFILE_MAX_AGE_S) {
    enqueue(pubkey);
  }

  return cached;
}

/**
 * Bulk-enqueue pubkeys for background fetching.
 * Useful on component mount to preload all profiles at once.
 */
export function prefetchProfiles(pubkeys: string[]): void {
  for (const pk of pubkeys) {
    enqueue(pk);
  }
}
