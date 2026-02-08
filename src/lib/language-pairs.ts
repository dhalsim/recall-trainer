import type { AppLanguage } from '../store';

/**
 * Supported language pairs per AGENTS.md: English ↔ Japanese, Turkish ↔ Japanese
 */
export const VALID_TARGETS: Record<AppLanguage, AppLanguage[]> = {
  en: ['ja'],
  ja: ['en', 'tr'],
  tr: ['ja'],
};

export const LANGUAGES: AppLanguage[] = ['en', 'ja', 'tr'];
