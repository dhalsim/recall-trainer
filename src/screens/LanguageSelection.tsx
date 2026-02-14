import { useNavigate } from '@solidjs/router';
import { For } from 'solid-js';

import { t } from '../i18n';
import { LANGUAGE_LABELS, VALID_TARGETS } from '../lib/language-pairs';
import type { AppLanguage } from '../store';
import { store } from '../store';

export function LanguageSelection() {
  const main = () => store.state().mainLanguage;
  const target = () => store.state().targetLanguage;

  const targetOptions = () => {
    const m = main();

    return m ? VALID_TARGETS[m] : [];
  };

  const canContinue = () => main() !== null && target() !== null;

  const navigate = useNavigate();

  const handleContinue = () => {
    if (canContinue()) {
      store.completeLanguageSelection();
      store.setScreen('mode_selection');
      navigate('/mode');
    }
  };

  return (
    <div class="mx-auto max-w-md space-y-8 sm:space-y-10">
      <h1 class="text-2xl font-bold text-slate-900 sm:text-3xl">Recall Trainer</h1>

      <div class="space-y-3 sm:space-y-4">
        <span class="block text-sm font-medium text-slate-700" id="main-language-label">
          {t('Select your main language for the app')}
        </span>
        <div
          class="flex flex-wrap gap-2 sm:gap-3"
          role="group"
          aria-labelledby="main-language-label"
        >
          <For each={['en', 'ja', 'tr'] as AppLanguage[]}>
            {(lang) => (
              <button
                type="button"
                onClick={() => {
                  store.setMainLanguage(lang);
                  store.setTargetLanguage(null);
                }}
                class="rounded-lg border-2 px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                classList={{
                  'border-blue-600 bg-blue-50 text-blue-700': main() === lang,
                  'border-slate-200 bg-white text-slate-700 hover:border-slate-300':
                    main() !== lang,
                }}
              >
                {LANGUAGE_LABELS[lang]}
              </button>
            )}
          </For>
        </div>
      </div>

      {main() && (
        <div class="space-y-3 sm:space-y-4">
          <span class="block text-sm font-medium text-slate-700" id="target-language-label">
            {t('Select your target (learning) language')}
          </span>
          <div
            class="flex flex-wrap gap-2 sm:gap-3"
            role="group"
            aria-labelledby="target-language-label"
          >
            <For each={targetOptions()}>
              {(lang) => (
                <button
                  type="button"
                  onClick={() => store.setTargetLanguage(lang)}
                  class="rounded-lg border-2 px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                  classList={{
                    'border-blue-600 bg-blue-50 text-blue-700': target() === lang,
                    'border-slate-200 bg-white text-slate-700 hover:border-slate-300':
                      target() !== lang,
                  }}
                >
                  {LANGUAGE_LABELS[lang]}
                </button>
              )}
            </For>
          </div>
        </div>
      )}

      {canContinue() && (
        <button
          type="button"
          onClick={handleContinue}
          class="w-full rounded-lg bg-primary-600 px-4 py-3 font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          {t('Continue')}
        </button>
      )}
    </div>
  );
}
