import { createSignal } from 'solid-js';

import { setLocale } from './i18n';

export const SETTINGS_VERSION = 3;

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
  phase: 'question' | 'answer_feedback' | 'round_summary';
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

/** Per-side (source or target) text, correctness, and error count. */
export interface SourceOrTarget {
  type: 'source' | 'target';
  text: string;
  correct: boolean;
  errorCount: number;
}

export interface VocabEntry {
  id: string;
  source: SourceOrTarget;
  target: SourceOrTarget;
}

/** V2 shape: flat source/target strings and shared correct flags. Used for migration only. */
interface VocabEntryV2Legacy {
  id: string;
  source: string;
  target: string;
  correctSourceToTarget: boolean;
  correctTargetToSource: boolean;
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

interface AppStateV2 {
  version: 2;
  mainLanguage?: AppLanguage | null;
  targetLanguage?: AppLanguage | null;
  languageSelectionComplete?: boolean;
  screen?: AppScreen;
  entries?: VocabEntryV2Legacy[];
}

export type AppScreen = 'mode_selection' | 'word_entry' | 'test';

export const QUESTIONS_PER_SESSION_MIN = 1;
export const QUESTIONS_PER_SESSION_MAX = 50;
export const QUESTIONS_PER_SESSION_DEFAULT = 5;

export interface AppState {
  version: number;
  mainLanguage: AppLanguage | null;
  targetLanguage: AppLanguage | null;
  languageSelectionComplete: boolean;
  screen: AppScreen;
  entries: VocabEntry[];
  questionsPerSession: number;
}

const defaultState: AppState = {
  version: SETTINGS_VERSION,
  mainLanguage: null,
  targetLanguage: null,
  languageSelectionComplete: false,
  screen: 'mode_selection',
  entries: [],
  questionsPerSession: QUESTIONS_PER_SESSION_DEFAULT,
};

function toSourceOrTarget(
  type: 'source' | 'target',
  text: string,
  correct: boolean,
  errorCount: number,
): SourceOrTarget {
  return { type, text, correct, errorCount };
}

/**
 * Migrate persisted state from version 1 to version 2 (per-direction correct flags).
 * Keep this so very old state (v1) can still be upgraded.
 */
function migrateV1ToV2(parsed: AppStateV1): AppStateV2 {
  const correctDefault = false;

  const entries: VocabEntryV2Legacy[] = (parsed.entries ?? []).map((e) => {
    const correct = e.correct ?? correctDefault;

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      correctSourceToTarget: correct,
      correctTargetToSource: correct,
      errorCount: e.errorCount ?? 0,
    };
  });

  return {
    version: 2,
    mainLanguage: parsed.mainLanguage ?? null,
    targetLanguage: parsed.targetLanguage ?? null,
    languageSelectionComplete: parsed.languageSelectionComplete ?? false,
    screen: parsed.screen ?? 'mode_selection',
    entries,
  };
}

/**
 * Migrate persisted state from version 2 to version 3 (per-side source/target).
 * V2 had a single errorCount; we put it on the source side to avoid double-counting.
 * Keep this so state from v2 can still be upgraded.
 */
function migrateV2ToV3(parsed: AppStateV2): AppState {
  const entries: VocabEntry[] = (parsed.entries ?? []).map((e) => ({
    id: e.id,
    source: toSourceOrTarget('source', e.source, e.correctSourceToTarget, e.errorCount ?? 0),
    target: toSourceOrTarget('target', e.target, e.correctTargetToSource, 0),
  }));

  return {
    version: SETTINGS_VERSION,
    questionsPerSession: QUESTIONS_PER_SESSION_DEFAULT,
    mainLanguage: parsed.mainLanguage ?? null,
    targetLanguage: parsed.targetLanguage ?? null,
    languageSelectionComplete: parsed.languageSelectionComplete ?? false,
    screen: parsed.screen ?? 'mode_selection',
    entries,
  };
}

/** Run migrations one by one until state reaches SETTINGS_VERSION. */
function migrateToLatest(parsed: { version?: number; [key: string]: unknown }): AppState {
  let state: AppStateV1 | AppStateV2 | AppState = parsed as AppStateV1;
  const version = state.version ?? 1;

  if (version > SETTINGS_VERSION) {
    return { ...defaultState };
  }

  while (state.version !== SETTINGS_VERSION) {
    if (state.version === 1) {
      state = migrateV1ToV2(state as AppStateV1);
    } else if (state.version === 2) {
      state = migrateV2ToV3(state as AppStateV2);
    } else {
      return { ...defaultState };
    }
  }

  return state as AppState;
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return { ...defaultState };
    }

    const parsed = JSON.parse(raw) as { version?: number; [key: string]: unknown };
    const version = parsed.version ?? 1;

    if (version > SETTINGS_VERSION) {
      return { ...defaultState };
    }

    if (version < SETTINGS_VERSION) {
      const migrated = migrateToLatest(parsed);
      const merged = { ...defaultState, ...migrated, entries: migrated.entries ?? [] };
      saveState(merged);

      return merged;
    }

    const appState = parsed as unknown as AppState;

    return {
      ...defaultState,
      ...appState,
      version: SETTINGS_VERSION,
      entries: appState.entries ?? [],
      questionsPerSession:
        typeof appState.questionsPerSession === 'number'
          ? Math.min(
              QUESTIONS_PER_SESSION_MAX,
              Math.max(QUESTIONS_PER_SESSION_MIN, appState.questionsPerSession),
            )
          : defaultState.questionsPerSession,
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

  const addEntry = (sourceText: string, targetText: string): void => {
    const entry: VocabEntry = {
      id: generateId(),
      source: toSourceOrTarget('source', sourceText.trim(), false, 0),
      target: toSourceOrTarget('target', targetText.trim(), false, 0),
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
      entries: prev.entries.map((e) => {
        if (e.id !== id) {
          return e;
        }

        if (isSourceToTarget) {
          return {
            ...e,
            source: {
              ...e.source,
              correct: wasCorrect,
              errorCount: wasCorrect ? e.source.errorCount : e.source.errorCount + 1,
            },
          };
        }

        return {
          ...e,
          target: {
            ...e.target,
            correct: wasCorrect,
            errorCount: wasCorrect ? e.target.errorCount : e.target.errorCount + 1,
          },
        };
      }),
    }));
  };

  const setEntryCorrect = (id: string, correct: boolean): void => {
    persist((prev) => ({
      ...prev,
      entries: prev.entries.map((e) =>
        e.id !== id
          ? e
          : {
              ...e,
              source: { ...e.source, correct, errorCount: correct ? 0 : e.source.errorCount },
              target: { ...e.target, correct, errorCount: correct ? 0 : e.target.errorCount },
            },
      ),
    }));
  };

  const setQuestionsPerSession = (value: number): void => {
    const clamped = Math.min(
      QUESTIONS_PER_SESSION_MAX,
      Math.max(QUESTIONS_PER_SESSION_MIN, Math.round(value)),
    );

    persist((prev) => ({ ...prev, questionsPerSession: clamped }));
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
    setQuestionsPerSession,
  };
}

export const store = createStore();
