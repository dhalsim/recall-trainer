import { For } from 'solid-js';

import { t } from '../i18n';
import { LANGUAGE_LABELS, VALID_TARGETS } from '../lib/language-pairs';
import type { AppLanguage } from '../store';
import { store } from '../store';

function getLabelKey(lang: AppLanguage): string {
  return LANGUAGE_LABELS[lang];
}

export function LanguageSelection() {
  const main = () => store.state().mainLanguage;
  const target = () => store.state().targetLanguage;
  const targetOptions = () => {
    const m = main();

    return m ? VALID_TARGETS[m] : [];
  };

  const canContinue = () => main() !== null && target() !== null;

  const handleContinue = () => {
    if (canContinue()) {
      store.completeLanguageSelection();
    }
  };

  return (
    <div class="mx-auto max-w-md space-y-8">
      <h1 class="text-2xl font-bold text-slate-900">Recall Trainer</h1>

      <div class="space-y-4">
        <label class="block text-sm font-medium text-slate-700">
          {t('Select your main language for the app')}
        </label>
        <div class="flex flex-wrap gap-2" role="group" aria-label="Main language">
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
                {t(getLabelKey(lang))}
              </button>
            )}
          </For>
        </div>
      </div>

      {main() && (
        <div class="space-y-4">
          <label class="block text-sm font-medium text-slate-700">
            {t('Select your target (learning) language')}
          </label>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Target language">
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
                  {t(getLabelKey(lang))}
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
          class="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {t('Continue')}
        </button>
      )}
    </div>
  );
}
