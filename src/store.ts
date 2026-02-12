import { createSignal } from 'solid-js';

import { setLocale } from './i18n';

export const SETTINGS_VERSION = 2;

/** Generate a unique ID. Falls back to Math.random when crypto.randomUUID is unavailable (non-secure context). */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 11);
}

const STORAGE_KEY = 'recall-trainer-state';

export type AppLanguage = 'en' | 'ja' | 'tr';

export type QuizDirection = 'source_to_target' | 'target_to_source';

/** In-memory only (not persisted). Used to restore test UI after remount. */
export interface TestSessionSnapshot {
  phase: 'question' | 'round_summary';
  direction: QuizDirection;
  sourceToTargetIds: string[];
  targetToSourceIds: string[];
  currentRoundEntryIds: string[];
  currentIndex: number;
  totalCorrect: number;
  totalIncorrect: number;
  roundResults: { entryId: string; correct: boolean; userAnswer: string }[];
  totalQuestionsAtStart: number;
  totalBatchesAtStart: number;
  currentBatchIndex: number;
}

export interface VocabEntry {
  id: string;
  source: string;
  target: string;
  /** True when answered correctly in source → target direction (this round). */
  correctSourceToTarget: boolean;
  /** True when answered correctly in target → source direction (this round). */
  correctTargetToSource: boolean;
  /** Number of times answered incorrectly (statistics). */
  errorCount: number;
}

/** Proposed future shape (per-side correct/errorCount). Not used yet; see TODO.md. */
interface _VocabEntryV2 {
  id: string;
  source: SourceOrTarget;
  target: SourceOrTarget;
}

interface SourceOrTarget {
  text: string;
  correct: boolean;
  errorCount: number;
}

/** V1 shape: single "correct" flag. Used for migration only. */
interface VocabEntryV1 {
  id: string;
  source: string;
  target: string;
  correct?: boolean;
  errorCount?: number;
}

interface AppStateV1 {
  version: 1;
  mainLanguage?: AppLanguage | null;
  targetLanguage?: AppLanguage | null;
  languageSelectionComplete?: boolean;
  screen?: AppScreen;
  entries?: VocabEntryV1[];
}

export type AppScreen = 'mode_selection' | 'word_entry' | 'test';

export interface AppState {
  version: number;
  mainLanguage: AppLanguage | null;
  targetLanguage: AppLanguage | null;
  languageSelectionComplete: boolean;
  screen: AppScreen;
  entries: VocabEntry[];
}

const defaultState: AppState = {
  version: SETTINGS_VERSION,
  mainLanguage: null,
  targetLanguage: null,
  languageSelectionComplete: false,
  screen: 'mode_selection',
  entries: [],
};

function normalizeEntry(
  e: (Partial<VocabEntry> & { id: string; source: string; target: string }) | VocabEntryV1,
): VocabEntry {
  const hasV1 = 'correct' in e && e.correct !== undefined;
  const correct = hasV1 ? ((e as VocabEntryV1).correct ?? false) : false;
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    correctSourceToTarget: (e as Partial<VocabEntry>).correctSourceToTarget ?? correct,
    correctTargetToSource: (e as Partial<VocabEntry>).correctTargetToSource ?? correct,
    errorCount: e.errorCount ?? 0,
  };
}

/**
 * Client-side migration: upgrade persisted state from version 1 to version 2.
 * Used in loadState() when parsed.version === 1; the result is persisted back to LocalStorage
 * so the client's stored state is updated and future loads use v2.
 */
function migrateV1ToV2(parsed: AppStateV1): AppState {
  const entries: VocabEntry[] = (parsed.entries ?? []).map((e) =>
    normalizeEntry({
      ...e,
      correct: e.correct ?? false,
    }),
  );
  return {
    version: SETTINGS_VERSION,
    mainLanguage: parsed.mainLanguage ?? null,
    targetLanguage: parsed.targetLanguage ?? null,
    languageSelectionComplete: parsed.languageSelectionComplete ?? false,
    screen: parsed.screen ?? 'mode_selection',
    entries,
  };
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...defaultState };
    }

    const parsed = JSON.parse(raw) as { version?: number; [key: string]: unknown };

    if (parsed.version === 1) {
      const migrated = migrateV1ToV2(parsed as AppStateV1);
      saveState(migrated);
      return migrated;
    }

    if (parsed.version !== SETTINGS_VERSION) {
      return { ...defaultState };
    }

    const appState = parsed as unknown as AppState;
    const entries = (appState.entries ?? []).map(normalizeEntry);

    return {
      ...defaultState,
      ...appState,
      version: SETTINGS_VERSION,
      entries,
    };
  } catch (err) {
    console.error('[store] Failed to load state:', err);
    return { ...defaultState };
  }
}

function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('[store] Failed to save state:', err);
  }
}

function createStore() {
  const initialState = loadState();
  const [state, setState] = createSignal<AppState>(initialState);
  const [testSession, setTestSession] = createSignal<TestSessionSnapshot | null>(null);

  if (initialState.mainLanguage) {
    setLocale(initialState.mainLanguage);
  }

  const persist = (updater: (prev: AppState) => AppState): void => {
    setState((prev) => {
      const next = updater(prev);
      saveState(next);
      return next;
    });
  };

  const clearTestSession = (): void => {
    setTestSession(null);
  };

  const setMainLanguage = (lang: AppLanguage | null): void => {
    if (lang) {
      setLocale(lang);
    }
    persist((prev) => ({ ...prev, mainLanguage: lang }));
  };

  const setTargetLanguage = (lang: AppLanguage | null): void => {
    persist((prev) => ({ ...prev, targetLanguage: lang }));
  };

  const completeLanguageSelection = (): void => {
    persist((prev) => ({ ...prev, languageSelectionComplete: true }));
  };

  const setScreen = (screen: AppScreen): void => {
    persist((prev) => ({ ...prev, screen }));
  };

  const goToModeSelection = (): void => {
    persist((prev) => ({ ...prev, screen: 'mode_selection' }));
  };

  const setEntries = (entries: VocabEntry[]): void => {
    persist((prev) => ({ ...prev, entries }));
  };

  const addEntry = (source: string, target: string): void => {
    const entry: VocabEntry = {
      id: generateId(),
      source: source.trim(),
      target: target.trim(),
      correctSourceToTarget: false,
      correctTargetToSource: false,
      errorCount: 0,
    };
    persist((prev) => ({
      ...prev,
      entries: [...prev.entries, entry],
    }));
  };

  const removeEntry = (id: string): void => {
    persist((prev) => ({
      ...prev,
      entries: prev.entries.filter((e) => e.id !== id),
    }));
  };

  const clearEntries = (): void => {
    persist((prev) => ({ ...prev, entries: [] }));
  };

  const recordAnswer = (id: string, wasCorrect: boolean, direction: QuizDirection): void => {
    const isSourceToTarget = direction === 'source_to_target';
    persist((prev) => ({
      ...prev,
      entries: prev.entries.map((e) =>
        e.id !== id
          ? e
          : {
              ...e,
              correctSourceToTarget: isSourceToTarget ? wasCorrect : e.correctSourceToTarget,
              correctTargetToSource: !isSourceToTarget ? wasCorrect : e.correctTargetToSource,
              errorCount: wasCorrect ? e.errorCount : e.errorCount + 1,
            },
      ),
    }));
  };

  const setEntryCorrect = (id: string, correct: boolean): void => {
    persist((prev) => ({
      ...prev,
      entries: prev.entries.map((e) => {
        const errorCount = correct ? 0 : e.errorCount;

        return e.id !== id
          ? e
          : { ...e, correctSourceToTarget: correct, correctTargetToSource: correct, errorCount };
      }),
    }));
  };

  return {
    state,
    testSession,
    setTestSession,
    clearTestSession,
    setMainLanguage,
    setTargetLanguage,
    completeLanguageSelection,
    setScreen,
    goToModeSelection,
    setEntries,
    addEntry,
    removeEntry,
    clearEntries,
    recordAnswer,
    setEntryCorrect,
  };
}

export const store = createStore();
