import { t } from '../i18n';
import { store } from '../store';

export function WordEntry() {
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
      <p class="text-slate-600">
        {t('Add vocabulary pairs (one per line, format: source | target)')}
      </p>
      <p class="text-sm text-slate-500">Word Entry Mode — to be implemented</p>
    </div>
  );
}
