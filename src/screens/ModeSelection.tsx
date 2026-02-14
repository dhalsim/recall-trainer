import { useNavigate } from '@solidjs/router';
import { createSignal } from 'solid-js';

import { SettingsDialog } from '../components/SettingsDialog';
import { t } from '../i18n';
import { store } from '../store';

export function ModeSelection() {
  const [showSettings, setShowSettings] = createSignal(false);
  const navigate = useNavigate();

  const handleEnterWords = () => {
    store.setScreen('word_entry');
    navigate('/words');
  };

  const handleTakeTest = () => {
    store.setScreen('test');
    navigate('/test');
  };

  return (
    <div class="mx-auto max-w-md space-y-8 sm:space-y-10">
      <div class="flex items-center justify-between gap-4">
        <h1 class="text-2xl font-bold text-slate-900 sm:text-3xl">Recall Trainer</h1>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          class="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label={t('Settings')}
          title={t('Settings')}
        >
          <svg
            class="h-4 w-4 sm:h-5 sm:w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.39a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>

      <SettingsDialog open={showSettings()} onClose={() => setShowSettings(false)} />

      <div class="space-y-4">
        <p class="text-slate-600">What would you like to do?</p>
        <div class="flex flex-col gap-3 sm:gap-4" role="group" aria-label={t('Mode selection')}>
          <button
            type="button"
            onClick={handleEnterWords}
            class="rounded-lg border-2 border-slate-200 bg-white px-4 py-4 text-left font-medium text-slate-700 transition-colors hover:border-primary-300 hover:bg-primary-50/50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            {t('Enter words I struggle with')}
          </button>
          <button
            type="button"
            onClick={handleTakeTest}
            class="rounded-lg border-2 border-slate-200 bg-white px-4 py-4 text-left font-medium text-slate-700 transition-colors hover:border-primary-300 hover:bg-primary-50/50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            {t('Take a test')}
          </button>
        </div>
      </div>
    </div>
  );
}
