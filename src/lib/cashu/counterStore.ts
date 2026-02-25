import { logger } from '../../utils/logger';

const COUNTER_STORAGE_KEY = 'recall-trainer-keyset-counters';
const { error: logError } = logger();

function getStoredCounters(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COUNTER_STORAGE_KEY);

    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCounters(counters: Record<string, number>): void {
  try {
    localStorage.setItem(COUNTER_STORAGE_KEY, JSON.stringify(counters));
  } catch (err) {
    logError('[counterStore] Failed to save counters:', err);
  }
}

export function getCounter(keysetId: string): number {
  const counters = getStoredCounters();

  return counters[keysetId] ?? 0;
}

export function incrementCounter(keysetId: string, count: number): void {
  const counters = getStoredCounters();
  counters[keysetId] = (counters[keysetId] ?? 0) + count;
  saveCounters(counters);
}

export function setCounter(keysetId: string, value: number): void {
  const counters = getStoredCounters();
  counters[keysetId] = value;
  saveCounters(counters);
}

export function getAllCounters(): Record<string, number> {
  return getStoredCounters();
}

export function clearCounters(): void {
  try {
    localStorage.removeItem(COUNTER_STORAGE_KEY);
  } catch (err) {
    logError('[counterStore] Failed to clear counters:', err);
  }
}

export function recoverCounter(keysetId: string): number {
  const counters = getStoredCounters();
  const current = (counters[keysetId] ?? 0) + 1;

  console.log(`[counterStore] Recovering counter to ${current} for keyset ${keysetId}`);

  setCounter(keysetId, current);

  return current;
}
