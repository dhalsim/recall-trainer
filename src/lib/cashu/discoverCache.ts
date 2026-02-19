/**
 * IndexedDB-backed cache for NIP-87 mints and reviews.
 * Hydrate a SolidJS store from DB on open, then background-sync from Nostr and NUT-06.
 */

import type { GetInfoResponse } from '@cashu/cashu-ts';
import type { Event } from 'nostr-tools';

import { getMintInfo } from './mintInfo';
import {
  fetchRawMintEvents,
  fetchRawReviewEvents,
  parseMintInfoEvent,
  parseReviewEvent,
} from './nip87';
import type { Nip87Review } from './nip87';

const DB_NAME = 'recall-trainer-discover';
const DB_VERSION = 1;
const MINT_EVENTS_STORE = 'mint_events';
const REVIEW_EVENTS_STORE = 'review_events';
const MINT_INFO_STORE = 'mint_info';

export type DiscoverMintData = {
  url: string;
  mintPubkey: string;
  nuts: string[];
  network: string;
  eventId: string;
  reviews: Nip87Review[];
  reviewCount: number;
  avgRating: number | null;
  mintInfo: GetInfoResponse | null;
};

export type DiscoverStore = {
  mints: Record<string, DiscoverMintData>;
  loading: boolean;
  syncing: boolean;
  error: string | null;
};

type StoredMintEvent = {
  eventId: string;
  url: string;
  mintPubkey: string;
  nuts: string[];
  network: string;
  created_at: number;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(MINT_EVENTS_STORE)) {
        const mintStore = db.createObjectStore(MINT_EVENTS_STORE, { keyPath: 'eventId' });
        mintStore.createIndex('url', 'url', { unique: false });
      }

      if (!db.objectStoreNames.contains(REVIEW_EVENTS_STORE)) {
        const reviewStore = db.createObjectStore(REVIEW_EVENTS_STORE, { keyPath: 'eventId' });
        reviewStore.createIndex('mintUrl', 'mintUrl', { unique: false });
      }

      if (!db.objectStoreNames.contains(MINT_INFO_STORE)) {
        db.createObjectStore(MINT_INFO_STORE, { keyPath: 'url' });
      }
    };
  });
}

export function addMintEvents(db: IDBDatabase, events: Event[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MINT_EVENTS_STORE, 'readwrite');
    const store = tx.objectStore(MINT_EVENTS_STORE);

    for (const ev of events) {
      const parsed = parseMintInfoEvent(ev);

      if (parsed) {
        const record: StoredMintEvent = {
          eventId: parsed.eventId,
          url: parsed.url,
          mintPubkey: parsed.mintPubkey,
          nuts: parsed.nuts,
          network: parsed.network,
          created_at: ev.created_at,
        };

        store.put(record);
      }
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function addReviewEvents(db: IDBDatabase, events: Event[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REVIEW_EVENTS_STORE, 'readwrite');
    const store = tx.objectStore(REVIEW_EVENTS_STORE);

    for (const ev of events) {
      const review = parseReviewEvent(ev);

      if (review) {
        const record: Nip87Review & { mintUrl?: string } = {
          ...review,
          mintUrl: review.mintUrl,
        };

        store.put(record);
      }
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function setMintInfo(db: IDBDatabase, url: string, info: GetInfoResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MINT_INFO_STORE, 'readwrite');
    const store = tx.objectStore(MINT_INFO_STORE);
    store.put({ url, ...info });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

export function aggregateFromDB(db: IDBDatabase): Promise<Record<string, DiscoverMintData>> {
  return Promise.all([
    getAll<StoredMintEvent>(db, MINT_EVENTS_STORE),
    getAll<Nip87Review & { mintUrl?: string }>(db, REVIEW_EVENTS_STORE),
    getAll<{ url: string } & GetInfoResponse>(db, MINT_INFO_STORE),
  ]).then(([mintEvents, reviewEvents, mintInfoList]) => {
    const infoByUrl = new Map<string, GetInfoResponse>();

    for (const row of mintInfoList) {
      const { url, ...info } = row;

      infoByUrl.set(url, info as GetInfoResponse);
    }

    const mintsByUrl = new Map<string, StoredMintEvent>();

    const sortedMints = [...mintEvents].sort((a, b) => b.created_at - a.created_at);

    for (const m of sortedMints) {
      if (!mintsByUrl.has(m.url)) {
        mintsByUrl.set(m.url, m);
      }
    }

    const reviewsByMintUrl = new Map<string, (Nip87Review & { mintUrl?: string })[]>();

    for (const r of reviewEvents) {
      const url = r.mintUrl ?? '';

      if (!url.startsWith('http')) {
        continue;
      }

      const list = reviewsByMintUrl.get(url) ?? [];
      list.push(r);
      reviewsByMintUrl.set(url, list);
    }

    const result: Record<string, DiscoverMintData> = {};

    for (const [url, m] of mintsByUrl) {
      const rawReviews = reviewsByMintUrl.get(url) ?? [];
      const byAuthor = new Map<string, Nip87Review>();

      const sortedReviews = [...rawReviews].sort((a, b) => b.created_at - a.created_at);

      for (const r of sortedReviews) {
        const author = r.author;

        if (!byAuthor.has(author)) {
          byAuthor.set(author, r);
        }
      }

      const reviews = Array.from(byAuthor.values());
      const withRating = reviews.filter((r) => r.rating != null);

      const avgRating =
        withRating.length > 0
          ? withRating.reduce((sum, r) => sum + (r.rating ?? 0), 0) / withRating.length
          : null;

      result[url] = {
        url,
        mintPubkey: m.mintPubkey,
        nuts: m.nuts,
        network: m.network,
        eventId: m.eventId,
        reviews,
        reviewCount: reviews.length,
        avgRating,
        mintInfo: infoByUrl.get(url) ?? null,
      };
    }

    return result;
  });
}

export function loadFromDB(): Promise<Record<string, DiscoverMintData>> {
  return openDB().then((db) => aggregateFromDB(db).finally(() => db.close()));
}

export type BackgroundSyncResult = {
  mints: Record<string, DiscoverMintData>;
};

/**
 * Sync mints and reviews from Nostr into IDB, then refresh NUT-06 per URL.
 * Returns mints immediately (from IDB after Nostr write). NUT-06 results stream via onMintInfo.
 */
export async function backgroundSync(
  relays: string[],
  onMintInfo?: (url: string, info: GetInfoResponse) => void,
): Promise<BackgroundSyncResult> {
  const db = await openDB();

  try {
    const [rawMintEvents, rawReviewEvents] = await Promise.all([
      fetchRawMintEvents(relays),
      fetchRawReviewEvents(relays),
    ]);

    await Promise.all([addMintEvents(db, rawMintEvents), addReviewEvents(db, rawReviewEvents)]);

    const mints = await aggregateFromDB(db);

    const urls = Object.keys(mints);

    for (const url of urls) {
      getMintInfo(url).then((info) => {
        if (info) {
          openDB()
            .then((d) => setMintInfo(d, url, info).finally(() => d.close()))
            .catch((e) => console.error('discoverCache setMintInfo', url, e));

          onMintInfo?.(url, info);
        }
      });
    }

    return { mints };
  } finally {
    db.close();
  }
}
