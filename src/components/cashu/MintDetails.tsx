import { createMemo, createResource, For, onMount, Show } from 'solid-js';

import { useNostrAuth } from '../../contexts/NostrAuthContext';
import { useSyncDialog } from '../../contexts/SyncDialogContext';
import { t } from '../../i18n';
import type { DiscoverMintData } from '../../lib/cashu/discoverCache';
import { getProfile, prefetchProfiles } from '../../lib/profile/profileCache';
import { getDisplayName } from '../../lib/profile/profileParse';
import { readSyncMeta } from '../../lib/syncMeta';
import { getWotDepths } from '../../lib/wot/wotScore';
import { ProfileAvatar } from '../profile/ProfileAvatar';

import { truncateUrl } from './utils';

interface MintDetailsProps {
  mint: DiscoverMintData;
  onBack: () => void;
  onAddMint?: (url: string) => void;
}

function formatReviewDate(created_at: number): string {
  try {
    return new Date(created_at * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function truncatePubkey(pubkey: string, len = 12): string {
  if (pubkey.length <= len) {
    return pubkey;
  }

  return pubkey.slice(0, 6) + '…' + pubkey.slice(-4);
}

export function depthLabel(depth: number): string {
  if (depth === 0) {
    return t('You');
  }

  if (depth === 1) {
    return t('Direct follow');
  }

  return t('2 hops');
}

export function MintDetails(props: MintDetailsProps) {
  const auth = useNostrAuth();
  const { openSyncDialog } = useSyncDialog();
  const mint = () => props.mint;
  const info = () => mint().mintInfo;
  const reviews = () => mint().reviews;
  const rootPubkey = () => auth.pubkey() ?? null;

  const [depthsMap] = createResource(
    () => {
      const root = rootPubkey();

      if (!root) {
        return undefined;
      }

      const revs = reviews();
      const authors = [...new Set([mint().mintPubkey, ...revs.map((r) => r.author)])];

      return { root, authors } as const;
    },
    async ({ root, authors }) => getWotDepths(authors, root),
  );

  const hasWotData = () => {
    const root = rootPubkey();

    return root != null && readSyncMeta(root)?.wot != null;
  };

  const sortedReviews = createMemo(() => {
    const depths = depthsMap();
    const revs = reviews();

    if (!depths) {
      return revs;
    }

    const MAX_DEPTH = 999;

    return [...revs].sort((a, b) => {
      const da = depths.get(a.author) ?? MAX_DEPTH;
      const db = depths.get(b.author) ?? MAX_DEPTH;

      if (da !== db) {
        return da - db;
      }

      return (b.rating ?? 0) - (a.rating ?? 0);
    });
  });

  onMount(() => {
    const authors = [mint().mintPubkey, ...reviews().map((r) => r.author)];

    prefetchProfiles([...new Set(authors)]);
  });

  return (
    <div class="mt-4 space-y-4">
      <button
        type="button"
        onClick={() => props.onBack?.()}
        class="text-sm text-slate-600 hover:underline"
      >
        ← {t('Back')}
      </button>

      {/* Mint info (NUT-06) */}
      <section class="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 class="text-sm font-semibold text-slate-800">{t('Mint info')}</h3>
        <Show when={mint().mintInfoError}>
          {(err) => (
            <p class="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t('Mint info API could not be reached ({{code}}). The mint may be inactive.', {
                code: err(),
              })}
            </p>
          )}
        </Show>
        <div class="mt-3 flex flex-wrap items-start gap-3">
          <Show when={info()?.icon_url}>
            <img
              src={info()!.icon_url!}
              alt=""
              class="h-12 w-12 shrink-0 rounded-lg object-contain"
            />
          </Show>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium text-slate-900">
                {info()?.name ?? truncateUrl(mint().url, 48)}
              </p>
              <Show when={depthsMap()?.get(mint().mintPubkey) != null}>
                <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                  {depthLabel(depthsMap()!.get(mint().mintPubkey)!)}
                </span>
              </Show>
            </div>
            <p class="mt-1 font-mono text-xs text-slate-500" title={mint().url}>
              {truncateUrl(mint().url, 56)}
            </p>
            <div class="mt-1 flex items-center gap-2">
              <p class="font-mono text-xs text-slate-500" title={mint().mintPubkey}>
                {t('Mint pubkey')}: {truncatePubkey(mint().mintPubkey, 20)}
              </p>
              <ProfileAvatar pubkey={mint().mintPubkey} size="xs" disablePopup />
            </div>
            <Show when={mint().network}>
              <p class="mt-1 text-xs text-slate-600">
                {t('Network')}: {mint().network}
              </p>
            </Show>
            <Show when={info()?.description}>
              <p class="mt-2 text-sm text-slate-600">{info()!.description}</p>
            </Show>
            <Show when={info()?.description_long}>
              <p class="mt-1 text-xs text-slate-500">{info()!.description_long}</p>
            </Show>
          </div>
        </div>
        <Show when={props.onAddMint}>
          <div class="mt-3">
            <button
              type="button"
              onClick={() => props.onAddMint?.(mint().url)}
              class="rounded bg-blue-100 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {t('Add to wallet')}
            </button>
          </div>
        </Show>
      </section>

      {/* Summary */}
      <div class="flex flex-wrap gap-4 text-sm text-slate-600">
        <span>
          {t('Rating')}: {mint().avgRating != null ? mint().avgRating!.toFixed(1) : '—'}
        </span>
        <span>
          {t('Reviews')}: {mint().reviewCount}
        </span>
      </div>

      {/* Reviews list */}
      <section class="rounded-lg border border-slate-200 bg-white p-4">
        <h3 class="text-sm font-semibold text-slate-800">{t('Reviews')}</h3>
        <Show when={rootPubkey() && !hasWotData()}>
          <p class="mt-2 text-xs text-amber-700">
            {t('Web of Trust data is not fetched to check reviewers and mint pubkeys trust score.')}{' '}
            <button
              type="button"
              onClick={() => openSyncDialog()}
              class="inline underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {t('Click here to fetch')}
            </button>
          </p>
        </Show>
        <Show
          when={reviews().length > 0}
          fallback={<p class="mt-2 text-sm text-slate-500">{t('No reviews yet.')}</p>}
        >
          <ul class="mt-3 space-y-3">
            <For each={sortedReviews()}>
              {(review) => {
                const depth = () => depthsMap()?.get(review.author) ?? null;
                const profile = () => getProfile(review.author);
                const displayName = () => getDisplayName(profile(), review.author);

                return (
                  <li class="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="flex min-w-0 flex-1 items-center gap-2">
                        <ProfileAvatar pubkey={review.author} size="lg" />
                        <span
                          class="truncate font-mono text-xs text-slate-500"
                          title={review.author}
                        >
                          {displayName()}
                        </span>
                      </div>
                      <div class="flex flex-wrap items-center gap-2">
                        <Show when={depth() !== null}>
                          <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            {depthLabel(depth()!)}
                          </span>
                        </Show>
                        <Show when={review.rating != null}>
                          <span class="text-xs font-medium text-amber-600">{review.rating}/5</span>
                        </Show>
                      </div>
                    </div>
                    <Show when={review.content}>
                      <p class="mt-1 text-sm text-slate-700">{review.content}</p>
                    </Show>
                    <p class="mt-1 text-xs text-slate-400">{formatReviewDate(review.created_at)}</p>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
      </section>
    </div>
  );
}
