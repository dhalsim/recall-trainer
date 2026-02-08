import { t } from '../i18n';
import { store } from '../store';

export function TestMode() {
  const handleBack = () => {
    store.goToModeSelection();
  };

  return (
    <div class="mx-auto max-w-md space-y-6">
      <button
        type="button"
        onClick={handleBack}
        class="text-sm font-medium text-blue-600 hover:text-blue-800 focus:outline-none focus:underline"
      >
        ← Back
      </button>
      <h1 class="text-2xl font-bold text-slate-900">Recall Trainer</h1>
      <p class="text-slate-600">{t('No vocabulary entries yet. Add some words first.')}</p>
      <p class="text-sm text-slate-500">Test Mode — to be implemented</p>
    </div>
  );
}
