import type { Event, Filter } from 'nostr-tools';

import { logger } from '../../utils/logger';
import { pool } from '../../utils/nostr';

/** NIP-87: Cashu mint announcement (kind 38172). */
export const NIP87_MINT_KIND = 38172;

/** NIP-87: Ecash mint recommendation (kind 38000). */
export const NIP87_RECOMMENDATION_KIND = 38000;
const { error: logError } = logger();

export type Nip87MintInfo = {
  url: string;
  mintPubkey: string;
  nuts: string[];
  network: string;
  eventId: string;
};

export type Nip87Review = {
  content: string;
  mintUrl?: string;
  author: string;
  eventId: string;
  created_at: number;
  /** Parsed 1–5 from `rating` tag or content (e.g. [X/5]), or null. */
  rating: number | null;
};

function getTag(ev: Event, name: string): string | undefined {
  const tag = ev.tags.find((t) => t[0] === name);

  return tag?.[1];
}

function getTagAll(ev: Event, name: string): string[] {
  return ev.tags.filter((t) => t[0] === name).map((t) => t[1] ?? '');
}

/**
 * Parse rating 1–5 from recommendation event: `rating` tag first, then content patterns.
 * Supports [X/5] at start, [X / 5] at end, and fallbacks like "rating: 4" or "4/5".
 */
export function parseRatingFromEvent(ev: Event): number | null {
  const ratingTag = getTag(ev, 'rating');

  if (ratingTag) {
    const n = Number.parseInt(ratingTag, 10);

    if (n >= 1 && n <= 5) {
      return n;
    }
  }

  return parseRatingFromContent(ev.content ?? '');
}

/**
 * Parse rating 1–5 from review content. Returns null if not found or invalid.
 */
export function parseRatingFromContent(content: string): number | null {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // [X/5] or [X / 5] at start
  const atStart = content.match(/^\s*\[([1-5])\s*\/\s*5\]/);

  if (atStart) {
    const n = Number.parseInt(atStart[1], 10);

    if (n >= 1 && n <= 5) {
      return n;
    }
  }

  // [X / 5] anywhere (e.g. at end)
  const bracket = content.match(/\s*\[([1-5])\s*\/\s*5\]\s*/);

  if (bracket) {
    const n = Number.parseInt(bracket[1], 10);

    if (n >= 1 && n <= 5) {
      return n;
    }
  }

  // Fallback: "rating: 4", "4/5", "4 star"
  const fallback = content.match(/rating[:\s]*([1-5])|([1-5])\/5|([1-5])\s*star/i);

  if (fallback) {
    const digit = fallback[1] ?? fallback[2] ?? fallback[3];

    if (digit) {
      const n = Number.parseInt(digit, 10);

      if (n >= 1 && n <= 5) {
        return n;
      }
    }
  }

  return null;
}

/**
 * Parse a kind 38172 Cashu mint announcement into Nip87MintInfo.
 * Returns null if invalid or URL does not start with http.
 */
export function parseMintInfoEvent(ev: Event): Nip87MintInfo | null {
  if (ev.kind !== NIP87_MINT_KIND) {
    return null;
  }

  const url = getTag(ev, 'u');

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return null;
  }

  const mintPubkey = getTag(ev, 'd') ?? '';
  const nutsTag = getTag(ev, 'nuts');

  const nuts = nutsTag
    ? nutsTag
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const network = getTag(ev, 'n') ?? '';

  return {
    url,
    mintPubkey,
    nuts,
    network,
    eventId: ev.id,
  };
}

/**
 * Parse a kind 38000 recommendation event into Nip87Review.
 */
export function parseReviewEvent(ev: Event): Nip87Review | null {
  if (ev.kind !== NIP87_RECOMMENDATION_KIND) {
    return null;
  }

  const uTags = getTagAll(ev, 'u');
  const mintUrl = uTags.find((u) => u.startsWith('http')) ?? undefined;
  const rating = parseRatingFromEvent(ev);

  return {
    content: ev.content ?? '',
    mintUrl: mintUrl || undefined,
    author: ev.pubkey,
    eventId: ev.id,
    created_at: ev.created_at,
    rating,
  };
}

/**
 * Fetch raw kind 38172 mint announcement events (no parsing). Used by discover cache.
 */
export async function fetchRawMintEvents(relays: string[], limit = 5000): Promise<Event[]> {
  const filter: Filter = {
    kinds: [NIP87_MINT_KIND],
    limit,
  };

  return pool.querySync(relays, filter);
}

/**
 * Fetch raw kind 38000 recommendation events for Cashu mints (no parsing). Used by discover cache.
 */
export async function fetchRawReviewEvents(relays: string[], limit = 5000): Promise<Event[]> {
  const filter: Filter = {
    kinds: [NIP87_RECOMMENDATION_KIND],
    '#k': ['38172'],
    limit,
  };

  return pool.querySync(relays, filter);
}

/**
 * Fetch all kind 38172 mint announcements, parse and deduplicate by URL (latest per URL).
 */
export async function fetchMintInfos(relays: string[], limit = 5000): Promise<Nip87MintInfo[]> {
  const events = await fetchRawMintEvents(relays, limit);
  const byUrl = new Map<string, Nip87MintInfo>();
  const sorted = [...events].sort((a, b) => b.created_at - a.created_at);

  for (const ev of sorted) {
    const info = parseMintInfoEvent(ev);

    if (!info) {
      continue;
    }

    if (!byUrl.has(info.url)) {
      byUrl.set(info.url, info);
    }
  }

  return Array.from(byUrl.values());
}

/**
 * Fetch kind 38000 recommendation events for Cashu mints (#k 38172).
 */
export async function fetchReviews(relays: string[], limit = 5000): Promise<Nip87Review[]> {
  const events = await fetchRawReviewEvents(relays, limit);
  const out: Nip87Review[] = [];

  for (const ev of events) {
    const review = parseReviewEvent(ev);

    if (review) {
      out.push(review);
    }
  }

  return out;
}

/**
 * Fetch kind 38000 recommendations for a specific mint URL.
 */
export async function fetchReviewsForUrl(relays: string[], url: string): Promise<Nip87Review[]> {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return [];
  }

  const filter: Filter = {
    kinds: [NIP87_RECOMMENDATION_KIND],
    '#k': ['38172'],
    '#u': [url],
    limit: 5000,
  };

  try {
    const events = await pool.querySync(relays, filter);
    const out: Nip87Review[] = [];

    for (const ev of events) {
      const review = parseReviewEvent(ev);

      if (review) {
        out.push(review);
      }
    }

    return out;
  } catch (err) {
    logError('[nip87] Failed to fetch reviews for URL:', err);

    return [];
  }
}

/**
 * Fetch kind 38172 mint info for a specific URL. Returns first valid event or null.
 */
export async function fetchMintInfoForUrl(
  relays: string[],
  url: string,
): Promise<Nip87MintInfo | null> {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return null;
  }

  const filter: Filter = {
    kinds: [NIP87_MINT_KIND],
    '#u': [url],
    limit: 100,
  };

  try {
    const events = await pool.querySync(relays, filter);

    for (const ev of events) {
      const info = parseMintInfoEvent(ev);

      if (info) {
        return info;
      }
    }

    return null;
  } catch (err) {
    logError('[nip87] Failed to fetch mint info for URL:', err);

    return null;
  }
}
