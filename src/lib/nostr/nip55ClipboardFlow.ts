import { nip19 } from 'nostr-tools';

import { logger } from '../../utils/logger';

export const NIP55_PENDING_KEY = 'nip55_pending_request';
export const NIP55_RESULT_KEY = 'nip55_result';
export const NIP55_RESULT_READY_EVENT = 'nip55-result-ready';

const NIP55_CLIPBOARD_FLOW_KEY = 'nip55_clipboard_flow_state';
const CLIPBOARD_POLL_MS = 800;
const CLIPBOARD_TIMEOUT_MS = 60_000;

const { log, error: logError } = logger();

export type Nip55PendingType = 'get_public_key' | 'sign_event' | 'nip44_encrypt' | 'nip44_decrypt';

type ClipboardFlowState = {
  requestId: string;
  type: Nip55PendingType;
  startedAt: number;
};

type RunningFlow = {
  state: ClipboardFlowState;
  intervalId: ReturnType<typeof setInterval> | null;
  timeoutId: ReturnType<typeof setTimeout> | null;
  lastClipboard: string;
  onFocus: () => void;
  acceptCurrentClipboardOnStart: boolean;
};

let runningFlow: RunningFlow | null = null;

function isHexPubkey(value: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(value);
}

function parseNpubToHex(value: string): string | null {
  try {
    const decoded = nip19.decode(value);

    if (decoded.type !== 'npub' || typeof decoded.data !== 'string') {
      return null;
    }

    return decoded.data;
  } catch {
    return null;
  }
}

function parseSignEvent(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      id?: unknown;
      pubkey?: unknown;
      sig?: unknown;
    };

    if (
      typeof parsed.id === 'string' &&
      typeof parsed.pubkey === 'string' &&
      typeof parsed.sig === 'string'
    ) {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeClipboardCandidate(type: Nip55PendingType, raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  if (type === 'get_public_key') {
    if (isHexPubkey(trimmed)) {
      return trimmed.toLowerCase();
    }

    if (trimmed.startsWith('npub')) {
      const hex = parseNpubToHex(trimmed);

      if (hex && isHexPubkey(hex)) {
        return hex.toLowerCase();
      }
    }

    return null;
  }

  if (type === 'sign_event') {
    return parseSignEvent(trimmed);
  }

  // nip44_* results are opaque strings.
  return trimmed;
}

function readFlowStateFromStorage(): ClipboardFlowState | null {
  try {
    const raw = localStorage.getItem(NIP55_CLIPBOARD_FLOW_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<ClipboardFlowState>;

    if (
      typeof parsed.requestId !== 'string' ||
      typeof parsed.type !== 'string' ||
      typeof parsed.startedAt !== 'number'
    ) {
      return null;
    }

    if (!['get_public_key', 'sign_event', 'nip44_encrypt', 'nip44_decrypt'].includes(parsed.type)) {
      return null;
    }

    return parsed as ClipboardFlowState;
  } catch (error) {
    logError('[NIP-55][Clipboard] Failed to parse flow state from storage:', error);

    return null;
  }
}

function saveFlowStateToStorage(state: ClipboardFlowState | null): void {
  try {
    if (!state) {
      localStorage.removeItem(NIP55_CLIPBOARD_FLOW_KEY);

      return;
    }

    localStorage.setItem(NIP55_CLIPBOARD_FLOW_KEY, JSON.stringify(state));
  } catch (error) {
    logError('[NIP-55][Clipboard] Failed to persist flow state:', error);
  }
}

function stopTimers(flow: RunningFlow): void {
  if (flow.intervalId) {
    clearInterval(flow.intervalId);
  }

  if (flow.timeoutId) {
    clearTimeout(flow.timeoutId);
  }
}

function persistResult(requestId: string, type: Nip55PendingType, result: string): void {
  try {
    const existingRaw = localStorage.getItem(NIP55_RESULT_KEY);

    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as { requestId?: string };

      if (existing.requestId === requestId) {
        log(
          `[NIP-55][Clipboard] Result already exists for requestId=${requestId}; clearing stale pending state.`,
        );

        localStorage.removeItem(NIP55_PENDING_KEY);
        saveFlowStateToStorage(null);

        return;
      }
    }

    localStorage.setItem(NIP55_RESULT_KEY, JSON.stringify({ requestId, type, result }));
    localStorage.removeItem(NIP55_PENDING_KEY);
    log(`[NIP-55][Clipboard] Stored result from clipboard. type=${type}, requestId=${requestId}`);
    window.dispatchEvent(new Event(NIP55_RESULT_READY_EVENT));
  } catch (error) {
    logError('[NIP-55][Clipboard] Failed to store clipboard result:', error);
  }
}

async function readClipboard(): Promise<string | null> {
  try {
    if (!navigator?.clipboard?.readText) {
      return null;
    }

    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

export async function ensureNip55ClipboardReadAccess(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    if (!navigator?.clipboard?.readText) {
      log('[NIP-55][Clipboard] Clipboard read API unavailable.');

      return false;
    }

    await navigator.clipboard.readText();
    log('[NIP-55][Clipboard] Clipboard read access available.');

    return true;
  } catch (error) {
    logError('[NIP-55][Clipboard] Clipboard read access denied or failed:', error);

    return false;
  }
}

function installCheckers(flow: RunningFlow): void {
  const checkClipboard = async (acceptBaseline: boolean): Promise<void> => {
    const raw = await readClipboard();

    if (raw == null) {
      return;
    }

    const trimmed = raw.trim();

    if (!trimmed) {
      return;
    }

    if (!acceptBaseline && trimmed === flow.lastClipboard) {
      return;
    }

    const normalized = normalizeClipboardCandidate(flow.state.type, trimmed);

    if (!normalized) {
      flow.lastClipboard = trimmed;

      log(
        `[NIP-55][Clipboard] Candidate rejected. type=${flow.state.type}, requestId=${flow.state.requestId}`,
      );

      return;
    }

    persistResult(flow.state.requestId, flow.state.type, normalized);
    stopNip55ClipboardFlow('result-detected');
  };

  flow.onFocus = () => {
    log(`[NIP-55][Clipboard] Window focus event. requestId=${flow.state.requestId}`);
    void checkClipboard(false);
  };

  window.addEventListener('focus', flow.onFocus);

  flow.intervalId = setInterval(() => {
    void checkClipboard(false);
  }, CLIPBOARD_POLL_MS);

  flow.timeoutId = setTimeout(() => {
    log(
      `[NIP-55][Clipboard] Timeout waiting for clipboard result. requestId=${flow.state.requestId}, type=${flow.state.type}`,
    );

    stopNip55ClipboardFlow('timeout');
  }, CLIPBOARD_TIMEOUT_MS);

  if (flow.acceptCurrentClipboardOnStart) {
    void checkClipboard(true);
  }
}

export async function startNip55ClipboardFlow(
  requestId: string,
  type: Nip55PendingType,
  options?: { acceptCurrentClipboardOnStart?: boolean },
): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  if (runningFlow?.state.requestId === requestId) {
    log(`[NIP-55][Clipboard] Flow already running. requestId=${requestId}`);

    return;
  }

  stopNip55ClipboardFlow('restart');

  const state: ClipboardFlowState = { requestId, type, startedAt: Date.now() };
  const baseline = ((await readClipboard()) ?? '').trim();

  const flow: RunningFlow = {
    state,
    intervalId: null,
    timeoutId: null,
    lastClipboard: baseline,
    onFocus: () => {},
    acceptCurrentClipboardOnStart: options?.acceptCurrentClipboardOnStart ?? false,
  };

  runningFlow = flow;
  saveFlowStateToStorage(state);

  log(
    `[NIP-55][Clipboard] Flow started. type=${type}, requestId=${requestId}, baselineLen=${baseline.length}`,
  );

  installCheckers(flow);
}

export function stopNip55ClipboardFlow(reason: string): void {
  if (!runningFlow) {
    return;
  }

  const flow = runningFlow;
  runningFlow = null;

  window.removeEventListener('focus', flow.onFocus);
  stopTimers(flow);
  saveFlowStateToStorage(null);
  log(`[NIP-55][Clipboard] Flow stopped. requestId=${flow.state.requestId}, reason=${reason}`);
}

export async function resumeNip55ClipboardFlowFromPending(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  if (runningFlow) {
    return;
  }

  const rawPending = localStorage.getItem(NIP55_PENDING_KEY);

  if (!rawPending) {
    return;
  }

  try {
    const pending = JSON.parse(rawPending) as { requestId?: string; type?: Nip55PendingType };

    if (typeof pending.requestId !== 'string' || typeof pending.type !== 'string') {
      return;
    }

    const existingResultRaw = localStorage.getItem(NIP55_RESULT_KEY);

    if (existingResultRaw) {
      const existingResult = JSON.parse(existingResultRaw) as { requestId?: string };

      if (existingResult.requestId === pending.requestId) {
        log(
          `[NIP-55][Clipboard] Pending request already has stored result. requestId=${pending.requestId}; stopping resume.`,
        );

        localStorage.removeItem(NIP55_PENDING_KEY);
        saveFlowStateToStorage(null);

        return;
      }
    }

    const persistedState = readFlowStateFromStorage();

    const sameState =
      persistedState &&
      persistedState.requestId === pending.requestId &&
      persistedState.type === pending.type;

    log(
      `[NIP-55][Clipboard] Resuming from pending request. requestId=${pending.requestId}, type=${pending.type}`,
    );

    await startNip55ClipboardFlow(pending.requestId, pending.type, {
      // After reload/focus return, allow using current clipboard as immediate candidate.
      acceptCurrentClipboardOnStart: !sameState,
    });
  } catch (error) {
    logError('[NIP-55][Clipboard] Failed to resume from pending request:', error);
  }
}
