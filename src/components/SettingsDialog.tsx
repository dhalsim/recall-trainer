import { createEffect, createSignal, Show, For } from 'solid-js';

import { t } from '../i18n';
import { LANGUAGES, LANGUAGE_LABELS } from '../lib/language-pairs';
import type { NostrProviderMethod } from '../lib/nostr/types';
import type { AppLanguage } from '../store';
import {
  QUESTIONS_PER_SESSION_DEFAULT,
  QUESTIONS_PER_SESSION_MAX,
  QUESTIONS_PER_SESSION_MIN,
  store,
} from '../store';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

function getProviderLabel(method: NostrProviderMethod): string {
  switch (method) {
    case 'bunker':
      return 'Bunker';
    case 'nostrconnect':
      return 'Nostr Connect';
    case 'nip07':
      return 'NIP-07';
    case 'nip55':
      return 'NIP-55';
    case 'passkey_signer':
      return 'Passkey signer';
    case 'password_signer':
      return 'Password signer';
  }
}

export function SettingsDialog(props: SettingsDialogProps) {
  const [localQuestions, setLocalQuestions] = createSignal(store.state().questionsPerSession);
  const simulationMode = () => store.state().simulationMode;
  const nostrProvider = () => store.state().authLoginState?.method ?? null;

  const effectiveAppLocale = (): AppLanguage =>
    store.state().appLocale ?? store.state().mainLanguage ?? 'en';

  const syncFromStore = () => setLocalQuestions(store.state().questionsPerSession);

  createEffect(() => {
    if (props.open) {
      syncFromStore();
    }
  });

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
              <p class="block text-sm font-medium text-slate-700">{t('Nostr provider')}</p>
              <p class="mt-1 text-sm text-slate-600">
                <Show when={nostrProvider()} fallback={t('Not connected')}>
                  {(method) => getProviderLabel(method())}
                </Show>
              </p>
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
