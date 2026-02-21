import { createEffect, createSignal, onMount, Show } from 'solid-js';

import { t } from '../i18n';
import { readSyncMeta } from '../lib/syncMeta';
import type { WotStats } from '../lib/wot/wotCache';
import { crawlFollowGraph } from '../lib/wot/wotCrawl';
import { getWotStats } from '../lib/wot/wotScore';
import { logger } from '../utils/logger';
import { formatRelativeTime } from '../utils/relativeTime';
const { error } = logger();

interface WotSyncSectionProps {
  rootPubkey: string;
}

export function WotSyncSection(props: WotSyncSectionProps) {
  const [stats, setStats] = createSignal<WotStats | null>(null);
  const [progress, setProgress] = createSignal<string | null>(null);
  const [crawling, setCrawling] = createSignal(false);

  function loadStats(): void {
    getWotStats(props.rootPubkey).then(setStats);
  }

  onMount(loadStats);

  createEffect(() => {
    loadStats();
  });

  async function handleRefresh(): Promise<void> {
    setCrawling(true);
    setProgress(null);

    try {
      await crawlFollowGraph({
        rootPubkey: props.rootPubkey,
        onProgress: (msg) => setProgress(msg),
      });

      await getWotStats(props.rootPubkey).then(setStats);
    } catch (err) {
      error('[WotSyncSection] Crawl failed:', err);
    } finally {
      setCrawling(false);
      setProgress(null);
    }
  }

  const wotSyncedAt = () => readSyncMeta(props.rootPubkey)?.wot ?? null;
  const s = () => stats();

  return (
    <div class="mt-4 border-t border-slate-200 pt-4">
      <p class="text-xs font-medium text-slate-500">{t('Web of Trust')}</p>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <span class="text-xs text-slate-500">
          {t('Last synced')}:{' '}
          {wotSyncedAt() !== null ? formatRelativeTime(wotSyncedAt()!) : t('Never')}
        </span>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={crawling()}
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('Refresh')}
        </button>
      </div>
      <Show when={s()}>
        {(st) => (
          <p class="mt-1 text-xs text-slate-500">
            {t('Depth')} 1: {st().depth1} {t('contacts')} / {t('Depth')} 2: {st().depth2}{' '}
            {t('contacts')}
          </p>
        )}
      </Show>
      <Show when={crawling()}>
        <p class="mt-1 text-xs text-slate-600">{progress() ?? t('Crawling…')}</p>
      </Show>
    </div>
  );
}
