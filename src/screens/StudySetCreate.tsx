import { useNavigate } from '@solidjs/router';
import { createSignal } from 'solid-js';

import { t } from '../i18n';
import type { StudyItem } from '../lib/study-sets/types';
import { store } from '../store';

function makeItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function StudySetCreate() {
  const navigate = useNavigate();
  const [name, setName] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [tagsInput, setTagsInput] = createSignal('');
  const [levelInput, setLevelInput] = createSignal(1);
  const [pairsInput, setPairsInput] = createSignal('');
  const [errorText, setErrorText] = createSignal<string | null>(null);

  const parsePairs = (value: string): StudyItem[] => {
    const lines = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const items: StudyItem[] = [];
    for (const line of lines) {
      const sep = line.indexOf('|');

      if (sep < 0) {
        continue;
      }

      const source = line.slice(0, sep).trim();
      const target = line.slice(sep + 1).trim();

      if (!source || !target) {
        continue;
      }

      items.push({
        id: makeItemId(),
        type: 'vocab',
        source,
        target,
      });
    }

    return items;
  };

  const handleCreate = () => {
    const trimmedName = name().trim();
    const items = parsePairs(pairsInput());
    const level = Math.min(10, Math.max(1, Math.round(levelInput())));

    if (!trimmedName) {
      setErrorText(t('Set name is required.'));

      return;
    }

    if (items.length === 0) {
      setErrorText(t('Add at least one valid pair in source | target format.'));

      return;
    }

    const tags = tagsInput()
      .split(',')
      .map((tag) => tag.trim().replace(/^#/, ''))
      .filter(Boolean);

    store.createLocalStudySet({
      name: trimmedName,
      description: description().trim(),
      tags,
      level,
      items,
    });

    store.setScreen('mode_selection');
    navigate('/study-sets/my');
  };

  return (
    <div class="mx-auto max-w-md space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-900">{t('Create Study Set')}</h1>
        <button
          type="button"
          onClick={() => navigate('/study-sets/my')}
          class="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
        >
          {t('Back')}
        </button>
      </div>

      <div class="space-y-3">
        <label class="block text-sm font-medium text-slate-700">{t('Set name')}</label>
        <input
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          class="w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder={t('e.g. Travel Basics')}
        />

        <label class="block text-sm font-medium text-slate-700">{t('Description')}</label>
        <textarea
          value={description()}
          onInput={(e) => setDescription(e.currentTarget.value)}
          class="w-full rounded-md border border-slate-300 px-3 py-2"
          rows={3}
        />

        <label class="block text-sm font-medium text-slate-700">
          {t('Tags (comma separated)')}
        </label>
        <input
          value={tagsInput()}
          onInput={(e) => setTagsInput(e.currentTarget.value)}
          class="w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="travel, food, beginner"
        />

        <label class="block text-sm font-medium text-slate-700">{t('Level')}</label>
        <input
          type="number"
          min={1}
          max={10}
          value={levelInput()}
          onInput={(e) => setLevelInput(e.currentTarget.valueAsNumber || 1)}
          class="w-full rounded-md border border-slate-300 px-3 py-2"
        />

        <label class="block text-sm font-medium text-slate-700">
          {t('Items (one per line, source | target)')}
        </label>
        <textarea
          value={pairsInput()}
          onInput={(e) => setPairsInput(e.currentTarget.value)}
          class="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
          rows={8}
          placeholder={'hello | こんにちは\nthank you | ありがとう'}
        />
      </div>

      {errorText() && (
        <p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorText()}
        </p>
      )}

      <button
        type="button"
        onClick={handleCreate}
        class="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
      >
        {t('Create Study Set')}
      </button>
    </div>
  );
}
