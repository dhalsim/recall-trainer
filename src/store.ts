import { createSignal } from 'solid-js';

import { setLocale } from './i18n';

export const SETTINGS_VERSION = 1;

const STORAGE_KEY = 'recall-trainer-state';

export type AppLanguage = 'en' | 'ja' | 'tr';

export interface VocabEntry {
  id: string;
  source: string;
  target: string;
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

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...defaultState };
    }

    const parsed = JSON.parse(raw) as AppState;

    if (parsed.version !== SETTINGS_VERSION) {
      return { ...defaultState };
    }

    return {
      ...defaultState,
      ...parsed,
      version: SETTINGS_VERSION,
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
      id: crypto.randomUUID(),
      source: source.trim(),
      target: target.trim(),
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

  return {
    state,
    setMainLanguage,
    setTargetLanguage,
    completeLanguageSelection,
    setScreen,
    goToModeSelection,
    setEntries,
    addEntry,
    removeEntry,
    clearEntries,
  };
}

export const store = createStore();
