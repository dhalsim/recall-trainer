import { nip19 } from 'nostr-tools';
import { createMemo, createResource, For, onMount, Show } from 'solid-js';

import { useNostrAuth } from '../../contexts/NostrAuthContext';
import { useSyncDialog } from '../../contexts/SyncDialogContext';
import { t } from '../../i18n';
import type { DiscoverMintData } from '../../lib/cashu/discoverCache';
import { getProfile, prefetchProfiles } from '../../lib/profile/profileCache';
import { getDisplayName } from '../../lib/profile/profileParse';
import { readSyncMeta } from '../../lib/syncMeta';
import { getWotDepths } from '../../lib/wot/wotScore';
import { logger } from '../../utils/logger';
import { PROFILE_RELAYS } from '../../utils/nostr';
import { ProfileAvatar } from '../profile/ProfileAvatar';

import { truncateUrl } from './utils';

interface MintDetailsProps {
  mint: DiscoverMintData;
  onBack: () => void;
  onAddMint?: (url: string) => void;
}

const { error: logError } = logger();
const NUTS_DOCS_BASE_URL = 'https://github.com/cashubtc/nuts/blob/main';

function getNutDocUrl(nutNumber: number): string {
  const padded = String(nutNumber).padStart(2, '0');

  return `${NUTS_DOCS_BASE_URL}/${padded}.md`;
}

function isHexNostrPubkey(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

function decodeNostrPubkey(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (isHexNostrPubkey(trimmed)) {
    return trimmed.toLowerCase();
  }

  try {
    const decoded = nip19.decode(trimmed);

    if (decoded.type === 'npub') {
      return decoded.data;
    }

    if (decoded.type === 'nprofile') {
      return decoded.data.pubkey;
    }

    return null;
  } catch {
    return null;
  }
}

function getNostrContactPubkey(mintInfo: DiscoverMintData['mintInfo']): string | null {
  if (!mintInfo || !Array.isArray(mintInfo.contact)) {
    return null;
  }

  for (const contact of mintInfo.contact) {
    if (!contact || typeof contact !== 'object') {
      continue;
    }

    const method = 'method' in contact ? contact.method : undefined;
    const info = 'info' in contact ? contact.info : undefined;

    if (typeof method !== 'string' || typeof info !== 'string') {
      continue;
    }

    if (method.toLowerCase() === 'nostr') {
      const pubkey = decodeNostrPubkey(info);

      if (pubkey) {
        return pubkey;
      }
    }
  }

  return null;
}

function formatReviewDate(created_at: number): string {
  try {
    return new Date(created_at * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (err) {
    logError('[MintDetails] Failed to format review date:', err);

    return '';
  }
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

  const resolvedMintNostrPubkey = createMemo(() => {
    const fromContact = getNostrContactPubkey(info());

    if (fromContact) {
      return fromContact;
    }

    const fromMintInfoPubkey = decodeNostrPubkey(info()?.pubkey ?? '');

    if (fromMintInfoPubkey) {
      return fromMintInfoPubkey;
    }

    return decodeNostrPubkey(mint().pubkey);
  });

  const mintProfileLink = createMemo(() => {
    const pubkey = resolvedMintNostrPubkey();

    if (!pubkey) {
      return null;
    }

    const profile = getProfile(pubkey);
    const relays = profile?.relays?.length ? profile.relays : PROFILE_RELAYS;

    try {
      const nprofile = nip19.nprofileEncode({ pubkey, relays });

      return `https://njump.me/${nprofile}`;
    } catch {
      return `https://njump.me/${pubkey}`;
    }
  });

  const supportedNuts = createMemo(() => {
    const nuts = info()?.nuts;

    if (!nuts || typeof nuts !== 'object') {
      return [];
    }

    return Object.keys(nuts)
      .map((key) => Number.parseInt(key, 10))
      .sort((a, b) => a - b);
  });

  const [depthsMap] = createResource(
    () => {
      const root = rootPubkey();

      if (!root) {
        return undefined;
      }

      const revs = reviews();

      const authors = [
        ...new Set(
          [resolvedMintNostrPubkey(), ...revs.map((r) => r.author)].filter(
            (value): value is string => Boolean(value),
          ),
        ),
      ];

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
    const authors = [
      ...new Set(
        [resolvedMintNostrPubkey(), ...reviews().map((r) => r.author)].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    ];

    prefetchProfiles(authors);
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
      <section class="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 shadow-sm">
        <h3 class="text-sm font-semibold text-slate-800">{t('Mint details')}</h3>
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
              class="h-12 w-12 shrink-0 rounded-xl border border-slate-200 bg-white p-1 object-contain"
            />
          </Show>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-base font-semibold text-slate-900">
                {info()?.name ?? truncateUrl(mint().url, 48)}
              </p>
              <Show
                when={
                  resolvedMintNostrPubkey() && depthsMap()?.get(resolvedMintNostrPubkey()!) != null
                }
              >
                <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                  {depthLabel(depthsMap()!.get(resolvedMintNostrPubkey()!)!)}
                </span>
              </Show>
            </div>
            <div class="mt-3 rounded-lg border border-slate-200 bg-white/80 p-3">
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    URL
                  </span>
                  <span class="min-w-0 truncate rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                    {truncateUrl(mint().url, 56)}
                  </span>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {t('Mint pubkey')}
                  </span>
                  <div class="flex min-w-0 flex-1 items-center gap-2">
                    <Show
                      when={resolvedMintNostrPubkey()}
                      fallback={
                        <span class="truncate font-mono text-xs text-slate-500">
                          {mint().pubkey || '—'}
                        </span>
                      }
                    >
                      <ProfileAvatar pubkey={resolvedMintNostrPubkey()!} size="lg" />
                      <a
                        href={mintProfileLink() ?? `https://njump.me/${resolvedMintNostrPubkey()!}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="truncate font-mono text-xs text-indigo-700 hover:underline"
                        title={resolvedMintNostrPubkey()!}
                      >
                        {getDisplayName(
                          getProfile(resolvedMintNostrPubkey()!),
                          resolvedMintNostrPubkey()!,
                        )}
                      </a>
                    </Show>
                  </div>
                </div>
                <Show when={mint().network}>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {t('Network')}
                    </span>
                    <span class="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {mint().network}
                    </span>
                  </div>
                </Show>
                <Show when={supportedNuts().length > 0}>
                  <div class="flex flex-wrap items-start gap-2">
                    <span class="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {t('Supported NUTs')}
                    </span>
                    <div class="flex flex-wrap gap-1.5">
                      <For each={supportedNuts()}>
                        {(nut) => (
                          <a
                            href={getNutDocUrl(nut)}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:underline"
                            title={t('Open NUT documentation')}
                          >
                            NUTS-{nut}
                          </a>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            </div>
            <Show when={info()?.description}>
              <p class="mt-3 text-sm text-slate-700">{info()!.description}</p>
            </Show>
            <Show when={info()?.description_long}>
              <p class="mt-1 text-xs leading-relaxed text-slate-500">{info()!.description_long}</p>
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
