import type { AppLanguage } from '../store';

export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: 'English',
  ja: 'Japanese',
  tr: 'Turkish',
};

/**
 * Supported language pairs per AGENTS.md: English ↔ Japanese, Turkish ↔ Japanese
 */
export const VALID_TARGETS: Record<AppLanguage, AppLanguage[]> = {
  en: ['ja'],
  ja: ['en', 'tr'],
  tr: ['ja'],
};

export const LANGUAGES: AppLanguage[] = ['en', 'ja', 'tr'];
