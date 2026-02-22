import { createMemo, createResource, createSignal, For, Show } from 'solid-js';

import { useNostrAuth } from '../../contexts/NostrAuthContext';
import { t } from '../../i18n';
import type { DiscoverMintData, DiscoverStore } from '../../lib/cashu/discoverCache';
import type { WotMintScore } from '../../lib/wot/wotScore';
import { computeWotMintScore, getWotDepths } from '../../lib/wot/wotScore';
import { formatRelativeTime } from '../../utils/relativeTime';

import { depthLabel, MintDetails } from './MintDetails';
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
  const auth = useNostrAuth();
  const [selectedMintUrl, setSelectedMintUrl] = createSignal<string | null>(null);

  const [depthsMap] = createResource(
    () => {
      const root = auth.pubkey();
      const mints = props.store.mints;
      const urls = Object.keys(mints);

      if (!root || urls.length === 0) {
        return undefined;
      }

      const allPubkeys = new Set<string>();

      for (const url of urls) {
        const m = mints[url];
        allPubkeys.add(m.pubkey);

        for (const r of m.reviews) {
          allPubkeys.add(r.author);
        }
      }

      return { root, pubkeys: [...allPubkeys] } as const;
    },
    async ({ root, pubkeys }) => getWotDepths([...pubkeys], root),
  );

  const wotScores = createMemo((): Map<string, WotMintScore> => {
    const depths = depthsMap();
    const result = new Map<string, WotMintScore>();

    if (!depths) {
      return result;
    }

    for (const [url, mint] of Object.entries(props.store.mints)) {
      result.set(url, computeWotMintScore(mint.reviews, depths));
    }

    return result;
  });

  const sortedMintUrls = createMemo((): string[] => {
    const urls = Object.keys(props.store.mints);
    const scores = wotScores();
    const mints = props.store.mints;

    return urls.sort((a, b) => {
      const unreachableA = Boolean(mints[a].mintInfoError);
      const unreachableB = Boolean(mints[b].mintInfoError);

      if (unreachableA && !unreachableB) {
        return 1;
      }

      if (!unreachableA && unreachableB) {
        return -1;
      }

      const sa = scores.get(a);
      const sb = scores.get(b);
      const hasWotA = sa != null && sa.score != null;
      const hasWotB = sb != null && sb.score != null;

      if (hasWotA && !hasWotB) {
        return -1;
      }

      if (!hasWotA && hasWotB) {
        return 1;
      }

      if (hasWotA && hasWotB) {
        return sb!.score! - sa!.score!;
      }

      const ra = mints[a].avgRating ?? 0;
      const rb = mints[b].avgRating ?? 0;

      return rb - ra;
    });
  });

  const selectedMint = () => {
    const url = selectedMintUrl();

    return url ? (props.store.mints[url] ?? null) : null;
  };

  function formatWotScore(mint: DiscoverMintData): string | null {
    const s = wotScores().get(mint.url);

    if (!s || s.score == null) {
      return null;
    }

    return `${s.score.toFixed(1)} (${s.wotReviewCount}/${s.totalReviewCount})`;
  }

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
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="space-y-1">
              <button
                type="button"
                onClick={() => props.onBack?.()}
                class="text-sm text-slate-600 hover:underline"
              >
                ← {t('Back')}
              </button>
              <p class="text-sm font-semibold text-slate-800">{t('Discover mints')}</p>
              <p class="text-xs text-slate-500">
                {t('Browse trusted mints and add one to your wallet.')}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs text-slate-500">
                {t('Last synced')}:{' '}
                {props.lastSyncedAt != null ? formatRelativeTime(props.lastSyncedAt) : t('Never')}
              </span>
              <button
                type="button"
                onClick={() => props.onRefresh?.()}
                disabled={props.store.loading || props.isSyncing()}
                class="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('Refresh')}
              </button>
            </div>
          </div>
        </div>
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
            <For each={sortedMintUrls()}>
              {(url) => {
                const mint = () => props.store.mints[url];
                const mintDepth = () => depthsMap()?.get(mint().pubkey) ?? null;
                const wotLabel = () => formatWotScore(mint());

                return (
                  <li class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="flex min-w-0 flex-1 items-center gap-2">
                        <Show when={mint().mintInfo?.icon_url}>
                          <img
                            src={mint().mintInfo!.icon_url}
                            alt=""
                            class="h-6 w-6 shrink-0 rounded object-contain"
                          />
                        </Show>
                        <span class="truncate text-sm font-medium text-slate-800" title={url}>
                          {mint().mintInfo?.name ?? truncateUrl(url, 36)}
                        </span>
                        <Show when={mintDepth() !== null}>
                          <span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            {depthLabel(mintDepth()!)}
                          </span>
                        </Show>
                      </div>
                      <Show when={mint().network}>
                        <span class="shrink-0 text-xs text-slate-500">{mint().network}</span>
                      </Show>
                      <Show when={mint().mintInfoError}>
                        <span
                          class="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                          title={t('Mint info API could not be reached. Mint may be inactive.')}
                        >
                          {t('Mint unreachable')}
                        </span>
                      </Show>
                    </div>
                    <p class="mt-1 truncate font-mono text-[11px] text-slate-500" title={url}>
                      {url}
                    </p>
                    <div class="mt-2 flex flex-wrap items-center gap-3">
                      <div class="flex min-w-0 flex-wrap items-center gap-3">
                        <Show
                          when={wotLabel()}
                          fallback={
                            <span class="text-xs text-slate-600">
                              {t('Rating')}:{' '}
                              {mint().avgRating != null ? mint().avgRating!.toFixed(1) : '—'}
                            </span>
                          }
                        >
                          <span
                            class="text-xs font-semibold text-indigo-700"
                            title={t('WoT score: weighted rating from trusted reviewers')}
                          >
                            {t('WoT score')}: {wotLabel()}
                          </span>
                        </Show>
                        <span class="text-xs text-slate-600">
                          {t('Reviews')}: {mint().reviewCount}
                        </span>
                      </div>
                      <div class="ml-auto flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedMintUrl(url)}
                          class="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
                        >
                          {t('Details')}
                        </button>
                        <button
                          type="button"
                          onClick={() => props.onAddMint(url)}
                          class="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {t('Add to wallet')}
                        </button>
                      </div>
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
