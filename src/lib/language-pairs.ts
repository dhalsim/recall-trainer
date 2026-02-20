import type { AppLanguage } from '../store';

/** Language names in their own language (for display in language selection). */
export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: 'English',
  ja: '日本語',
  tr: 'Türkçe',
};

/**
 * Supported language pairs per project spec: English ↔ Japanese, Turkish ↔ Japanese
 */
export const VALID_TARGETS: Record<AppLanguage, AppLanguage[]> = {
  en: ['ja'],
  ja: ['en', 'tr'],
  tr: ['ja'],
};

export const LANGUAGES: AppLanguage[] = ['en', 'ja', 'tr'];
