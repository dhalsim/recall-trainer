import type { EventTemplate } from 'nostr-tools';
import { createSignal } from 'solid-js';

import { t } from '../../i18n';
import type { AppState, SyncPayload } from '../../store';
import { store } from '../../store';
import { pool } from '../../utils/nostr';

import type { GetPublicKey, SignEvent } from './types';

/** NIP-78 sync data d-tag for this app. */
export const NIP78_D_TAG = 'recall-trainer-sync-data';

// --- Sync meta (localStorage) ---

const SYNC_META_KEY = 'recall-trainer-sync-meta';

function readLastSyncedAtFromStorage(): number | null {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { lastSyncedEventCreatedAt?: number };

    return typeof parsed.lastSyncedEventCreatedAt === 'number'
      ? parsed.lastSyncedEventCreatedAt
      : null;
  } catch {
    return null;
  }
}

function writeLastSyncedAtToStorage(createdAt: number): void {
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({ lastSyncedEventCreatedAt: createdAt }));
  } catch (err) {
    console.error('[nip78] Failed to save sync meta:', err);
  }
}

// --- Sync payload (whitelist) ---

/** Whitelisted subset of AppState for NIP-78 sync. No appLocale, no authLoginState. */
export type Nip78SyncPayload = SyncPayload;

export function stateToSyncPayload(state: AppState): Nip78SyncPayload {
  return {
    version: state.version,
    mainLanguage: state.mainLanguage,
    targetLanguage: state.targetLanguage,
    languageSelectionComplete: state.languageSelectionComplete,
    screen: state.screen,
    entries: state.entries,
    questionsPerSession: state.questionsPerSession,
    simulationMode: state.simulationMode,
    simulationDate: state.simulationDate,
  };
}

// --- Signals ---

/** Latest sync event from relays (we keep only the newest created_at across relays). */
const [relayEvent, setRelayEvent] = createSignal<{ content: string; created_at: number } | null>(
  null,
);

/** When we last synced (push or pull). Hydrated from localStorage. */
const [lastSyncedAt, setLastSyncedAt] = createSignal<number | null>(readLastSyncedAtFromStorage());

function updateLastSyncedAt(createdAt: number): void {
  setLastSyncedAt(createdAt);
  writeLastSyncedAtToStorage(createdAt);
}

// --- Sync status ---

export type SyncStatus = 'relay-is-new' | 'local-is-new' | 'in-sync';

/**
 * Reactive. Returns whether relay has newer data, local has changes to push, or in sync.
 */
export function getSyncStatus(): SyncStatus {
  const evt = relayEvent();
  const syncedAt = lastSyncedAt();

  if (evt && (syncedAt === null || evt.created_at > syncedAt)) {
    return 'relay-is-new';
  }

  if (evt) {
    const localPayload = JSON.stringify(stateToSyncPayload(store.state()));

    if (localPayload !== evt.content) {
      return 'local-is-new';
    }

    return 'in-sync';
  }

  return 'local-is-new';
}

/** Reactive. created_at of the latest relay event, or null. */
export function getRelayEventCreatedAt(): number | null {
  return relayEvent()?.created_at ?? null;
}

/** Reactive. When we last synced (push or pull), or null. */
export function getLastSyncedAt(): number | null {
  return lastSyncedAt();
}

// --- Subscription ---

function logCloseReasons(reasons: string[]): void {
  const normalReasons = ['closed automatically on eose', 'closed by client', 'closed by caller'];
  const nonNormal = reasons.filter((r) => !normalReasons.includes(r));

  if (nonNormal.length > 0) {
    console.log('[nip78] Subscription closed:', nonNormal);
  }
}

/**
 * Subscribe to NIP-78 sync events for the given pubkey. Keeps only the latest event
 * (by created_at); older events from slower relays are ignored.
 * Call on login; return value is unsubscribe (call on logout).
 */
export function subscribeSyncEvents(relays: string[], pubkey: string): () => void {
  let bestCreatedAt = lastSyncedAt() ?? 0;

  const sub = pool.subscribe(
    relays,
    {
      authors: [pubkey],
      '#d': [NIP78_D_TAG],
      kinds: [30078],
    },
    {
      onevent: (event) => {
        if (event.created_at <= bestCreatedAt) {
          return;
        }

        bestCreatedAt = event.created_at;
        setRelayEvent({ content: event.content, created_at: event.created_at });
      },
      onclose: logCloseReasons,
    },
  );

  return () => sub.close();
}

/** Clear relay event and lastSyncedAt (signal + localStorage). Call on logout. */
export function clearSyncState(): void {
  setRelayEvent(null);
  setLastSyncedAt(null);

  try {
    localStorage.removeItem(SYNC_META_KEY);
  } catch (err) {
    console.error('[nip78] Failed to clear sync meta:', err);
  }
}

// --- Pull ---

/**
 * Apply the latest relay event content to local store and update lastSyncedAt.
 * No-op if there is no relay event.
 */
export function pullSyncData(): void {
  const evt = relayEvent();

  if (!evt) {
    return;
  }

  try {
    const payload = JSON.parse(evt.content) as Nip78SyncPayload;

    store.applySyncPayload(payload);
    updateLastSyncedAt(evt.created_at);
  } catch (err) {
    console.error('[nip78] Failed to apply relay payload:', err);
  }
}

// --- Push ---

/** Relays used only for publishing (caller filters read-only). */
export type PushSyncParams = {
  publishRelays: string[];
  getPublicKey: GetPublicKey;
  signEvent: SignEvent;
  onSuccess: () => void;
  onError: (reason: string) => void;
};

/**
 * Publish current app state as NIP-78 sync event. On success updates lastSyncedAt.
 */
export async function pushSyncData(params: PushSyncParams): Promise<void> {
  const { publishRelays, getPublicKey, signEvent, onSuccess, onError } = params;

  if (publishRelays.length === 0) {
    onError(t('No publish relays available.'));

    return;
  }

  const userPubkey = await getPublicKey({ options: { reason: t('Publish sync data') } });

  if (!userPubkey) {
    onError(t('Could not get public key.'));

    return;
  }

  const payload = stateToSyncPayload(store.state());
  const content = JSON.stringify(payload);
  const created_at = Math.floor(Date.now() / 1000);

  const template: EventTemplate = {
    kind: 30078,
    content,
    created_at,
    tags: [['d', NIP78_D_TAG]],
  };

  try {
    const { signedEvent } = await signEvent({ event: template });

    if (!signedEvent) {
      onError(t('Could not sign sync data.'));

      return;
    }

    const publishPromises = pool.publish(publishRelays, signedEvent);
    const results = await Promise.allSettled(publishPromises);
    const atLeastOneSuccess = results.some((r) => r.status === 'fulfilled');

    if (atLeastOneSuccess) {
      updateLastSyncedAt(created_at);
      onSuccess();
    } else {
      onError(t('Sync data publish failed.'));
    }
  } catch (error) {
    console.error('[nip78] Failed to sign or publish sync event:', error);
    onError(t('Could not sign sync data.'));
  }
}
