/**
 * Optional override for "current time" used by date utils.
 * When set, startOfToday/endOfToday/addDaysFromToday use this instead of real time.
 */
let simulationTimestamp: number | null = null;

/** Returns current time: simulation override if set, otherwise real Date.now(). */
export function getCurrentTime(): number {
  return simulationTimestamp ?? Date.now();
}

/** Set simulated "now" (e.g. start of a day). Pass null to use real time again. */
export function setSimulationTime(ts: number | null): void {
  simulationTimestamp = ts;
}

export function isSimulationActive(): boolean {
  return simulationTimestamp !== null;
}
