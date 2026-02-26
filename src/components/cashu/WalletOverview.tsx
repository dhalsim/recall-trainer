import { For, Show } from 'solid-js';

import { t } from '../../i18n';
import type { Nip60WalletContent } from '../../lib/cashu/nip60';

import { Mint } from './Mint';

export interface WalletOverviewProps {
  walletContent: Nip60WalletContent;
  addMintUrl: string;
  errorMessage: string | null;
  balanceForMint: (mintUrl: string) => number;
  pendingCountForMint: (mintUrl: string) => number;
  onReceive: (mintUrl: string) => void;
  onSend: (mintUrl: string) => void;
  onHistory: (mintUrl: string) => void;
  onRemoveMint: (mintUrl: string) => void;
  onRefreshPending: (mintUrl: string) => void;
  setAddMintUrl: (v: string) => void;
  onAddMint: (url?: string) => void;
  onOpenDiscover: () => void;
  onReset: () => void;
  onRecover: () => void;
}

export function WalletOverview(props: WalletOverviewProps) {
  return (
    <div class="mt-4 space-y-4">
      <div>
        <p class="text-sm font-medium text-slate-700">{t('Mints')}</p>
        <ul class="mt-2 space-y-3">
          <For each={props.walletContent.mints}>
            {(mintUrl) => (
              <Mint
                mintUrl={mintUrl}
                balance={props.balanceForMint(mintUrl)}
                pendingCount={props.pendingCountForMint(mintUrl)}
                panel={null}
                onReceive={() => props.onReceive(mintUrl)}
                onSend={() => props.onSend(mintUrl)}
                onHistory={() => props.onHistory(mintUrl)}
                onRemove={() => props.onRemoveMint(mintUrl)}
                onRefresh={() => props.onRefreshPending(mintUrl)}
              />
            )}
          </For>
        </ul>
      </div>

      <section class="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div class="space-y-1">
          <p class="text-sm font-semibold text-slate-800">{t('Add Mint')}</p>
          <p class="text-xs text-slate-500">
            {t('Choose how you want to add a mint to your wallet.')}
          </p>
        </div>
        <div class="mt-3">
          <label class="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-700">
            {t('Mint URL')}
          </label>
          <input
            type="url"
            placeholder="https://mint-url"
            value={props.addMintUrl}
            onInput={(e) => props.setAddMintUrl(e.currentTarget.value)}
            class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => props.onAddMint()}
            class="flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            + {t('Add Mint')}
          </button>
          <button
            type="button"
            onClick={() => props.onOpenDiscover()}
            class="flex items-center justify-center rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {t('Discover mints')}
          </button>
        </div>
        <Show when={props.errorMessage}>
          <p class="mt-3 text-sm text-red-600">{props.errorMessage}</p>
        </Show>
      </section>

      <button
        type="button"
        onClick={() => props.onReset()}
        class="mt-4 w-full rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      >
        {t('Reset Wallet')}
      </button>
      <button
        type="button"
        onClick={() => props.onRecover()}
        class="mt-2 w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
      >
        {t('Recover Wallet')}
      </button>
    </div>
  );
}
