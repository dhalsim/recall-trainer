import { Index, For, Show } from 'solid-js';

import { t } from '../../i18n';

type CreateWalletStep = 'form' | 'backup-phrase' | 'creating' | 'done';

export interface CreateWalletFlowProps {
  showCreateForm: boolean;
  createStep: CreateWalletStep;
  createMintUrls: string[];
  generateSeed: boolean;
  pendingMnemonic: string | null;
  clipboardCopied: boolean;
  errorMessage: string | null;
  onShowCreateForm: () => void;
  onBack: () => void;
  setCreateMintUrlAt: (index: number, value: string) => void;
  addCreateMintRow: () => void;
  setGenerateSeed: (v: boolean) => void;
  setClipboardCopied: (v: boolean) => void;
  onPhase1: () => void;
  onPhase2: () => void;
  onBackFromPhrase: () => void;
}

export function CreateWalletFlow(props: CreateWalletFlowProps) {
  return (
    <>
      <Show when={!props.showCreateForm}>
        <p class="mt-4 text-sm text-slate-600">{t('No wallets found for this account.')}</p>
        <p class="mt-2 text-sm text-slate-500">
          {t('Create a new wallet and transfer funds to it.')}
        </p>
        <button
          type="button"
          onClick={() => props.onShowCreateForm()}
          class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {t('Create Wallet')}
        </button>
      </Show>

      <Show when={props.showCreateForm && props.createStep !== 'backup-phrase'}>
        <div class="mt-4 space-y-4">
          <div>
            <p class="text-sm font-medium text-slate-700">{t('Add Mint')}</p>
            <Index each={props.createMintUrls}>
              {(url, i) => (
                <div class="mt-2 flex gap-2">
                  <input
                    type="url"
                    placeholder={t('Mint URL')}
                    value={url()}
                    onInput={(e) => props.setCreateMintUrlAt(i, e.currentTarget.value)}
                    class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}
            </Index>
            <button
              type="button"
              onClick={() => props.addCreateMintRow()}
              class="mt-2 text-sm text-blue-600 hover:underline"
            >
              + {t('Add Mint')}
            </button>
          </div>
          <div class="flex items-center gap-2">
            <input
              type="checkbox"
              id="generate-seed"
              checked={props.generateSeed}
              onChange={(e) => props.setGenerateSeed(e.currentTarget.checked)}
              class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label for="generate-seed" class="text-sm text-slate-700">
              {t('Generate recovery phrase (12 words)')}
            </label>
          </div>
          <Show when={props.errorMessage}>
            <p class="text-sm text-red-600">{props.errorMessage}</p>
          </Show>
          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => props.onBack()}
              class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
            >
              {t('Back')}
            </button>
            <button
              type="button"
              onClick={() => props.onPhase1()}
              disabled={props.createStep === 'creating'}
              class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {props.createStep === 'creating' ? t('Creating wallet...') : t('Create Wallet')}
            </button>
          </div>
        </div>
      </Show>

      <Show when={props.createStep === 'backup-phrase'}>
        <div class="space-y-4">
          <div class="rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
            <p class="text-sm font-semibold text-amber-900">
              {t('Write down your recovery phrase')}
            </p>
            <p class="mt-1 text-xs text-amber-700">
              {t(
                'These 12 words are the only way to recover your wallet. Write them down now. They will not be shown again.',
              )}
            </p>
            <div class="mt-3 grid grid-cols-3 gap-2">
              <For each={props.pendingMnemonic?.split(' ') ?? []}>
                {(word, i) => (
                  <div class="flex items-center gap-1 rounded bg-white px-2 py-1 text-xs">
                    <span class="w-4 text-slate-400">{i() + 1}.</span>
                    <span class="font-mono font-medium text-slate-800">{word}</span>
                  </div>
                )}
              </For>
            </div>
          </div>

          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(props.pendingMnemonic ?? '');
              props.setClipboardCopied(true);

              setTimeout(() => {
                void navigator.clipboard.writeText('');
                props.setClipboardCopied(false);
              }, 30000);
            }}
            class="w-full rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            {props.clipboardCopied
              ? t('Copied — clipboard clears in 30s')
              : t('Dangerously copy to clipboard')}
          </button>

          <Show when={props.errorMessage}>
            <p class="text-sm text-red-600">{props.errorMessage}</p>
          </Show>

          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => props.onBackFromPhrase()}
              class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t('Back')}
            </button>
            <button
              type="button"
              onClick={() => props.onPhase2()}
              class="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              {t("I've backed it up — Create Wallet")}
            </button>
          </div>
        </div>
      </Show>
    </>
  );
}
