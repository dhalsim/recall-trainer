import { useNavigate } from '@solidjs/router';
import { For } from 'solid-js';

import { t } from '../i18n';
import { store } from '../store';

export function MyStudySets() {
  const navigate = useNavigate();
  const localSets = () => store.getLocalSets();

  const dueForSet = (setId: string) => store.getDueCountForLocalSet(setId);

  const openSetForStudy = (setId: string) => {
    store.setActiveLocalSet(setId);
    store.setScreen('test');
    navigate('/test');
  };

  const openSetForEdit = (setId: string) => {
    store.setActiveLocalSet(setId);
    store.setScreen('word_entry');
    navigate('/words');
  };

  return (
    <div class="mx-auto max-w-md space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-900">{t('My Study Sets')}</h1>
        <button
          type="button"
          onClick={() => navigate('/mode')}
          class="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
        >
          {t('Back')}
        </button>
      </div>

      <div class="flex gap-2">
        <button
          type="button"
          onClick={() => navigate('/study-sets/discover')}
          class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          {t('Discover Study Sets')}
        </button>
        <button
          type="button"
          onClick={() => navigate('/study-sets/create')}
          class="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t('Create Study Set')}
        </button>
      </div>

      <div class="space-y-3">
        <For each={localSets()}>
          {(set) => (
            <article class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div class="flex items-start justify-between gap-2">
                <h2 class="text-base font-semibold text-slate-900">{set.name}</h2>
                <span class="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
                  {dueForSet(set.id)} {t('due')}
                </span>
              </div>
              <p class="mt-1 text-sm text-slate-600">{set.description}</p>
              <p class="mt-2 text-xs text-slate-500">
                {set.numberOfItems} {t('items')}
              </p>
              <div class="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => openSetForEdit(set.id)}
                  class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {t('Edit')}
                </button>
                <button
                  type="button"
                  onClick={() => openSetForStudy(set.id)}
                  class="flex-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  {t('Study this set')}
                </button>
              </div>
            </article>
          )}
        </For>
      </div>
    </div>
  );
}
