import { createSignal, For, Show } from 'solid-js';

import { t } from '../../i18n';
import type { DiscoverStore } from '../../lib/cashu/discoverCache';
import { formatRelativeTime } from '../../utils/relativeTime';

import { MintDetails } from './MintDetails';
import { truncateUrl } from './utils';

interface MintDiscoveryProps {
  store: DiscoverStore;
  onBack: () => void;
  onAddMint: (url: string) => void;
  onRefresh: () => void;
  isSyncing: () => boolean;
  /** Unix seconds when discover was last synced, or null. */
  lastSyncedAt: number | null;
}

export function MintDiscovery(props: MintDiscoveryProps) {
  const [selectedMintUrl, setSelectedMintUrl] = createSignal<string | null>(null);

  const selectedMint = () => {
    const url = selectedMintUrl();

    return url ? (props.store.mints[url] ?? null) : null;
  };

  return (
    <div class="mt-4 space-y-4">
      <Show
        when={!selectedMintUrl()}
        fallback={
          selectedMint() ? (
            <MintDetails
              mint={selectedMint()!}
              onBack={() => setSelectedMintUrl(null)}
              onAddMint={props.onAddMint}
            />
          ) : null
        }
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={props.onBack}
            class="text-sm text-slate-600 hover:underline"
          >
            ← {t('Back')}
          </button>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-slate-500">
              {t('Last synced')}:{' '}
              {props.lastSyncedAt != null ? formatRelativeTime(props.lastSyncedAt) : t('Never')}
            </span>
            <button
              type="button"
              onClick={props.onRefresh}
              disabled={props.store.loading || props.isSyncing()}
              class="rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('Refresh')}
            </button>
          </div>
        </div>
        <p class="text-sm font-medium text-slate-700">{t('Discover mints')}</p>
        <Show when={props.store.loading}>
          <p class="text-sm text-slate-500">{t('Discovering…')}</p>
        </Show>
        <Show when={props.store.syncing && !props.store.loading}>
          <p class="text-sm text-slate-500">{t('Syncing…')}</p>
        </Show>
        <Show when={props.store.error}>
          <p class="text-sm text-red-600">{props.store.error}</p>
        </Show>
        <Show when={!props.store.loading && !props.store.error}>
          <ul class="mt-2 space-y-3">
            <For each={Object.keys(props.store.mints)}>
              {(url) => {
                const mint = () => props.store.mints[url];

                return (
                  <li class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="flex min-w-0 flex-1 items-center gap-2">
                        <Show when={mint().mintInfo?.icon_url}>
                          <img
                            src={mint().mintInfo!.icon_url}
                            alt=""
                            class="h-6 w-6 shrink-0 rounded object-contain"
                          />
                        </Show>
                        <span class="truncate font-mono text-xs text-slate-700" title={url}>
                          {mint().mintInfo?.name ?? truncateUrl(url, 36)}
                        </span>
                      </div>
                      <Show when={mint().network}>
                        <span class="shrink-0 text-xs text-slate-500">{mint().network}</span>
                      </Show>
                    </div>
                    <div class="mt-2 flex flex-wrap items-center gap-3">
                      <span class="text-xs text-slate-600">
                        {t('Rating')}:{' '}
                        {mint().avgRating != null ? mint().avgRating!.toFixed(1) : '—'}
                      </span>
                      <span class="text-xs text-slate-600">
                        {t('Reviews')}: {mint().reviewCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedMintUrl(url)}
                        class="rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400"
                      >
                        {t('Details')}
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onAddMint(url)}
                        class="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {t('Add to wallet')}
                      </button>
                    </div>
                  </li>
                );
              }}
            </For>
          </ul>
          <Show
            when={
              Object.keys(props.store.mints).length === 0 &&
              !props.store.loading &&
              !props.store.syncing
            }
          >
            <p class="text-sm text-slate-500">{t('No mints found.')}</p>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
