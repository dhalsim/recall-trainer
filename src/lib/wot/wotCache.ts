/**
 * IndexedDB-backed cache for Web of Trust (kind:3 follow lists).
 * One store keyed by pubkey; indexes on depth and rootPubkey for stats and cleanup.
 */

const DB_NAME = 'recall-trainer-wot';
const DB_VERSION = 1;
const FOLLOW_LISTS_STORE = 'follow_lists';

export type FollowEntry = {
  pubkey: string;
  relayHint?: string;
  nickname?: string;
};

export type StoredFollowList = {
  pubkey: string;
  rootPubkey: string;
  follows: FollowEntry[];
  created_at: number;
  depth: number;
};

export function openWotDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(FOLLOW_LISTS_STORE)) {
        const store = db.createObjectStore(FOLLOW_LISTS_STORE, { keyPath: 'pubkey' });
        store.createIndex('depth', 'depth', { unique: false });
        store.createIndex('rootPubkey', 'rootPubkey', { unique: false });
      }
    };
  });
}

export function putFollowLists(db: IDBDatabase, records: StoredFollowList[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLLOW_LISTS_STORE, 'readwrite');
    const store = tx.objectStore(FOLLOW_LISTS_STORE);

    for (const record of records) {
      store.put(record);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function getDepth(
  db: IDBDatabase,
  pubkey: string,
  rootPubkey?: string,
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLLOW_LISTS_STORE, 'readonly');
    const req = tx.objectStore(FOLLOW_LISTS_STORE).get(pubkey);

    req.onsuccess = () => {
      const row = req.result as StoredFollowList | undefined;

      if (!row) {
        resolve(null);

        return;
      }

      if (rootPubkey != null && row.rootPubkey !== rootPubkey) {
        resolve(null);

        return;
      }

      resolve(row.depth);
    };

    req.onerror = () => reject(req.error);
  });
}

export function getDepths(
  db: IDBDatabase,
  pubkeys: string[],
  rootPubkey?: string,
): Promise<Map<string, number>> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLLOW_LISTS_STORE, 'readonly');
    const store = tx.objectStore(FOLLOW_LISTS_STORE);
    const result = new Map<string, number>();
    let pending = pubkeys.length;

    if (pending === 0) {
      resolve(result);

      return;
    }

    for (const pubkey of pubkeys) {
      const req = store.get(pubkey);

      req.onsuccess = () => {
        const row = req.result as StoredFollowList | undefined;

        if (row != null && (rootPubkey == null || row.rootPubkey === rootPubkey)) {
          result.set(pubkey, row.depth);
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

export type WotStats = {
  depth0: number;
  depth1: number;
  depth2: number;
};

export function getStats(db: IDBDatabase, rootPubkey: string): Promise<WotStats> {
  return new Promise((resolve, reject) => {
    const stats: WotStats = { depth0: 0, depth1: 0, depth2: 0 };

    const index = db
      .transaction(FOLLOW_LISTS_STORE, 'readonly')
      .objectStore(FOLLOW_LISTS_STORE)
      .index('rootPubkey');

    const req = index.openCursor(IDBKeyRange.only(rootPubkey));

    req.onsuccess = () => {
      const cursor = req.result;

      if (cursor) {
        const row = cursor.value as StoredFollowList;

        if (row.depth === 0) {
          stats.depth0++;
        } else if (row.depth === 1) {
          stats.depth1++;
        } else if (row.depth === 2) {
          stats.depth2++;
        }

        cursor.continue();
      } else {
        resolve(stats);
      }
    };

    req.onerror = () => reject(req.error);
  });
}

export function clearForRoot(db: IDBDatabase, rootPubkey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLLOW_LISTS_STORE, 'readwrite');
    const index = tx.objectStore(FOLLOW_LISTS_STORE).index('rootPubkey');
    const req = index.openCursor(IDBKeyRange.only(rootPubkey));

    req.onsuccess = () => {
      const cursor = req.result;

      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };

    req.onerror = () => reject(req.error);
  });
}

export function clearAll(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLLOW_LISTS_STORE, 'readwrite');
    const req = tx.objectStore(FOLLOW_LISTS_STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
