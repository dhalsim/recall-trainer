import { t } from '../i18n';

/**
 * Format a Unix timestamp (seconds) as a relative "X ago" string.
 */
export function formatRelativeTime(ts: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;

  if (diff < 60) {
    return t('Just now');
  }

  if (diff < 3600) {
    const m = Math.floor(diff / 60);

    return m === 1 ? t('1 minute ago') : t('{{count}} minutes ago', { count: m });
  }

  if (diff < 86400) {
    const h = Math.floor(diff / 3600);

    return h === 1 ? t('1 hour ago') : t('{{count}} hours ago', { count: h });
  }

  const d = Math.floor(diff / 86400);

  return d === 1 ? t('1 day ago') : t('{{count}} days ago', { count: d });
}
