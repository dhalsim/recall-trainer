import { useNavigate } from '@solidjs/router';
import { createSignal, For, onMount } from 'solid-js';

import { t } from '../i18n';
import { LANGUAGE_LABELS } from '../lib/language-pairs';
import type { AppLanguage, StudyEntry } from '../store';
import { store } from '../store';
import { daysFromTodayTo } from '../utils/date';
import { logger } from '../utils/logger';
const { error: logError } = logger();

export function WordEntry() {
  const [source, setSource] = createSignal('');
  const [target, setTarget] = createSignal('');
  const [error, setError] = createSignal(false);
  const [hideMastered, setHideMastered] = createSignal(false);
  /** When set, form is in edit mode; save updates this entry. When empty, save creates a new entry. */
  const [editingEntryId, setEditingEntryId] = createSignal<string | null>(null);
  /** ID of the entry whose details row is expanded, or null. */
  const [expandedEntryId, setExpandedEntryId] = createSignal<string | null>(null);
  /** Paste textarea value. */
  const [pasteText, setPasteText] = createSignal('');

  /** Message after paste (success or validation error). */
  const [pasteMessage, setPasteMessage] = createSignal<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  let sourceRef: HTMLInputElement | undefined;
  let targetRef: HTMLInputElement | undefined;

  onMount(() => {
    requestAnimationFrame(() => sourceRef?.focus());
  });

  const mainLang = (): AppLanguage => store.state().mainLanguage ?? 'en';
  const targetLang = (): AppLanguage => store.state().targetLanguage ?? 'ja';
  const entries = () => store.getActiveEntries();

  const visibleEntries = () =>
    hideMastered() ? entries().filter((e) => !(e.source.correct && e.target.correct)) : entries();

  const sourceLabel = () => LANGUAGE_LABELS[mainLang()];
  const targetLabel = () => LANGUAGE_LABELS[targetLang()];

  const saveEntry = (): boolean => {
    const s = (sourceRef?.value ?? '').trim();
    const tgt = (targetRef?.value ?? '').trim();

    if (!s || !tgt) {
      return false;
    }

    const id = editingEntryId();

    try {
      if (id) {
        store.updateEntry(id, s, tgt);
      } else {
        store.addEntry(s, tgt);
      }
    } catch (err) {
      logError('[WordEntry] save entry failed:', err);

      return false;
    }

    setSource('');
    setTarget('');
    setEditingEntryId(null);

    if (sourceRef) {
      sourceRef.value = '';
    }

    if (targetRef) {
      targetRef.value = '';
    }

    setError(false);

    return true;
  };

  const navigate = useNavigate();

  const handleBack = () => {
    store.goToModeSelection();
    navigate('/mode');
  };

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
      requestAnimationFrame(() => sourceRef?.focus());
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

  const handleEdit = (entry: StudyEntry) => {
    setEditingEntryId(entry.id);
    setSource(entry.source.text);
    setTarget(entry.target.text);
    setError(false);

    requestAnimationFrame(() => {
      sourceRef?.focus();
    });
  };

  const isMastered = (entry: StudyEntry) => entry.source.correct && entry.target.correct;

  const toggleCorrect = (id: string, currentlyMastered: boolean) =>
    store.setEntryCorrect(id, !currentlyMastered);

  /** Format next review for display: "Due today", "Due tomorrow", or "Due in X days". */
  const formatDueLabel = (nextReviewAt: number): string => {
    const days = daysFromTodayTo(nextReviewAt);

    if (days <= 0) {
      return t('Due today');
    }

    if (days === 1) {
      return t('Due tomorrow');
    }

    return t('Due in {{count}} days', { count: days });
  };

  /**
   * Parse pasted text: one pair per line, format "source | target".
   * Returns { added, skipped }. Empty lines are ignored; lines without valid source and target count as skipped.
   */
  const parsePaste = (text: string): { pairs: [string, string][]; skipped: number } => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const pairs: [string, string][] = [];
    let skipped = 0;
    for (const line of lines) {
      const sep = line.includes('|') ? line.indexOf('|') : -1;

      if (sep === -1) {
        skipped += 1;
        continue;
      }

      const sourcePart = line.slice(0, sep).trim();
      const targetPart = line.slice(sep + 1).trim();

      if (!sourcePart || !targetPart) {
        skipped += 1;
        continue;
      }

      pairs.push([sourcePart, targetPart]);
    }

    return { pairs, skipped };
  };

  const handlePaste = () => {
    const text = pasteText().trim();
    setPasteMessage(null);

    if (!text) {
      setPasteMessage({
        type: 'error',
        text: t('No valid pairs in paste. Use format: source | target (one per line).'),
      });

      return;
    }

    const { pairs, skipped } = parsePaste(text);

    if (pairs.length === 0) {
      setPasteMessage({
        type: 'error',
        text: t('No valid pairs in paste. Use format: source | target (one per line).'),
      });

      return;
    }

    for (const [s, tgt] of pairs) {
      store.addEntry(s, tgt);
    }

    setPasteText('');

    const addedMsg =
      pairs.length === 1
        ? t('Added {{count}} pair.', { count: 1 })
        : t('Added {{count}} pairs.', { count: pairs.length });

    const skippedMsg =
      skipped === 0
        ? ''
        : skipped === 1
          ? t('Skipped {{count}} invalid line (missing or empty source or target).', { count: 1 })
          : t('Skipped {{count}} invalid lines (missing or empty source or target).', {
              count: skipped,
            });

    setPasteMessage({
      type: 'success',
      text: skippedMsg ? `${addedMsg} ${skippedMsg}` : addedMsg,
    });
  };

  const toggleExpanded = (id: string) => {
    setExpandedEntryId((prev) => (prev === id ? null : id));
  };

  /** Export entries as "source | target" per line and copy to clipboard. */
  const [exportFeedback, setExportFeedback] = createSignal<string | null>(null);

  const handleExport = async () => {
    const list = entries();

    if (list.length === 0) {
      setExportFeedback(t('No entries to export.'));
      setTimeout(() => setExportFeedback(null), 2000);

      return;
    }

    const text = list.map((e) => `${e.source.text} | ${e.target.text}`).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setExportFeedback(t('Copied to clipboard'));
      setTimeout(() => setExportFeedback(null), 1000);
    } catch (err) {
      logError('[WordEntry] clipboard write failed:', err);
      setExportFeedback(t('Copy failed'));
      setTimeout(() => setExportFeedback(null), 2000);
    }
  };

  return (
    <div class="mx-auto max-w-2xl space-y-6 sm:space-y-8">
      <button
        type="button"
        onClick={handleBack}
        class="-ml-1 text-sm font-medium text-primary-600 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded"
      >
        ← {t('Back')}
      </button>

      <h1 class="text-2xl font-bold text-slate-900 sm:text-3xl">Recall Trainer</h1>
      <p class="text-slate-600">{t('Enter words in both columns to add a pair.')}</p>

      <div class="space-y-2">
        <div class="grid grid-cols-[1fr_1fr] gap-3 sm:gap-4">
          <div class="space-y-1">
            <label for="source-input" class="block text-sm font-medium text-slate-700">
              {sourceLabel()}
            </label>
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
              aria-invalid={error() && !source().trim()}
              aria-describedby={error() ? 'source-target-error' : undefined}
              class="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-slate-800 placeholder-slate-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              classList={{
                'border-error-500': error() && !source().trim(),
              }}
            />
          </div>
          <div class="space-y-1">
            <label for="target-input" class="block text-sm font-medium text-slate-700">
              {targetLabel()}
            </label>
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
              aria-invalid={error() && !target().trim()}
              aria-describedby={error() ? 'source-target-error' : undefined}
              class="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-slate-800 placeholder-slate-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              classList={{
                'border-error-500': error() && !target().trim(),
              }}
            />
          </div>
        </div>
        {error() && (
          <p id="source-target-error" class="text-sm text-error-500" role="alert">
            {t('Both source and target are required.')}
          </p>
        )}
      </div>

      <div class="space-y-2">
        <h2 class="text-lg font-semibold text-slate-800">{t('Paste vocabulary')}</h2>
        <label for="paste-vocabulary" class="block text-sm text-slate-600">
          {t('Paste one pair per line in the form: source | target. Empty lines are ignored.')}
        </label>
        <textarea
          id="paste-vocabulary"
          value={pasteText()}
          onInput={(e) => {
            setPasteText(e.currentTarget.value);
            setPasteMessage(null);
          }}
          placeholder="hello | こんにちは"
          rows={4}
          aria-invalid={pasteMessage()?.type === 'error'}
          aria-describedby={pasteMessage() ? 'paste-message' : undefined}
          class="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-slate-800 placeholder-slate-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          classList={{
            'border-error-500': pasteMessage()?.type === 'error',
          }}
        />
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePaste}
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {t('Add from paste')}
          </button>
        </div>
        {pasteMessage() && (
          <p
            id="paste-message"
            role="alert"
            class="text-sm"
            classList={{
              'text-success-500': pasteMessage()?.type === 'success',
              'text-error-500': pasteMessage()?.type === 'error',
            }}
          >
            {pasteMessage()?.text}
          </p>
        )}
      </div>

      {entries().length > 0 && (
        <div class="space-y-3">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="text-2xl font-bold text-slate-900">{t('Vocabulary Entries')}</h1>
            <button
              type="button"
              onClick={handleExport}
              class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
            >
              {t('Export as text')}
            </button>
            {exportFeedback() && (
              <span class="text-sm text-slate-500" role="status">
                {exportFeedback()}
              </span>
            )}
          </div>
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
                    class="w-10 px-1 py-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500"
                    aria-label={t('Show details')}
                  >
                    <span class="sr-only">{t('Show details')}</span>
                  </th>
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
                    {t('Edit')}
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
                  {(entry) => {
                    const expanded = () => expandedEntryId() === entry.id;

                    return (
                      <>
                        <tr class="border-t border-slate-200 bg-white">
                          <td class="w-10 px-1 py-2 align-middle">
                            <button
                              type="button"
                              onClick={() => toggleExpanded(entry.id)}
                              aria-label={expanded() ? t('Hide details') : t('Show details')}
                              aria-expanded={expanded()}
                              class="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-500 transition-transform hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              classList={{ 'rotate-90': expanded() }}
                            >
                              <span aria-hidden="true">›</span>
                            </button>
                          </td>
                          <td class="px-3 py-2 text-center text-slate-800">{entry.source.text}</td>
                          <td class="px-3 py-2 text-center text-slate-800">{entry.target.text}</td>
                          <td class="px-3 py-2">
                            <div class="flex justify-center">
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
                            </div>
                          </td>
                          <td class="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleEdit(entry)}
                              aria-label={t('Edit')}
                              class="rounded px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              ✎
                            </button>
                          </td>
                          <td class="px-3 py-2 text-center">
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
                        {expanded() && (
                          <tr class="border-t border-slate-200 bg-slate-50/80">
                            <td colspan="6" class="px-3 py-3">
                              <table class="w-full max-w-md border-collapse rounded border border-slate-200 bg-white text-sm">
                                <thead>
                                  <tr class="bg-slate-100">
                                    <th
                                      scope="col"
                                      class="px-3 py-1.5 text-left text-xs font-medium text-slate-600"
                                    >
                                      {t('Direction')}
                                    </th>
                                    <th
                                      scope="col"
                                      class="px-3 py-1.5 text-left text-xs font-medium text-slate-600"
                                    >
                                      {t('Next review')}
                                    </th>
                                    <th
                                      scope="col"
                                      class="px-3 py-1.5 text-center text-xs font-medium text-slate-600"
                                    >
                                      {t('Level')}
                                    </th>
                                    <th
                                      scope="col"
                                      class="px-3 py-1.5 text-center text-xs font-medium text-slate-600"
                                    >
                                      {t('Errors')}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr class="border-t border-slate-200">
                                    <td class="px-3 py-1.5 text-slate-700">
                                      {t('Source → Target')}
                                    </td>
                                    <td class="px-3 py-1.5 text-slate-700">
                                      {formatDueLabel(entry.source.nextReviewAt)}
                                    </td>
                                    <td class="px-3 py-1.5 text-center tabular-nums text-slate-700">
                                      {entry.source.level}
                                    </td>
                                    <td class="px-3 py-1.5 text-center tabular-nums text-slate-700">
                                      {entry.source.errorCount}
                                    </td>
                                  </tr>
                                  <tr class="border-t border-slate-200">
                                    <td class="px-3 py-1.5 text-slate-700">
                                      {t('Target → Source')}
                                    </td>
                                    <td class="px-3 py-1.5 text-slate-700">
                                      {formatDueLabel(entry.target.nextReviewAt)}
                                    </td>
                                    <td class="px-3 py-1.5 text-center tabular-nums text-slate-700">
                                      {entry.target.level}
                                    </td>
                                    <td class="px-3 py-1.5 text-center tabular-nums text-slate-700">
                                      {entry.target.errorCount}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
