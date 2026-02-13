import { createEffect, createSignal, Show } from 'solid-js';

import { t } from '../i18n';
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

export function SettingsDialog(props: SettingsDialogProps) {
  const [localQuestions, setLocalQuestions] = createSignal(
    store.state().questionsPerSession,
  );

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
        />
        <div
          class="relative z-10 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            id="settings-title"
            class="text-lg font-semibold text-slate-900"
          >
            {t('Settings')}
          </h2>
          <div class="mt-4 space-y-4">
            <div>
              <label
                for="questions-per-session"
                class="block text-sm font-medium text-slate-700"
              >
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
          </div>
          <div class="mt-6 flex justify-end">
            <button
              type="button"
              onClick={props.onClose}
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
