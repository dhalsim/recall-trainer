import type { WotStats } from './wotCache';
import { getDepth, getDepths, getStats, openWotDB } from './wotCache';

const WOT_WEIGHT: Record<number, number> = { 0: 3, 1: 2, 2: 1 };

export type WotMintScore = {
  /** Weighted average: sum(rating × depthWeight) / wotReviewCount. null when no WoT reviews. */
  score: number | null;
  wotReviewCount: number;
  totalReviewCount: number;
};

export function computeWotMintScore(
  reviews: { author: string; rating: number | null }[],
  depthsByAuthor: Map<string, number>,
): WotMintScore {
  let weightedSum = 0;
  let wotCount = 0;

  for (const r of reviews) {
    if (r.rating == null) {
      continue;
    }

    const depth = depthsByAuthor.get(r.author);

    if (depth == null) {
      continue;
    }

    const w = WOT_WEIGHT[depth] ?? 0;

    if (w === 0) {
      continue;
    }

    weightedSum += r.rating * w;
    wotCount++;
  }

  return {
    score: wotCount > 0 ? weightedSum / wotCount : null,
    wotReviewCount: wotCount,
    totalReviewCount: reviews.length,
  };
}

/**
 * Get the WoT depth of a pubkey relative to the given root (current user).
 * Returns null if the pubkey is not in the graph or data is for another root.
 */
export async function getWotDepth(pubkey: string, rootPubkey: string): Promise<number | null> {
  const db = await openWotDB();

  try {
    return await getDepth(db, pubkey, rootPubkey);
  } finally {
    db.close();
  }
}

/**
 * Batch get WoT depths for multiple pubkeys, scoped to the given root.
 */
export async function getWotDepths(
  pubkeys: string[],
  rootPubkey: string,
): Promise<Map<string, number>> {
  const db = await openWotDB();

  try {
    return await getDepths(db, pubkeys, rootPubkey);
  } finally {
    db.close();
  }
}

/**
 * Get per-depth counts for the given root (for UI stats).
 */
export async function getWotStats(rootPubkey: string): Promise<WotStats> {
  const db = await openWotDB();

  try {
    return await getStats(db, rootPubkey);
  } finally {
    db.close();
  }
}
