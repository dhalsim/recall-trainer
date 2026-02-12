import i18next from 'i18next';

import type { AppLanguage } from '../store';

import en from './english.json';
import ja from './japanese.json';
import tr from './turkish.json';

i18next.init({
  resources: {
    en: { translation: en as Record<string, string> },
    tr: { translation: tr as Record<string, string> },
    ja: { translation: ja as Record<string, string> },
  },
  lng: 'en',
  fallbackLng: 'en',
  keySeparator: false,
});

const localeMap: Record<AppLanguage, string> = {
  en: 'en',
  tr: 'tr',
  ja: 'ja',
};

export function setLocale(lang: AppLanguage): void {
  void i18next.changeLanguage(localeMap[lang]);
}

export function t(key: string, options?: Record<string, string | number>): string {
  return options ? i18next.t(key, options) : i18next.t(key);
}
