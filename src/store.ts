import { createSignal } from 'solid-js';

import { setLocale } from './i18n';
import type { AuthLoginState } from './lib/nostr/types';
import { setSimulationTime } from './utils/clock';
import { addDaysFromToday, endOfToday, realStartOfToday, startOfToday } from './utils/date';
import { logger, setLogSignalEnabled } from './utils/logger';

export const SETTINGS_VERSION = 5;
const { error: logError } = logger();

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
  /** Fixed batch of entry IDs for this session (selected once at start). */
  sessionBatchIds: string[];
}

export type StudyItemType = 'vocab' | 'phrase' | 'qa' | 'cloze';

/** Per-side (source or target) text, correctness, error count, and review schedule. */
export interface StudySide {
  type: 'source' | 'target';
  text: string;
  /** Optional alternate accepted answers for the side currently being asked. */
  acceptedAnswers?: string[];
  correct: boolean;
  errorCount: number;
  /** Timestamp of start of the review day (local midnight). */
  nextReviewAt: number;
  /** 0..REVIEW_MAX_LEVEL, index into REVIEW_INTERVAL_DAYS. */
  level: number;
}

export interface StudyEntry {
  id: string;
  itemType?: StudyItemType;
  description?: string;
  hints?: string;
  source: StudySide;
  target: StudySide;
}

export type AppScreen = 'mode_selection' | 'word_entry' | 'test';

export const NUMBER_OF_ITEMS_MIN = 1;
export const NUMBER_OF_ITEMS_MAX = 50;
export const NUMBER_OF_ITEMS_DEFAULT = 5;

/** Max rounds per session (S→T + T→S) before forcing session end. */
export const MAX_SESSION_ROUNDS = 10;

/** Fibonacci intervals (days) for spaced repetition: level i → next review in REVIEW_INTERVAL_DAYS[i] days. */
export const REVIEW_INTERVAL_DAYS = [0, 1, 1, 2, 3, 5, 8, 13] as const;

export const REVIEW_MAX_LEVEL = REVIEW_INTERVAL_DAYS.length - 1;

/** True if the source side (Source→Target) is due for review today. */
export function isSourceDue(entry: StudyEntry): boolean {
  return entry.source.nextReviewAt <= endOfToday();
}

/** True if the target side (Target→Source) is due for review today. */
export function isTargetDue(entry: StudyEntry): boolean {
  return entry.target.nextReviewAt <= endOfToday();
}

/** Entries that have at least one side due for review today. */
export function getEntriesWithDueSide(entries: StudyEntry[]): StudyEntry[] {
  return entries.filter((e) => isSourceDue(e) || isTargetDue(e));
}

/** Entries whose source side is due (Source→Target direction). */
export function getDueSourceToTarget(entries: StudyEntry[]): StudyEntry[] {
  return entries.filter(isSourceDue);
}

/** Entries whose target side is due (Target→Source direction). */
export function getDueTargetToSource(entries: StudyEntry[]): StudyEntry[] {
  return entries.filter(isTargetDue);
}

export interface AppState {
  version: number;
  mainLanguage: AppLanguage | null;
  targetLanguage: AppLanguage | null;
  /** UI language; when null, mainLanguage is used. */
  appLocale: AppLanguage | null;
  languageSelectionComplete: boolean;
  screen: AppScreen;
  entries: StudyEntry[];
  numberOfItems: number;
  /** When true, date utils use simulationDate instead of real time. */
  simulationMode: boolean;
  /** Start-of-day timestamp for the simulated "today". */
  simulationDate: number | null;
  /** Nostr auth state (optional). Persisted; restored on load. */
  authLoginState: AuthLoginState | null;
  /** If true, app logs are also mirrored to an in-memory signal buffer. */
  logWithSignal: boolean;
}

/** NIP-78 sync payload: whitelisted keys only. Used when pulling from relays. */
export type SyncPayload = Pick<
  AppState,
  | 'version'
  | 'mainLanguage'
  | 'targetLanguage'
  | 'languageSelectionComplete'
  | 'entries'
  | 'numberOfItems'
>;

const defaultState: AppState = {
  version: SETTINGS_VERSION,
  mainLanguage: null,
  targetLanguage: null,
  appLocale: null,
  languageSelectionComplete: false,
  screen: 'mode_selection',
  entries: [],
  numberOfItems: NUMBER_OF_ITEMS_DEFAULT,
  simulationMode: false,
  simulationDate: null,
  authLoginState: null,
  logWithSignal: false,
};

function toStudySide(
  type: 'source' | 'target',
  text: string,
  correct: boolean,
  errorCount: number,
  nextReviewAt: number = startOfToday(),
  level: number = 0,
): StudySide {
  return { type, text, correct, errorCount, nextReviewAt, level };
}

function normalizeStudyEntry(entry: StudyEntry, now: number): StudyEntry {
  return {
    ...entry,
    itemType: entry.itemType ?? 'vocab',
    source: {
      ...entry.source,
      nextReviewAt: typeof entry.source.nextReviewAt === 'number' ? entry.source.nextReviewAt : now,
      level: typeof entry.source.level === 'number' ? entry.source.level : 0,
    },
    target: {
      ...entry.target,
      nextReviewAt: typeof entry.target.nextReviewAt === 'number' ? entry.target.nextReviewAt : now,
      level: typeof entry.target.level === 'number' ? entry.target.level : 0,
    },
  };
}

function applyClockFromState(s: AppState): void {
  if (s.simulationMode && s.simulationDate != null) {
    setSimulationTime(s.simulationDate);
  } else {
    setSimulationTime(null);
  }
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      const state = { ...defaultState };
      applyClockFromState(state);

      return state;
    }

    const appState = JSON.parse(raw) as AppState;
    const version = appState.version ?? 0;

    if (version < 5) {
      localStorage.removeItem(STORAGE_KEY);
      // Force a clean boot after clearing incompatible persisted state.
      window.location.reload();

      return { ...defaultState };
    }

    if (version !== SETTINGS_VERSION) {
      const state = { ...defaultState };
      applyClockFromState(state);

      return state;
    }

    const rawEntries = appState.entries ?? [];
    const now = startOfToday();

    const entries: StudyEntry[] = rawEntries.map((entry) => normalizeStudyEntry(entry, now));

    const state = {
      ...defaultState,
      ...appState,
      version: SETTINGS_VERSION,
      entries,
      appLocale: appState.appLocale ?? null,
      numberOfItems:
        typeof appState.numberOfItems === 'number'
          ? Math.min(NUMBER_OF_ITEMS_MAX, Math.max(NUMBER_OF_ITEMS_MIN, appState.numberOfItems))
          : defaultState.numberOfItems,
      simulationMode: appState.simulationMode ?? false,
      simulationDate: appState.simulationDate ?? null,
      authLoginState: (appState as AppState).authLoginState ?? defaultState.authLoginState,
    };

    applyClockFromState(state);

    return state;
  } catch (err) {
    logError('[store] Failed to load state:', err);
    setSimulationTime(null);

    return { ...defaultState };
  }
}

function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    logError('[store] Failed to save state:', err);
  }
}

function createStore() {
  const initialState = loadState();
  setLogSignalEnabled(initialState.logWithSignal);
  const [state, setState] = createSignal<AppState>(initialState);
  const [testSession, setTestSession] = createSignal<TestSessionSnapshot | null>(null);

  const effectiveLocale = initialState.appLocale ?? initialState.mainLanguage;

  if (effectiveLocale) {
    setLocale(effectiveLocale);
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

  const setAppLocale = (lang: AppLanguage | null): void => {
    persist((prev) => ({ ...prev, appLocale: lang }));
    const effective = lang ?? state().mainLanguage;

    if (effective) {
      setLocale(effective);
    }
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

  const setEntries = (entries: StudyEntry[]): void => {
    persist((prev) => ({ ...prev, entries }));
  };

  const addEntry = (sourceText: string, targetText: string): void => {
    const now = startOfToday();

    const entry: StudyEntry = {
      id: generateId(),
      itemType: 'vocab',
      source: toStudySide('source', sourceText.trim(), false, 0, now, 0),
      target: toStudySide('target', targetText.trim(), false, 0, now, 0),
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

  const updateEntry = (id: string, sourceText: string, targetText: string): void => {
    const s = sourceText.trim();
    const t = targetText.trim();

    if (!s || !t) {
      return;
    }

    persist((prev) => ({
      ...prev,
      entries: prev.entries.map((e) =>
        e.id !== id
          ? e
          : {
              ...e,
              source: { ...e.source, text: s },
              target: { ...e.target, text: t },
            },
      ),
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
          const nextLevel = wasCorrect ? Math.min(e.source.level + 1, REVIEW_MAX_LEVEL) : 0;

          const intervalDays = REVIEW_INTERVAL_DAYS[nextLevel];

          return {
            ...e,
            source: {
              ...e.source,
              correct: wasCorrect,
              errorCount: wasCorrect ? e.source.errorCount : e.source.errorCount + 1,
              level: nextLevel,
              nextReviewAt: addDaysFromToday(intervalDays),
            },
          };
        }

        const nextLevel = wasCorrect ? Math.min(e.target.level + 1, REVIEW_MAX_LEVEL) : 0;

        const intervalDays = REVIEW_INTERVAL_DAYS[nextLevel];

        return {
          ...e,
          target: {
            ...e.target,
            correct: wasCorrect,
            errorCount: wasCorrect ? e.target.errorCount : e.target.errorCount + 1,
            level: nextLevel,
            nextReviewAt: addDaysFromToday(intervalDays),
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

  const setNumberOfItems = (value: number): void => {
    const clamped = Math.min(NUMBER_OF_ITEMS_MAX, Math.max(NUMBER_OF_ITEMS_MIN, Math.round(value)));

    persist((prev) => ({ ...prev, numberOfItems: clamped }));
  };

  const setSimulationMode = (enabled: boolean): void => {
    if (enabled) {
      const now = realStartOfToday();
      setSimulationTime(now);

      persist((prev) => ({
        ...prev,
        simulationMode: true,
        simulationDate: now,
      }));
    } else {
      setSimulationTime(null);

      persist((prev) => ({
        ...prev,
        simulationMode: false,
        simulationDate: null,
      }));
    }
  };

  const advanceSimulationDay = (): void => {
    const nextDay = addDaysFromToday(1);
    setSimulationTime(nextDay);

    persist((prev) => ({
      ...prev,
      simulationDate: nextDay,
    }));
  };

  const setAuthLoginState = (authLoginState: AuthLoginState | null): void => {
    persist((prev) => ({ ...prev, authLoginState }));
  };

  const clearAuthLoginState = (): void => {
    persist((prev) => ({ ...prev, authLoginState: null }));
  };

  const setLogWithSignal = (enabled: boolean): void => {
    setLogSignalEnabled(enabled);
    persist((prev) => ({ ...prev, logWithSignal: enabled }));
  };

  /** Apply NIP-78 sync payload from relays (pull). Merges payload into state and persists. */
  const applySyncPayload = (payload: SyncPayload): void => {
    const now = startOfToday();
    const rawEntries = payload.entries ?? [];

    const entries: StudyEntry[] = rawEntries.map((entry) => normalizeStudyEntry(entry, now));

    setState((prev) => {
      const next: AppState = {
        ...prev,
        version: payload.version ?? prev.version,
        mainLanguage: payload.mainLanguage ?? prev.mainLanguage,
        targetLanguage: payload.targetLanguage ?? prev.targetLanguage,
        languageSelectionComplete:
          payload.languageSelectionComplete ?? prev.languageSelectionComplete,
        entries,
        numberOfItems:
          typeof payload.numberOfItems === 'number'
            ? Math.min(NUMBER_OF_ITEMS_MAX, Math.max(NUMBER_OF_ITEMS_MIN, payload.numberOfItems))
            : prev.numberOfItems,
      };

      saveState(next);
      applyClockFromState(next);

      return next;
    });
  };

  return {
    state,
    testSession,
    setTestSession,
    clearTestSession,
    setMainLanguage,
    setTargetLanguage,
    setAppLocale,
    completeLanguageSelection,
    setScreen,
    goToModeSelection,
    setEntries,
    addEntry,
    removeEntry,
    updateEntry,
    clearEntries,
    recordAnswer,
    setEntryCorrect,
    setNumberOfItems,
    setSimulationMode,
    advanceSimulationDay,
    setAuthLoginState,
    clearAuthLoginState,
    setLogWithSignal,
    applySyncPayload,
  };
}

export const store = createStore();
