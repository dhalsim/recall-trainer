import type { Nip65Relays } from '../nostr/nip65';
import { logger } from '../../utils/logger';
const { error } = logger();

export type StoredProfile = {
  pubkey: string;
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  lud16?: string;
  created_at: number;
  /** Relays the kind:0 event was seen on. */
  relays: string[];
  nip65: Nip65Relays | null;
  /** Unix seconds when this record was last fetched from relays. */
  fetchedAt: number;
};

export function parseProfileContent(json: string): Partial<StoredProfile> {
  try {
    const obj = JSON.parse(json);

    if (typeof obj !== 'object' || obj === null) {
      return {};
    }

    const result: Partial<StoredProfile> = {};

    if (typeof obj.name === 'string') {
      result.name = obj.name;
    }

    if (typeof obj.display_name === 'string') {
      result.display_name = obj.display_name;
    }

    if (typeof obj.picture === 'string') {
      result.picture = obj.picture;
    }

    if (typeof obj.about === 'string') {
      result.about = obj.about;
    }

    if (typeof obj.nip05 === 'string') {
      result.nip05 = obj.nip05;
    }

    if (typeof obj.lud16 === 'string') {
      result.lud16 = obj.lud16;
    }

    return result;
  } catch (err) {
    error('[profileParse] Failed to parse profile content:', err);

    return {};
  }
}

export function getDisplayName(profile: StoredProfile | undefined, pubkey: string): string {
  return profile?.display_name || profile?.name || `${pubkey.slice(0, 8)}…`;
}

export function truncatePubkey(pubkey: string, len = 12): string {
  if (pubkey.length <= len) {
    return pubkey;
  }

  return pubkey.slice(0, 6) + '…' + pubkey.slice(-4);
}
