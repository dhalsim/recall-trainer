import type { Event } from 'nostr-tools';

import { pool, PROFILE_RELAYS, queryChunkedParallel } from '../../utils/nostr';
import { writeSyncMeta } from '../syncMeta';

import type { FollowEntry, StoredFollowList } from './wotCache';
import { clearForRoot, openWotDB, putFollowLists } from './wotCache';

const KIND_CONTACTS = 3;

function parseFollowList(ev: Event): FollowEntry[] {
  const follows: FollowEntry[] = [];

  for (const tag of ev.tags) {
    if (tag[0] !== 'p' || !tag[1]) {
      continue;
    }

    follows.push({
      pubkey: tag[1],
      relayHint: tag[2],
      nickname: tag[3],
    });
  }

  return follows;
}

function eventToStoredFollowList(ev: Event, rootPubkey: string, depth: number): StoredFollowList {
  return {
    pubkey: ev.pubkey,
    rootPubkey,
    follows: parseFollowList(ev),
    created_at: ev.created_at,
    depth,
  };
}

async function fetchKind3ForAuthors(relays: string[], authors: string[]): Promise<Event[]> {
  if (authors.length === 0) {
    return [];
  }

  const filter = {
    kinds: [KIND_CONTACTS],
    authors,
    limit: Math.max(authors.length * 2, 500),
  };

  return new Promise((resolve) => {
    const bestByAuthor = new Map<string, Event>();

    pool.subscribeEose(relays, filter, {
      onevent(ev: Event) {
        const existing = bestByAuthor.get(ev.pubkey);

        if (!existing || ev.created_at > existing.created_at) {
          bestByAuthor.set(ev.pubkey, ev);
        }
      },
      onclose() {
        resolve(Array.from(bestByAuthor.values()));
      },
    });
  });
}

export type CrawlParams = {
  rootPubkey: string;
  maxDepth?: number;
  chunkSize?: number;
  concurrency?: number;
  onProgress?: (msg: string) => void;
};

/**
 * Full BFS crawl of follow graph from rootPubkey. Clears existing data for this root,
 * fetches kind:3 at each depth (chunked, parallel), stores in IDB, then writes sync meta.
 */
export async function crawlFollowGraph(params: CrawlParams): Promise<void> {
  const { rootPubkey, maxDepth = 2, chunkSize = 100, concurrency = 3, onProgress } = params;

  const relays = PROFILE_RELAYS;
  const db = await openWotDB();

  try {
    onProgress?.('Clearing previous data…');
    await clearForRoot(db, rootPubkey);

    const seen = new Set<string>([rootPubkey]);
    let currentLevel = new Set<string>([rootPubkey]);
    const allStored: StoredFollowList[] = [];

    for (let depth = 0; depth < maxDepth; depth++) {
      const authors = Array.from(currentLevel);

      if (depth === 0) {
        onProgress?.(`Fetching your follow list…`);
        const events = await fetchKind3ForAuthors(relays, authors);

        if (events.length === 0) {
          const selfRecord: StoredFollowList = {
            pubkey: rootPubkey,
            rootPubkey,
            follows: [],
            created_at: Math.floor(Date.now() / 1000),
            depth: 0,
          };

          allStored.push(selfRecord);
          await putFollowLists(db, allStored);
          writeSyncMeta(rootPubkey, 'wot', Math.floor(Date.now() / 1000));

          return;
        }

        for (const ev of events) {
          const record = eventToStoredFollowList(ev, rootPubkey, 0);
          allStored.push(record);
          for (const f of record.follows) {
            seen.add(f.pubkey);
          }
        }
      } else {
        const toFetch = authors.filter((pk) => !allStored.some((r) => r.pubkey === pk));

        if (toFetch.length > 0) {
          onProgress?.(`Fetching depth ${depth} (${toFetch.length} contacts)…`);

          const events = await queryChunkedParallel(toFetch, chunkSize, concurrency, (chunk) =>
            fetchKind3ForAuthors(relays, chunk),
          );

          for (const ev of events) {
            const record = eventToStoredFollowList(ev, rootPubkey, depth);
            allStored.push(record);

            if (depth < maxDepth - 1) {
              for (const f of record.follows) {
                seen.add(f.pubkey);
              }
            }
          }
        }
      }

      const nextLevel = new Set<string>();

      for (const r of allStored) {
        if (r.depth !== depth) {
          continue;
        }

        for (const f of r.follows) {
          nextLevel.add(f.pubkey);
        }
      }

      if (depth < maxDepth - 1) {
        currentLevel = nextLevel;
      } else {
        for (const pk of nextLevel) {
          if (seen.has(pk)) {
            continue;
          }

          seen.add(pk);

          allStored.push({
            pubkey: pk,
            rootPubkey,
            follows: [],
            created_at: 0,
            depth: maxDepth,
          });
        }
      }
    }

    if (allStored.length > 0) {
      const batchSize = 500;

      for (let i = 0; i < allStored.length; i += batchSize) {
        await putFollowLists(db, allStored.slice(i, i + batchSize));
      }
    }

    writeSyncMeta(rootPubkey, 'wot', Math.floor(Date.now() / 1000));
    onProgress?.('Done.');
  } finally {
    db.close();
  }
}
