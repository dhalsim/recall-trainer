import { createSignal } from 'solid-js';

export type AppLogEntryType = 'log' | 'error';

export interface AppLogEntry {
  type: AppLogEntryType;
  msg: string;
  timestamp: number;
}

const MAX_LOG_ENTRIES = 500;

const [logEntries, setLogEntries] = createSignal<AppLogEntry[]>([]);
const [captureWithSignal, setCaptureWithSignal] = createSignal(false);

function pushLogEntry(type: AppLogEntryType, msg: string): void {
  if (!captureWithSignal()) {
    return;
  }

  setLogEntries((prev) => {
    const next = [...prev, { type, msg, timestamp: Date.now() }];

    if (next.length <= MAX_LOG_ENTRIES) {
      return next;
    }

    return next.slice(next.length - MAX_LOG_ENTRIES);
  });
}

function formatErrorSuffix(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }

  if (typeof err === 'string' && err.trim().length > 0) {
    return err;
  }

  return '';
}

export function logger() {
  return {
    error: (msg: string, err?: unknown): void => {
      if (typeof err === 'undefined') {
        console.error(msg);
      } else {
        console.error(msg, err);
      }

      const suffix = formatErrorSuffix(err);
      const merged = suffix ? `${msg} ${suffix}` : msg;
      pushLogEntry('error', merged);
    },
    log: (msg: string): void => {
      console.log(msg);
      pushLogEntry('log', msg);
    },
  };
}

export function setLogSignalEnabled(enabled: boolean): void {
  setCaptureWithSignal(enabled);
}

export function getAppLogs(): AppLogEntry[] {
  return logEntries();
}

export function clearAppLogs(): void {
  setLogEntries([]);
}
