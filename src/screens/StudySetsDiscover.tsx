import { useNavigate } from '@solidjs/router';
import { createSignal, For, onMount, Show } from 'solid-js';

import { t } from '../i18n';
import { mockStudySetRepository } from '../lib/study-sets/mockRepository';
import type { StudySet, StudySetSummary } from '../lib/study-sets/types';
import { store } from '../store';
import { logger } from '../utils/logger';

const { error: logError } = logger();

export function StudySetsDiscover() {
  const navigate = useNavigate();
  const [sets, setSets] = createSignal<StudySetSummary[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [errorText, setErrorText] = createSignal<string | null>(null);
  const [importingSetId, setImportingSetId] = createSignal<string | null>(null);
  const [previewSetId, setPreviewSetId] = createSignal<string | null>(null);
  const [loadingPreviewSetId, setLoadingPreviewSetId] = createSignal<string | null>(null);
  const [previewSetsById, setPreviewSetsById] = createSignal<Record<string, StudySet>>({});

  onMount(async () => {
    try {
      setSets(await mockStudySetRepository.listSets());
    } catch (err) {
      logError('[StudySetsDiscover] load sets failed:', err);
      setErrorText(t('Could not load study sets.'));
    } finally {
      setLoading(false);
    }
  });

  const handleImport = async (setId: string) => {
    setImportingSetId(setId);
    try {
      const fullSet = await mockStudySetRepository.getSetById(setId);

      if (!fullSet) {
        setErrorText(t('Study set not found.'));

        return;
      }

      store.importStudySet(fullSet, `mock:${setId}`);
      store.setScreen('mode_selection');
      navigate('/study-sets/my');
    } catch (err) {
      logError('[StudySetsDiscover] import failed:', err);
      setErrorText(t('Could not import study set.'));
    } finally {
      setImportingSetId(null);
    }
  };

  const handleTogglePreview = async (setId: string) => {
    if (previewSetId() === setId) {
      setPreviewSetId(null);

      return;
    }

    const cached = previewSetsById()[setId];

    if (cached) {
      setPreviewSetId(setId);

      return;
    }

    setLoadingPreviewSetId(setId);
    try {
      const fullSet = await mockStudySetRepository.getSetById(setId);

      if (!fullSet) {
        setErrorText(t('Study set not found.'));

        return;
      }

      setPreviewSetsById((prev) => ({ ...prev, [setId]: fullSet }));
      setPreviewSetId(setId);
    } catch (err) {
      logError('[StudySetsDiscover] preview load failed:', err);
      setErrorText(t('Could not load set preview.'));
    } finally {
      setLoadingPreviewSetId(null);
    }
  };

  return (
    <div class="mx-auto max-w-md space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-900">{t('Discover Study Sets')}</h1>
        <button
          type="button"
          onClick={() => navigate('/mode')}
          class="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
        >
          {t('Back')}
        </button>
      </div>

      <Show when={loading()}>
        <p class="text-sm text-slate-600">{t('Loading study sets...')}</p>
      </Show>

      <Show when={errorText()}>
        <p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorText()}
        </p>
      </Show>

      <Show when={!loading()}>
        <div class="space-y-3">
          <For each={sets()}>
            {(set) => (
              <article class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h2 class="text-base font-semibold text-slate-900">{set.name}</h2>
                    <p class="mt-1 text-sm text-slate-600">{set.description}</p>
                  </div>
                  <span class="whitespace-nowrap rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {t('Level')} {set.level}
                  </span>
                </div>

                <p class="mt-2 text-xs text-slate-500">
                  {set.mainLanguage}
                  {' -> '}
                  {set.targetLanguage} • {set.numberOfItems} {t('items')}
                </p>

                <div class="mt-3 flex flex-wrap gap-2">
                  <For each={set.tags}>
                    {(tag) => (
                      <span class="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                        #{tag}
                      </span>
                    )}
                  </For>
                </div>

                <div class="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={loadingPreviewSetId() === set.id}
                    onClick={() => void handleTogglePreview(set.id)}
                    class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                  >
                    <Show
                      when={loadingPreviewSetId() === set.id}
                      fallback={
                        previewSetId() === set.id ? t('Hide preview') : t('Preview contents')
                      }
                    >
                      {t('Loading preview...')}
                    </Show>
                  </button>
                  <button
                    type="button"
                    disabled={importingSetId() === set.id}
                    onClick={() => void handleImport(set.id)}
                    class="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Show when={importingSetId() === set.id} fallback={t('Import')}>
                      {t('Importing...')}
                    </Show>
                  </button>
                </div>

                <Show when={previewSetId() === set.id}>
                  <div class="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <Show
                      when={previewSetsById()[set.id]}
                      fallback={<p class="text-sm text-slate-600">{t('Loading preview...')}</p>}
                    >
                      {(previewSet) => (
                        <Show
                          when={previewSet().type === 'vocab'}
                          fallback={
                            <p class="text-sm text-slate-600">
                              {t('Preview is not available for this set type yet.')}
                            </p>
                          }
                        >
                          <div class="space-y-2">
                            <Show when={previewSet().items.length > 8}>
                              <p class="text-xs font-medium uppercase tracking-wide text-slate-500">
                                {t('Preview (first {{count}} items)', { count: 8 })}
                              </p>
                            </Show>
                            <ul class="space-y-1">
                              <For each={previewSet().items.slice(0, 8)}>
                                {(item) => (
                                  <li class="rounded-md bg-white px-2 py-1 text-sm text-slate-700">
                                    {item.source} {'→'} {item.target}
                                  </li>
                                )}
                              </For>
                            </ul>
                            <Show when={previewSet().items.length > 8}>
                              <p class="text-xs text-slate-500">
                                {t('And {{count}} more items...', {
                                  count: previewSet().items.length - 8,
                                })}
                              </p>
                            </Show>
                          </div>
                        </Show>
                      )}
                    </Show>
                  </div>
                </Show>
              </article>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
