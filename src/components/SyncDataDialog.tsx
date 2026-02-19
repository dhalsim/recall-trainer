import { For, Show } from 'solid-js';

import { useNostrAuth } from '../contexts/NostrAuthContext';
import { t } from '../i18n';
import type { Nip65Relays } from '../lib/nostr/nip65';
import { getRelays } from '../lib/nostr/nip65';
import {
  getLastSyncedAt,
  getRelayEventCreatedAt,
  getSyncStatus,
  getSyncingDirection,
  pullSyncData,
  pushSyncData,
} from '../lib/nostr/nip78';
import { DEFAULT_WRITE_RELAYS } from '../utils/nostr';
import { formatRelativeTime } from '../utils/relativeTime';

interface SyncDataDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SyncDataDialog(props: SyncDataDialogProps) {
  const auth = useNostrAuth();

  function getPublishRelays(pubkey: string): string[] {
    const nip65 = getRelays(pubkey);

    return nip65?.writeRelays?.length ? nip65.writeRelays : DEFAULT_WRITE_RELAYS;
  }

  return (
    <Show when={props.open}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-data-title"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            props.onClose();
          }
        }}
      >
        <div class="fixed inset-0 bg-slate-900/50" aria-hidden="true" />
        <div
          class="relative z-10 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="sync-data-title" class="text-lg font-semibold text-slate-900">
            {t('Sync Data')}
          </h2>
          <div class="mt-4 space-y-4">
            <p class="text-sm text-slate-600">
              {t('Push your vocabulary and settings to Nostr relays (NIP-78).')}
            </p>
            <Show
              when={auth.isLoggedIn()}
              fallback={
                <p class="text-sm text-slate-500">{t('Sign in with Nostr to push sync data.')}</p>
              }
            >
              {(() => {
                const status = getSyncStatus();
                const relayAt = getRelayEventCreatedAt();
                const syncedAt = getLastSyncedAt();
                const pk = auth.pubkey();

                return (
                  <>
                    <div class="flex flex-wrap items-center gap-2">
                      <Show when={status === 'in-sync'}>
                        <span class="text-sm font-medium text-green-600">{t('In sync')}</span>
                      </Show>
                      <Show when={status === 'syncing'}>
                        <span class="text-sm font-medium text-slate-600">
                          {getSyncingDirection() === 'push' ? t('Pushing…') : t('Pulling…')}
                        </span>
                      </Show>
                      <Show when={status === 'local-is-new'}>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!pk) {
                              return;
                            }

                            await pushSyncData({
                              publishRelays: getPublishRelays(pk),
                              getPublicKey: auth.getPublicKey,
                              signEvent: auth.signEvent,
                              onSuccess: () => {},
                              onError: () => {},
                            });
                          }}
                          class="rounded-lg bg-blue-100 px-3 py-2 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                        >
                          {t('Push to relays')}
                        </button>
                      </Show>
                      <Show when={status === 'relay-is-new'}>
                        <button
                          type="button"
                          onClick={() => {
                            const key = auth.pubkey();

                            if (!key) {
                              return;
                            }

                            pullSyncData(key);
                          }}
                          class="rounded-lg bg-green-100 px-3 py-2 text-sm font-medium text-green-800 transition-colors hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
                        >
                          {t('Pull from relays')}
                        </button>
                      </Show>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!pk) {
                            return;
                          }

                          await pushSyncData({
                            publishRelays: getPublishRelays(pk),
                            getPublicKey: auth.getPublicKey,
                            signEvent: auth.signEvent,
                            onSuccess: () => {},
                            onError: () => {},
                          });
                        }}
                        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:opacity-50"
                      >
                        {t('Force push to relays')}
                      </button>
                    </div>
                    <div class="space-y-0.5 text-xs text-slate-500">
                      <p>
                        {t('Last synced')}:{' '}
                        {syncedAt !== null ? formatRelativeTime(syncedAt) : t('Never')}
                      </p>
                      <p>
                        {t('Relay data')}:{' '}
                        {relayAt !== null ? formatRelativeTime(relayAt) : t('No relay data')}
                      </p>
                    </div>
                    {pk &&
                      (() => {
                        const nip65: Nip65Relays | null = getRelays(pk) ?? null;

                        return (
                          <div>
                            <p class="text-xs font-medium text-slate-500">{t('Relays')}</p>
                            <Show
                              when={nip65 && nip65.flatRelays.length > 0}
                              fallback={
                                <p class="mt-1 text-xs text-slate-400">
                                  {t('Using default relays')}
                                </p>
                              }
                            >
                              <ul class="mt-1 space-y-0.5">
                                <For each={nip65!.flatRelays}>
                                  {(r) => (
                                    <li class="flex items-center gap-1.5 text-xs text-slate-600">
                                      <span class="truncate font-mono">{r.relay}</span>
                                      <Show when={r.read && r.write}>
                                        <span class="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-500">
                                          r/w
                                        </span>
                                      </Show>
                                      <Show when={r.read && !r.write}>
                                        <span class="shrink-0 rounded bg-green-50 px-1 py-0.5 text-[10px] font-medium text-green-600">
                                          read
                                        </span>
                                      </Show>
                                      <Show when={!r.read && r.write}>
                                        <span class="shrink-0 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-600">
                                          write
                                        </span>
                                      </Show>
                                    </li>
                                  )}
                                </For>
                              </ul>
                            </Show>
                          </div>
                        );
                      })()}
                  </>
                );
              })()}
            </Show>
          </div>
          <div class="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => props.onClose()}
              class="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t('Close')}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
