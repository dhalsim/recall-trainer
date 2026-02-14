import { getCurrentTime } from './clock';

/**
 * Start of day (00:00:00.000) for a given timestamp in local time.
 */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);

  return d.getTime();
}

/**
 * Start of current local day (00:00:00.000) as timestamp.
 * Uses clock.getCurrentTime() so simulation mode is respected.
 */
export function startOfToday(): number {
  return startOfDay(getCurrentTime());
}

/**
 * Real start of today (no simulation). Use when enabling simulation to anchor to real "today".
 */
export function realStartOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);

  return d.getTime();
}

/**
 * End of current local day (23:59:59.999) as timestamp.
 * Used for "due today" comparison: nextReviewAt <= endOfToday().
 */
export function endOfToday(): number {
  const start = startOfDay(getCurrentTime());
  const d = new Date(start);
  d.setHours(23, 59, 59, 999);

  return d.getTime();
}

/**
 * Timestamp of start of (today + days) in local time.
 * Used to set nextReviewAt when scheduling the next review.
 */
export function addDaysFromToday(days: number): number {
  const start = startOfDay(getCurrentTime());
  const d = new Date(start);
  d.setDate(d.getDate() + days);

  return d.getTime();
}

/**
 * Number of calendar days from today (start of day) to the given timestamp's day.
 * Uses clock.getCurrentTime() so simulation mode is respected.
 */
export function daysFromTodayTo(ts: number): number {
  const todayStart = startOfToday();
  const targetStart = startOfDay(ts);
  const diffMs = targetStart - todayStart;

  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}
