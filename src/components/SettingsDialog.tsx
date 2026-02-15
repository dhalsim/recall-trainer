import { createEffect, createSignal, Show, For } from 'solid-js';

import { useNostrAuth } from '../contexts/NostrAuthContext';
import { t } from '../i18n';
import { LANGUAGES, LANGUAGE_LABELS } from '../lib/language-pairs';
import type { Nip65Relays } from '../lib/nostr/nip65';
import { getRelays } from '../lib/nostr/nip65';
import {
  getLastSyncedAt,
  getRelayEventCreatedAt,
  getSyncStatus,
  pullSyncData,
  pushSyncData,
} from '../lib/nostr/nip78';
import type { AppLanguage } from '../store';
import {
  QUESTIONS_PER_SESSION_DEFAULT,
  QUESTIONS_PER_SESSION_MAX,
  QUESTIONS_PER_SESSION_MIN,
  store,
} from '../store';
import { DEFAULT_WRITE_RELAYS } from '../utils/nostr';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const auth = useNostrAuth();
  const [localQuestions, setLocalQuestions] = createSignal(store.state().questionsPerSession);
  const [pushLoading, setPushLoading] = createSignal(false);
  const [pullLoading, setPullLoading] = createSignal(false);
  const simulationMode = () => store.state().simulationMode;

  function getPublishRelays(pubkey: string): string[] {
    const nip65 = getRelays(pubkey);

    return nip65?.writeRelays?.length ? nip65.writeRelays : DEFAULT_WRITE_RELAYS;
  }

  const effectiveAppLocale = (): AppLanguage =>
    store.state().appLocale ?? store.state().mainLanguage ?? 'en';

  const syncFromStore = () => setLocalQuestions(store.state().questionsPerSession);

  createEffect(() => {
    if (props.open) {
      syncFromStore();
    }
  });

  function formatRelativeTime(ts: number): string {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - ts;

    if (diff < 60) {
      return t('Just now');
    }

    if (diff < 3600) {
      const m = Math.floor(diff / 60);

      return m === 1 ? t('1 minute ago') : t('{{count}} minutes ago', { count: m });
    }

    if (diff < 86400) {
      const h = Math.floor(diff / 3600);

      return h === 1 ? t('1 hour ago') : t('{{count}} hours ago', { count: h });
    }

    const d = Math.floor(diff / 86400);

    return d === 1 ? t('1 day ago') : t('{{count}} days ago', { count: d });
  }

  return (
    <Show when={props.open}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            props.onClose();
          }
        }}
      >
        <div
          class="fixed inset-0 bg-slate-900/50"
          aria-hidden="true"
          onClick={() => props.onClose()}
        />
        <div
          class="relative z-10 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="settings-title" class="text-lg font-semibold text-slate-900">
            {t('Settings')}
          </h2>
          <div class="mt-4 space-y-4">
            <div>
              <p class="block text-sm font-medium text-slate-700">{t('Application language')}</p>
              <div
                class="mt-2 flex flex-wrap gap-2"
                role="group"
                aria-label={t('Application language')}
              >
                <For each={LANGUAGES}>
                  {(lang) => (
                    <button
                      type="button"
                      onClick={() => store.setAppLocale(lang)}
                      class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      classList={{
                        'border-blue-500 bg-blue-50 text-blue-700': effectiveAppLocale() === lang,
                        'border-slate-300 bg-white text-slate-700 hover:bg-slate-50':
                          effectiveAppLocale() !== lang,
                      }}
                    >
                      {LANGUAGE_LABELS[lang]}
                    </button>
                  )}
                </For>
              </div>
            </div>
            <div>
              <label for="questions-per-session" class="block text-sm font-medium text-slate-700">
                {t('Questions per session')}
              </label>
              <input
                id="questions-per-session"
                type="number"
                min={QUESTIONS_PER_SESSION_MIN}
                max={QUESTIONS_PER_SESSION_MAX}
                value={localQuestions()}
                onInput={(e) => {
                  const v = e.currentTarget.valueAsNumber;

                  if (!Number.isNaN(v)) {
                    const clamped = Math.min(
                      QUESTIONS_PER_SESSION_MAX,
                      Math.max(QUESTIONS_PER_SESSION_MIN, Math.round(v)),
                    );

                    setLocalQuestions(clamped);
                    store.setQuestionsPerSession(clamped);
                  }
                }}
                class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p class="mt-1 text-xs text-slate-500">
                {QUESTIONS_PER_SESSION_MIN}–{QUESTIONS_PER_SESSION_MAX} (default{' '}
                {QUESTIONS_PER_SESSION_DEFAULT})
              </p>
            </div>
            <div class="border-t border-slate-200 pt-4">
              <p class="text-sm font-medium text-slate-700">{t('Nostr sync')}</p>
              <p class="mt-0.5 text-xs text-slate-500">
                {t('Push your vocabulary and settings to Nostr relays (NIP-78).')}
              </p>
              <Show
                when={auth.isLoggedIn()}
                fallback={
                  <p class="mt-2 text-sm text-slate-500">
                    {t('Sign in with Nostr to push sync data.')}
                  </p>
                }
              >
                {(() => {
                  const status = getSyncStatus();
                  const relayAt = getRelayEventCreatedAt();
                  const syncedAt = getLastSyncedAt();
                  const pk = auth.pubkey();

                  return (
                    <>
                      <div class="mt-2 flex flex-wrap items-center gap-2">
                        <Show when={status === 'in-sync'}>
                          <span class="text-sm font-medium text-green-600">{t('In sync')}</span>
                        </Show>
                        <Show when={status === 'local-is-new'}>
                          <button
                            type="button"
                            disabled={pushLoading()}
                            onClick={async () => {
                              if (!pk) {
                                return;
                              }

                              setPushLoading(true);

                              await pushSyncData({
                                publishRelays: getPublishRelays(pk),
                                getPublicKey: auth.getPublicKey,
                                signEvent: auth.signEvent,
                                onSuccess: () => setPushLoading(false),
                                onError: () => setPushLoading(false),
                              });
                            }}
                            class="rounded-lg bg-blue-100 px-3 py-2 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                          >
                            {pushLoading() ? t('Pushing…') : t('Push to relays')}
                          </button>
                        </Show>
                        <Show when={status === 'relay-is-new'}>
                          <button
                            type="button"
                            disabled={pullLoading()}
                            onClick={() => {
                              setPullLoading(true);
                              pullSyncData();
                              setPullLoading(false);
                            }}
                            class="rounded-lg bg-green-100 px-3 py-2 text-sm font-medium text-green-800 transition-colors hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
                          >
                            {pullLoading() ? t('Pulling…') : t('Pull from relays')}
                          </button>
                        </Show>
                      </div>
                      <div class="mt-2 space-y-0.5 text-xs text-slate-500">
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
                            <div class="mt-3">
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
            <div class="border-t border-slate-200 pt-4">
              <p class="text-sm font-medium text-slate-700">{t('Simulation mode')}</p>
              <p class="mt-0.5 text-xs text-slate-500">
                {t('Use a mock date for testing reviews. Advance the day to see due items change.')}
              </p>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <label class="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={simulationMode()}
                    onInput={(e) => store.setSimulationMode(e.currentTarget.checked)}
                    class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span class="text-sm text-slate-700">{t('Simulation mode')}</span>
                </label>
                <Show when={simulationMode()}>
                  <button
                    type="button"
                    onClick={() => store.advanceSimulationDay()}
                    class="rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                  >
                    {t('Advance day')}
                  </button>
                </Show>
              </div>
            </div>
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
