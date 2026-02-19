import { For, Show } from 'solid-js';

import { t } from '../../i18n';
import type { DiscoverMintData } from '../../lib/cashu/discoverCache';

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

export function MintDetails(props: MintDetailsProps) {
  const mint = () => props.mint;
  const info = () => mint().mintInfo;
  const reviews = () => mint().reviews;

  return (
    <div class="mt-4 space-y-4">
      <button type="button" onClick={props.onBack} class="text-sm text-slate-600 hover:underline">
        ← {t('Back')}
      </button>

      {/* Mint info (NUT-06) */}
      <section class="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 class="text-sm font-semibold text-slate-800">{t('Mint info')}</h3>
        <div class="mt-3 flex flex-wrap items-start gap-3">
          <Show when={info()?.icon_url}>
            <img
              src={info()!.icon_url!}
              alt=""
              class="h-12 w-12 shrink-0 rounded-lg object-contain"
            />
          </Show>
          <div class="min-w-0 flex-1">
            <p class="font-medium text-slate-900">{info()?.name ?? truncateUrl(mint().url, 48)}</p>
            <p class="mt-1 font-mono text-xs text-slate-500" title={mint().url}>
              {truncateUrl(mint().url, 56)}
            </p>
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
        <Show
          when={reviews().length > 0}
          fallback={<p class="mt-2 text-sm text-slate-500">{t('No reviews yet.')}</p>}
        >
          <ul class="mt-3 space-y-3">
            <For each={reviews()}>
              {(review) => (
                <li class="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="font-mono text-xs text-slate-500" title={review.author}>
                      {truncatePubkey(review.author)}
                    </span>
                    <Show when={review.rating != null}>
                      <span class="text-xs font-medium text-amber-600">{review.rating}/5</span>
                    </Show>
                  </div>
                  <Show when={review.content}>
                    <p class="mt-1 text-sm text-slate-700">{review.content}</p>
                  </Show>
                  <p class="mt-1 text-xs text-slate-400">{formatReviewDate(review.created_at)}</p>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
    </div>
  );
}
