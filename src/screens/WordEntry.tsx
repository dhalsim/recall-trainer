import { createSignal, For } from 'solid-js';

import { t } from '../i18n';
import { LANGUAGE_LABELS } from '../lib/language-pairs';
import type { AppLanguage, VocabEntry } from '../store';
import { store } from '../store';

export function WordEntry() {
  const [source, setSource] = createSignal('');
  const [target, setTarget] = createSignal('');
  const [error, setError] = createSignal(false);
  const [hideMastered, setHideMastered] = createSignal(false);

  let sourceRef: HTMLInputElement | undefined;
  let targetRef: HTMLInputElement | undefined;

  const mainLang = (): AppLanguage => store.state().mainLanguage ?? 'en';
  const targetLang = (): AppLanguage => store.state().targetLanguage ?? 'ja';
  const entries = () => store.state().entries;
  const visibleEntries = () =>
    hideMastered() ? entries().filter((e) => !(e.source.correct && e.target.correct)) : entries();

  const sourceLabel = () => t(LANGUAGE_LABELS[mainLang()]);
  const targetLabel = () => t(LANGUAGE_LABELS[targetLang()]);

  const saveEntry = (): boolean => {
    const s = (sourceRef?.value ?? '').trim();
    const tgt = (targetRef?.value ?? '').trim();

    if (!s || !tgt) {
      return false;
    }

    try {
      store.addEntry(s, tgt);
    } catch (err) {
      console.error('[WordEntry] addEntry failed:', err);

      return false;
    }

    setSource('');
    setTarget('');

    if (sourceRef) {
      sourceRef.value = '';
    }

    if (targetRef) {
      targetRef.value = '';
    }

    setError(false);

    return true;
  };

  const handleBack = () => store.goToModeSelection();

  const handleSourceKeyDown = (e: KeyboardEvent) => {
    if (e.keyCode === 229) {
      return;
    }

    if (e.key !== 'Enter') {
      return;
    }

    e.preventDefault();

    if (!saveEntry()) {
      targetRef?.focus();
    }
  };

  const handleTargetKeyDown = (e: KeyboardEvent) => {
    if (e.keyCode === 229) {
      return;
    }

    if (e.key !== 'Enter') {
      return;
    }

    e.preventDefault();

    if (!saveEntry()) {
      const s = (sourceRef?.value ?? '').trim();
      const tgt = (targetRef?.value ?? '').trim();

      if (!s) {
        sourceRef?.focus();
      } else if (s || tgt) {
        setError(true);
      }
    } else {
      sourceRef?.focus();
    }
  };

  const handleSourceInput = (e: InputEvent & { currentTarget: HTMLInputElement }) => {
    setSource(e.currentTarget.value);
    setError(false);
  };

  const handleTargetInput = (e: InputEvent & { currentTarget: HTMLInputElement }) => {
    setTarget(e.currentTarget.value);
    setError(false);
  };

  const handleRemove = (id: string) => store.removeEntry(id);

  const isMastered = (entry: VocabEntry) => entry.source.correct && entry.target.correct;

  const toggleCorrect = (id: string, currentlyMastered: boolean) =>
    store.setEntryCorrect(id, !currentlyMastered);

  return (
    <div class="mx-auto max-w-2xl space-y-6">
      <button
        type="button"
        onClick={handleBack}
        class="text-sm font-medium text-blue-600 hover:text-blue-800 focus:outline-none focus:underline"
      >
        ← {t('Back')}
      </button>

      <h1 class="text-2xl font-bold text-slate-900">Recall Trainer</h1>
      <p class="text-slate-600">{t('Enter words in both columns to add a pair.')}</p>

      <div class="space-y-2">
        <div class="grid grid-cols-[1fr_1fr] gap-2">
          <input
            ref={sourceRef}
            id="source-input"
            type="text"
            autocomplete="off"
            enterkeyhint="next"
            lang={mainLang()}
            placeholder={sourceLabel()}
            value={source()}
            onInput={handleSourceInput}
            onKeyDown={handleSourceKeyDown}
            class="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-slate-800 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            classList={{
              'border-error-500': error() && !source().trim(),
            }}
          />
          <input
            ref={targetRef}
            id="target-input"
            type="text"
            autocomplete="off"
            enterkeyhint="done"
            lang={targetLang()}
            placeholder={targetLabel()}
            value={target()}
            onInput={handleTargetInput}
            onKeyDown={handleTargetKeyDown}
            class="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-slate-800 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            classList={{
              'border-error-500': error() && !target().trim(),
            }}
          />
        </div>
        {error() && (
          <p class="text-sm text-error-500">{t('Both source and target are required.')}</p>
        )}
      </div>

      {entries().length > 0 && (
        <div class="space-y-3">
          <h1 class="text-2xl font-bold text-slate-900">{t('Vocabulary Entries')}</h1>
          <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={hideMastered()}
              onInput={(e) => setHideMastered(e.currentTarget.checked)}
              class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span>{t('Hide mastered')}</span>
          </label>
          <div class="overflow-hidden rounded-lg border border-slate-200">
            <table class="w-full border-collapse">
              <thead>
                <tr class="bg-slate-50">
                  <th
                    scope="col"
                    class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500"
                  >
                    {sourceLabel()}
                  </th>
                  <th
                    scope="col"
                    class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500"
                  >
                    {targetLabel()}
                  </th>
                  <th
                    scope="col"
                    class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500"
                  >
                    {t('Mastered')}
                  </th>
                  <th
                    scope="col"
                    class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500"
                  >
                    {t('Error count')}
                  </th>
                  <th
                    scope="col"
                    class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500"
                  >
                    {t('Delete')}
                  </th>
                </tr>
              </thead>
              <tbody>
                <For each={visibleEntries()}>
                  {(entry) => (
                    <tr class="border-t border-slate-200 bg-white">
                      <td class="px-3 py-2 text-center text-slate-800">{entry.source.text}</td>
                      <td class="px-3 py-2 text-center text-slate-800">{entry.target.text}</td>
                      <td class="flex justify-center px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleCorrect(entry.id, isMastered(entry))}
                          aria-label={
                            isMastered(entry) ? 'Mark as not mastered' : 'Mark as mastered'
                          }
                          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                          classList={{
                            'border-success-500 bg-success-500 text-white': isMastered(entry),
                            'border-slate-300 bg-white text-slate-400 hover:border-slate-400':
                              !isMastered(entry),
                          }}
                        >
                          <span
                            class="text-sm font-bold"
                            classList={{ invisible: !isMastered(entry) }}
                            aria-hidden="true"
                          >
                            ✓
                          </span>
                        </button>
                      </td>
                      <td class="px-3 py-2 text-center">
                        <span
                          class="text-xs font-medium tabular-nums text-slate-500"
                          title={t('Error count')}
                        >
                          {entry.source.errorCount + entry.target.errorCount}×
                        </span>
                      </td>
                      <td class="flex justify-center px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleRemove(entry.id)}
                          aria-label="Remove"
                          class="rounded px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-error-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
