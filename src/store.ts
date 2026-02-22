import { createSignal } from 'solid-js';

import { setLocale } from './i18n';
import type { AuthLoginState } from './lib/nostr/types';
import type { StudyItem, StudyItemType, StudySet } from './lib/study-sets/types';
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

export interface LocalStudySet extends StudySet {
  importedFrom?: string;
  importedAt: number;
  entries: StudyEntry[];
}

export interface CreateLocalStudySetInput {
  name: string;
  description: string;
  tags: string[];
  level: number;
  items: StudyItem[];
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
  localSets: LocalStudySet[];
  activeLocalSetId: string | null;
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
  | 'localSets'
  | 'activeLocalSetId'
  | 'numberOfItems'
>;

const DEFAULT_LOCAL_SET_ID = 'local-default-set';

function createDefaultLocalSet(now: number = Date.now()): LocalStudySet {
  return {
    id: DEFAULT_LOCAL_SET_ID,
    name: 'My Study Set',
    author: 'local',
    mainLanguage: 'en',
    targetLanguage: 'ja',
    tags: [],
    description: 'Default local study set.',
    level: 1,
    numberOfItems: 0,
    type: 'vocab',
    createdAt: now,
    updatedAt: now,
    items: [],
    importedAt: now,
    entries: [],
  };
}

const defaultState: AppState = {
  version: SETTINGS_VERSION,
  mainLanguage: null,
  targetLanguage: null,
  appLocale: null,
  languageSelectionComplete: false,
  screen: 'mode_selection',
  localSets: [createDefaultLocalSet()],
  activeLocalSetId: DEFAULT_LOCAL_SET_ID,
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

function toStudyEntryFromItem(item: StudyItem, now: number): StudyEntry {
  if (item.type !== 'vocab') {
    return {
      id: item.id,
      itemType: 'vocab',
      description: item.description,
      hints: item.hints,
      source: toStudySide('source', '', false, 0, now, 0),
      target: toStudySide('target', '', false, 0, now, 0),
    };
  }

  return {
    id: item.id,
    itemType: item.type,
    description: item.description,
    hints: item.hints,
    source: toStudySide('source', item.source, false, 0, now, 0),
    target: {
      ...toStudySide('target', item.target, false, 0, now, 0),
      acceptedAnswers: item.acceptedAnswers,
    },
  };
}

function toStudyItemFromEntry(entry: StudyEntry): StudyItem {
  return {
    id: entry.id,
    type: 'vocab',
    source: entry.source.text,
    target: entry.target.text,
    description: entry.description,
    hints: entry.hints,
    acceptedAnswers: entry.target.acceptedAnswers,
  };
}

function toLocalStudySetFromRemote(set: StudySet, importedFrom?: string): LocalStudySet {
  const now = Date.now();
  const entries = set.items.map((item) => toStudyEntryFromItem(item, startOfToday()));

  return {
    ...set,
    importedFrom,
    importedAt: now,
    entries,
    numberOfItems: set.items.length,
  };
}

function getActiveLocalSet(state: AppState): LocalStudySet | null {
  const activeId = state.activeLocalSetId;
  const fallback = state.localSets[0] ?? null;

  if (!activeId) {
    return fallback;
  }

  return state.localSets.find((set) => set.id === activeId) ?? fallback;
}

function getActiveSetEntries(state: AppState): StudyEntry[] {
  return getActiveLocalSet(state)?.entries ?? [];
}

function getDueCountForEntries(entries: StudyEntry[]): number {
  return getDueSourceToTarget(entries).length + getDueTargetToSource(entries).length;
}

function getNextSetIdWithDueEntries(
  state: AppState,
  preferredSetId: string | null | undefined,
): string | null {
  if (preferredSetId) {
    const preferred = state.localSets.find((set) => set.id === preferredSetId);

    if (preferred && getDueCountForEntries(preferred.entries) > 0) {
      return preferred.id;
    }
  }

  const firstWithDue = state.localSets.find((set) => getDueCountForEntries(set.entries) > 0);

  return firstWithDue?.id ?? null;
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

    const now = startOfToday();
    const rawLocalSets = Array.isArray(appState.localSets) ? appState.localSets : [];

    const localSets: LocalStudySet[] =
      rawLocalSets.length > 0
        ? rawLocalSets.map((set) => ({
            ...set,
            entries: (set.entries ?? []).map((entry) => normalizeStudyEntry(entry, now)),
            numberOfItems: Array.isArray(set.items) ? set.items.length : (set.numberOfItems ?? 0),
            importedAt: typeof set.importedAt === 'number' ? set.importedAt : Date.now(),
          }))
        : [createDefaultLocalSet()];

    const activeLocalSetId = localSets.some((set) => set.id === appState.activeLocalSetId)
      ? (appState.activeLocalSetId ?? localSets[0].id)
      : localSets[0].id;

    const state = {
      ...defaultState,
      ...appState,
      version: SETTINGS_VERSION,
      localSets,
      activeLocalSetId,
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

  const getActiveEntries = (): StudyEntry[] => getActiveSetEntries(state());
  const getLocalSets = (): LocalStudySet[] => state().localSets;
  const getActiveLocalStudySet = (): LocalStudySet | null => getActiveLocalSet(state());

  const getDueCountForLocalSet = (setId: string): number => {
    const set = state().localSets.find((entry) => entry.id === setId);

    if (!set) {
      return 0;
    }

    return getDueCountForEntries(set.entries);
  };

  const getNextSetIdWithDueItems = (
    preferredSetId: string | null = state().activeLocalSetId,
  ): string | null => getNextSetIdWithDueEntries(state(), preferredSetId);

  const selectSetForQuickTest = (): string | null => {
    const nextSetId = getNextSetIdWithDueItems();

    if (nextSetId) {
      setActiveLocalSet(nextSetId);
    }

    return nextSetId;
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

  const setActiveLocalSet = (setId: string): void => {
    persist((prev) => {
      const exists = prev.localSets.some((set) => set.id === setId);

      if (!exists) {
        return prev;
      }

      return { ...prev, activeLocalSetId: setId };
    });
  };

  const importStudySet = (set: StudySet, importedFrom?: string): void => {
    persist((prev) => {
      const localSet = toLocalStudySetFromRemote(set, importedFrom);
      const existingIndex = prev.localSets.findIndex((entry) => entry.id === localSet.id);

      if (existingIndex === -1) {
        return {
          ...prev,
          localSets: [...prev.localSets, localSet],
          activeLocalSetId: localSet.id,
        };
      }

      return {
        ...prev,
        localSets: prev.localSets.map((entry, index) =>
          index === existingIndex ? localSet : entry,
        ),
        activeLocalSetId: localSet.id,
      };
    });
  };

  const createLocalStudySet = (input: CreateLocalStudySetInput): void => {
    const now = Date.now();
    const normalizedName = input.name.trim();

    if (!normalizedName || input.items.length === 0) {
      return;
    }

    const set: StudySet = {
      id: `local-studyset-${generateId()}`,
      name: normalizedName,
      author: 'local',
      mainLanguage: state().mainLanguage ?? 'en',
      targetLanguage: state().targetLanguage ?? 'ja',
      tags: input.tags,
      description: input.description.trim(),
      level: input.level,
      numberOfItems: input.items.length,
      type: 'vocab',
      createdAt: now,
      updatedAt: now,
      items: input.items,
    };

    importStudySet(set, 'local:create');
  };

  const setEntries = (entries: StudyEntry[]): void => {
    persist((prev) => {
      const active = getActiveLocalSet(prev);

      if (!active) {
        return prev;
      }

      return {
        ...prev,
        localSets: prev.localSets.map((set) =>
          set.id === active.id
            ? {
                ...set,
                entries,
                items: entries.map(toStudyItemFromEntry),
                numberOfItems: entries.length,
                updatedAt: Date.now(),
              }
            : set,
        ),
      };
    });
  };

  const addEntry = (sourceText: string, targetText: string): void => {
    const now = startOfToday();

    const entry: StudyEntry = {
      id: generateId(),
      itemType: 'vocab',
      source: toStudySide('source', sourceText.trim(), false, 0, now, 0),
      target: toStudySide('target', targetText.trim(), false, 0, now, 0),
    };

    setEntries([...getActiveSetEntries(state()), entry]);
  };

  const removeEntry = (id: string): void => {
    setEntries(getActiveSetEntries(state()).filter((entry) => entry.id !== id));
  };

  const updateEntry = (id: string, sourceText: string, targetText: string): void => {
    const s = sourceText.trim();
    const t = targetText.trim();

    if (!s || !t) {
      return;
    }

    setEntries(
      getActiveSetEntries(state()).map((entry) =>
        entry.id !== id
          ? entry
          : {
              ...entry,
              source: { ...entry.source, text: s },
              target: { ...entry.target, text: t },
            },
      ),
    );
  };

  const clearEntries = (): void => {
    setEntries([]);
  };

  const recordAnswer = (id: string, wasCorrect: boolean, direction: QuizDirection): void => {
    const isSourceToTarget = direction === 'source_to_target';

    setEntries(
      getActiveSetEntries(state()).map((entry) => {
        if (entry.id !== id) {
          return entry;
        }

        if (isSourceToTarget) {
          const nextLevel = wasCorrect ? Math.min(entry.source.level + 1, REVIEW_MAX_LEVEL) : 0;

          const intervalDays = REVIEW_INTERVAL_DAYS[nextLevel];

          return {
            ...entry,
            source: {
              ...entry.source,
              correct: wasCorrect,
              errorCount: wasCorrect ? entry.source.errorCount : entry.source.errorCount + 1,
              level: nextLevel,
              nextReviewAt: addDaysFromToday(intervalDays),
            },
          };
        }

        const nextLevel = wasCorrect ? Math.min(entry.target.level + 1, REVIEW_MAX_LEVEL) : 0;

        const intervalDays = REVIEW_INTERVAL_DAYS[nextLevel];

        return {
          ...entry,
          target: {
            ...entry.target,
            correct: wasCorrect,
            errorCount: wasCorrect ? entry.target.errorCount : entry.target.errorCount + 1,
            level: nextLevel,
            nextReviewAt: addDaysFromToday(intervalDays),
          },
        };
      }),
    );
  };

  const setEntryCorrect = (id: string, correct: boolean): void => {
    setEntries(
      getActiveSetEntries(state()).map((entry) =>
        entry.id !== id
          ? entry
          : {
              ...entry,
              source: {
                ...entry.source,
                correct,
                errorCount: correct ? 0 : entry.source.errorCount,
              },
              target: {
                ...entry.target,
                correct,
                errorCount: correct ? 0 : entry.target.errorCount,
              },
            },
      ),
    );
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
    const rawLocalSets = payload.localSets ?? [];

    const localSets: LocalStudySet[] =
      rawLocalSets.length > 0
        ? rawLocalSets.map((set) => ({
            ...set,
            entries: (set.entries ?? []).map((entry) => normalizeStudyEntry(entry, now)),
            numberOfItems: Array.isArray(set.items) ? set.items.length : (set.numberOfItems ?? 0),
            importedAt: typeof set.importedAt === 'number' ? set.importedAt : Date.now(),
          }))
        : [createDefaultLocalSet()];

    const activeLocalSetId = localSets.some((set) => set.id === payload.activeLocalSetId)
      ? (payload.activeLocalSetId ?? localSets[0].id)
      : localSets[0].id;

    setState((prev) => {
      const next: AppState = {
        ...prev,
        version: payload.version ?? prev.version,
        mainLanguage: payload.mainLanguage ?? prev.mainLanguage,
        targetLanguage: payload.targetLanguage ?? prev.targetLanguage,
        languageSelectionComplete:
          payload.languageSelectionComplete ?? prev.languageSelectionComplete,
        localSets,
        activeLocalSetId,
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
    getLocalSets,
    getActiveLocalStudySet,
    getDueCountForLocalSet,
    getNextSetIdWithDueItems,
    selectSetForQuickTest,
    setActiveLocalSet,
    importStudySet,
    createLocalStudySet,
    getActiveEntries,
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
