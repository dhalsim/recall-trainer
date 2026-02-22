import { useNavigate } from '@solidjs/router';

import { t } from '../i18n';
import { store } from '../store';

export function ModeSelection() {
  const navigate = useNavigate();

  const dueCount = (): number =>
    store.getLocalSets().reduce((total, set) => total + store.getDueCountForLocalSet(set.id), 0);

  const handleTakeTest = () => {
    store.selectSetForQuickTest();
    store.setScreen('test');
    navigate('/test');
  };

  const handleDiscoverStudySets = () => {
    store.setScreen('mode_selection');
    navigate('/study-sets/discover');
  };

  const handleMyStudySets = () => {
    store.setScreen('mode_selection');
    navigate('/study-sets/my');
  };

  return (
    <div class="mx-auto max-w-md space-y-8 sm:space-y-10">
      <h1 class="text-2xl font-bold text-slate-900 sm:text-3xl">Recall Trainer</h1>

      <div class="space-y-4">
        <p class="text-slate-600">What would you like to do?</p>
        <div class="flex flex-col gap-3 sm:gap-4" role="group" aria-label={t('Mode selection')}>
          <button
            type="button"
            onClick={handleTakeTest}
            class="rounded-lg border-2 border-slate-200 bg-white px-4 py-4 text-left font-medium text-slate-700 transition-colors hover:border-primary-300 hover:bg-primary-50/50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            {dueCount() > 0
              ? t('Take a test ({{count}} due)', { count: dueCount() })
              : t('Take a test')}
          </button>
          <button
            type="button"
            onClick={handleDiscoverStudySets}
            class="rounded-lg border-2 border-slate-200 bg-white px-4 py-4 text-left font-medium text-slate-700 transition-colors hover:border-primary-300 hover:bg-primary-50/50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            {t('Discover Study Sets')}
          </button>
          <button
            type="button"
            onClick={handleMyStudySets}
            class="rounded-lg border-2 border-slate-200 bg-white px-4 py-4 text-left font-medium text-slate-700 transition-colors hover:border-primary-300 hover:bg-primary-50/50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            {t('My Study Sets')}
          </button>
        </div>
      </div>
    </div>
  );
}
