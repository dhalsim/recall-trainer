import { t } from '../i18n';
import { store } from '../store';

export function ModeSelection() {
  const handleEnterWords = () => {
    store.setScreen('word_entry');
  };

  const handleTakeTest = () => {
    store.setScreen('test');
  };

  return (
    <div class="mx-auto max-w-md space-y-8">
      <h1 class="text-2xl font-bold text-slate-900">Recall Trainer</h1>

      <div class="space-y-4">
        <p class="text-slate-600">What would you like to do?</p>
        <div class="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleEnterWords}
            class="rounded-lg border-2 border-slate-200 bg-white px-4 py-4 text-left font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {t('Enter words I struggle with')}
          </button>
          <button
            type="button"
            onClick={handleTakeTest}
            class="rounded-lg border-2 border-slate-200 bg-white px-4 py-4 text-left font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {t('Take a test')}
          </button>
        </div>
      </div>
    </div>
  );
}
