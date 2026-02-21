/**
 * Generalized sync metadata per user.
 * Single localStorage key per pubkey; value is an object with typed sync ids and timestamps (seconds).
 */
import { logger } from '../utils/logger';

export type SyncMetaId = 'nip78' | 'discoverMints' | 'wot' | 'wallet';

export type SyncMeta = Partial<Record<SyncMetaId, number>>;

const SYNC_META_KEY_PREFIX = 'recall-trainer-sync-meta-';
const { error } = logger();

function getSyncMetaKey(pubkey: string): string {
  return `${SYNC_META_KEY_PREFIX}${pubkey}`;
}

/**
 * Read sync meta for the given pubkey. Returns null if missing or invalid.
 * All timestamps in the returned object are in seconds (Unix).
 */
export function readSyncMeta(pubkey: string): SyncMeta | null {
  try {
    const raw = localStorage.getItem(getSyncMetaKey(pubkey));

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed as SyncMeta;
  } catch {
    return null;
  }
}

/**
 * Write a sync timestamp for the given sync id. Merges with existing meta (other keys preserved).
 * timeSeconds: Unix timestamp in seconds.
 */
export function writeSyncMeta(pubkey: string, syncId: SyncMetaId, timeSeconds: number): void {
  try {
    const key = getSyncMetaKey(pubkey);
    const current = readSyncMeta(pubkey) ?? {};
    const next: SyncMeta = { ...current, [syncId]: timeSeconds };
    localStorage.setItem(key, JSON.stringify(next));
  } catch (err) {
    error('[syncMeta] Failed to write:', err);
  }
}
