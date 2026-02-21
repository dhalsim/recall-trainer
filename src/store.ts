import { createSignal } from 'solid-js';

import { setLocale } from './i18n';
import type { AuthLoginState } from './lib/nostr/types';
import { setSimulationTime } from './utils/clock';
import { addDaysFromToday, endOfToday, realStartOfToday, startOfToday } from './utils/date';
import { logger, setLogSignalEnabled } from './utils/logger';

export const SETTINGS_VERSION = 4;
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

/** Per-side (source or target) text, correctness, error count, and review schedule. */
export interface SourceOrTarget {
  type: 'source' | 'target';
  text: string;
  correct: boolean;
  errorCount: number;
  /** Timestamp of start of the review day (local midnight). */
  nextReviewAt: number;
  /** 0..REVIEW_MAX_LEVEL, index into REVIEW_INTERVAL_DAYS. */
  level: number;
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

/** V3 shape: per-side source/target but without nextReviewAt/level. Used for migration only. */
interface SourceOrTargetV3 {
  type: 'source' | 'target';
  text: string;
  correct: boolean;
  errorCount: number;
}

interface VocabEntryV3 {
  id: string;
  source: SourceOrTargetV3;
  target: SourceOrTargetV3;
}

interface AppStateV3 {
  version: 3;
  mainLanguage?: AppLanguage | null;
  targetLanguage?: AppLanguage | null;
  languageSelectionComplete?: boolean;
  screen?: AppScreen;
  entries?: VocabEntryV3[];
  questionsPerSession?: number;
}

export type AppScreen = 'mode_selection' | 'word_entry' | 'test';

export const QUESTIONS_PER_SESSION_MIN = 1;
export const QUESTIONS_PER_SESSION_MAX = 50;
export const QUESTIONS_PER_SESSION_DEFAULT = 5;

/** Max rounds per session (S→T + T→S) before forcing session end. */
export const MAX_SESSION_ROUNDS = 10;

/** Fibonacci intervals (days) for spaced repetition: level i → next review in REVIEW_INTERVAL_DAYS[i] days. */
export const REVIEW_INTERVAL_DAYS = [0, 1, 1, 2, 3, 5, 8, 13] as const;

export const REVIEW_MAX_LEVEL = REVIEW_INTERVAL_DAYS.length - 1;

/** True if the source side (Source→Target) is due for review today. */
export function isSourceDue(entry: VocabEntry): boolean {
  return entry.source.nextReviewAt <= endOfToday();
}

/** True if the target side (Target→Source) is due for review today. */
export function isTargetDue(entry: VocabEntry): boolean {
  return entry.target.nextReviewAt <= endOfToday();
}

/** Entries that have at least one side due for review today. */
export function getEntriesWithDueSide(entries: VocabEntry[]): VocabEntry[] {
  return entries.filter((e) => isSourceDue(e) || isTargetDue(e));
}

/** Entries whose source side is due (Source→Target direction). */
export function getDueSourceToTarget(entries: VocabEntry[]): VocabEntry[] {
  return entries.filter(isSourceDue);
}

/** Entries whose target side is due (Target→Source direction). */
export function getDueTargetToSource(entries: VocabEntry[]): VocabEntry[] {
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
  entries: VocabEntry[];
  questionsPerSession: number;
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
  | 'questionsPerSession'
>;

const defaultState: AppState = {
  version: SETTINGS_VERSION,
  mainLanguage: null,
  targetLanguage: null,
  appLocale: null,
  languageSelectionComplete: false,
  screen: 'mode_selection',
  entries: [],
  questionsPerSession: QUESTIONS_PER_SESSION_DEFAULT,
  simulationMode: false,
  simulationDate: null,
  authLoginState: null,
  logWithSignal: false,
};

function toSourceOrTarget(
  type: 'source' | 'target',
  text: string,
  correct: boolean,
  errorCount: number,
  nextReviewAt: number = startOfToday(),
  level: number = 0,
): SourceOrTarget {
  return { type, text, correct, errorCount, nextReviewAt, level };
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
 * Output is V3 shape (no nextReviewAt/level). Keep this so state from v2 can still be upgraded.
 */
function migrateV2ToV3(parsed: AppStateV2): AppStateV3 {
  const entries: VocabEntryV3[] = (parsed.entries ?? []).map((e) => ({
    id: e.id,
    source: {
      type: 'source' as const,
      text: e.source,
      correct: e.correctSourceToTarget,
      errorCount: e.errorCount ?? 0,
    },
    target: {
      type: 'target' as const,
      text: e.target,
      correct: e.correctTargetToSource,
      errorCount: 0,
    },
  }));

  return {
    version: 3,
    mainLanguage: parsed.mainLanguage ?? null,
    targetLanguage: parsed.targetLanguage ?? null,
    languageSelectionComplete: parsed.languageSelectionComplete ?? false,
    screen: parsed.screen ?? 'mode_selection',
    entries,
  };
}

/**
 * Migrate persisted state from version 3 to version 4 (add nextReviewAt and level per side).
 * Existing entries become due immediately (level 0, nextReviewAt = start of today).
 */
function migrateV3ToV4(parsed: AppStateV3): AppState {
  const now = startOfToday();

  const entries: VocabEntry[] = (parsed.entries ?? []).map((e) => ({
    id: e.id,
    source: {
      ...e.source,
      nextReviewAt: now,
      level: 0,
    },
    target: {
      ...e.target,
      nextReviewAt: now,
      level: 0,
    },
  }));

  return {
    version: SETTINGS_VERSION,
    mainLanguage: parsed.mainLanguage ?? null,
    targetLanguage: parsed.targetLanguage ?? null,
    appLocale: null,
    languageSelectionComplete: parsed.languageSelectionComplete ?? false,
    screen: parsed.screen ?? 'mode_selection',
    entries,
    questionsPerSession:
      typeof parsed.questionsPerSession === 'number'
        ? Math.min(
            QUESTIONS_PER_SESSION_MAX,
            Math.max(QUESTIONS_PER_SESSION_MIN, parsed.questionsPerSession),
          )
        : QUESTIONS_PER_SESSION_DEFAULT,
    simulationMode: false,
    simulationDate: null,
    authLoginState: null,
    logWithSignal: false,
  };
}

/** Run migrations one by one until state reaches SETTINGS_VERSION. */
function migrateToLatest(parsed: { version?: number; [key: string]: unknown }): AppState {
  let state: AppStateV1 | AppStateV2 | AppStateV3 | AppState = parsed as AppStateV1;
  const version = state.version ?? 1;

  if (version > SETTINGS_VERSION) {
    return { ...defaultState };
  }

  while (state.version !== SETTINGS_VERSION) {
    if (state.version === 1) {
      state = migrateV1ToV2(state as AppStateV1);
    } else if (state.version === 2) {
      state = migrateV2ToV3(state as AppStateV2);
    } else if (state.version === 3) {
      state = migrateV3ToV4(state as AppStateV3);
    } else {
      return { ...defaultState };
    }
  }

  return state as AppState;
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

    const parsed = JSON.parse(raw) as { version?: number; [key: string]: unknown };
    const version = parsed.version ?? 1;

    if (version > SETTINGS_VERSION) {
      const state = { ...defaultState };
      applyClockFromState(state);

      return state;
    }

    if (version < SETTINGS_VERSION) {
      const migrated = migrateToLatest(parsed);
      const merged = { ...defaultState, ...migrated, entries: migrated.entries ?? [] };
      saveState(merged);
      applyClockFromState(merged);

      return merged;
    }

    const appState = parsed as unknown as AppState;
    const rawEntries = appState.entries ?? [];
    const now = startOfToday();

    const entries: VocabEntry[] = rawEntries.map((e) => ({
      ...e,
      source: {
        ...e.source,
        nextReviewAt: typeof e.source.nextReviewAt === 'number' ? e.source.nextReviewAt : now,
        level: typeof e.source.level === 'number' ? e.source.level : 0,
      },
      target: {
        ...e.target,
        nextReviewAt: typeof e.target.nextReviewAt === 'number' ? e.target.nextReviewAt : now,
        level: typeof e.target.level === 'number' ? e.target.level : 0,
      },
    }));

    const state = {
      ...defaultState,
      ...appState,
      version: SETTINGS_VERSION,
      entries,
      appLocale: appState.appLocale ?? null,
      questionsPerSession:
        typeof appState.questionsPerSession === 'number'
          ? Math.min(
              QUESTIONS_PER_SESSION_MAX,
              Math.max(QUESTIONS_PER_SESSION_MIN, appState.questionsPerSession),
            )
          : defaultState.questionsPerSession,
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

  const setEntries = (entries: VocabEntry[]): void => {
    persist((prev) => ({ ...prev, entries }));
  };

  const addEntry = (sourceText: string, targetText: string): void => {
    const now = startOfToday();

    const entry: VocabEntry = {
      id: generateId(),
      source: toSourceOrTarget('source', sourceText.trim(), false, 0, now, 0),
      target: toSourceOrTarget('target', targetText.trim(), false, 0, now, 0),
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

  const setQuestionsPerSession = (value: number): void => {
    const clamped = Math.min(
      QUESTIONS_PER_SESSION_MAX,
      Math.max(QUESTIONS_PER_SESSION_MIN, Math.round(value)),
    );

    persist((prev) => ({ ...prev, questionsPerSession: clamped }));
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

    const entries: VocabEntry[] = rawEntries.map((e) => ({
      ...e,
      source: {
        ...e.source,
        nextReviewAt: typeof e.source.nextReviewAt === 'number' ? e.source.nextReviewAt : now,
        level: typeof e.source.level === 'number' ? e.source.level : 0,
      },
      target: {
        ...e.target,
        nextReviewAt: typeof e.target.nextReviewAt === 'number' ? e.target.nextReviewAt : now,
        level: typeof e.target.level === 'number' ? e.target.level : 0,
      },
    }));

    setState((prev) => {
      const next: AppState = {
        ...prev,
        version: payload.version ?? prev.version,
        mainLanguage: payload.mainLanguage ?? prev.mainLanguage,
        targetLanguage: payload.targetLanguage ?? prev.targetLanguage,
        languageSelectionComplete:
          payload.languageSelectionComplete ?? prev.languageSelectionComplete,
        entries,
        questionsPerSession:
          typeof payload.questionsPerSession === 'number'
            ? Math.min(
                QUESTIONS_PER_SESSION_MAX,
                Math.max(QUESTIONS_PER_SESSION_MIN, payload.questionsPerSession),
              )
            : prev.questionsPerSession,
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
    setQuestionsPerSession,
    setSimulationMode,
    advanceSimulationDay,
    setAuthLoginState,
    clearAuthLoginState,
    setLogWithSignal,
    applySyncPayload,
  };
}

export const store = createStore();
