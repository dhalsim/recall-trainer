import { Show } from 'solid-js';

import { t } from '../../i18n';

import { truncateUrl } from './utils';

export type MintPanelType = 'receive' | 'send' | 'history' | null;

export interface MintPanelState {
  receiveTokenInput: string;
  setReceiveTokenInput: (v: string) => void;
  sendAmountInput: string;
  setSendAmountInput: (v: string) => void;
  sentTokenEncoded: string | null;
  loadingOp: boolean;
  errorMessage: string | null;
  onReceiveSubmit: () => void;
  onSendSubmit: () => void;
  onClosePanel: () => void;
}

interface MintProps {
  mintUrl: string;
  balance: number;
  pendingCount: number;
  panel: MintPanelType;
  onReceive: () => void;
  onSend: () => void;
  onHistory: () => void;
  onRemove?: () => void;
  panelState?: MintPanelState;
}

export function Mint(props: MintProps) {
  const panel = () => props.panel;
  const state = () => props.panelState;

  return (
    <>
      {/* Row: always show when we're in "list" mode or when this is the selected mint (we still show row in some UIs; here we show row only when panel is null) */}
      <Show when={!panel()}>
        <li class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="truncate font-mono text-xs text-slate-700" title={props.mintUrl}>
              {truncateUrl(props.mintUrl, 32)}
            </span>
            <div class="flex flex-col items-end">
              <span class="text-sm font-semibold text-slate-900">
                {props.balance} {t('sats')}
              </span>
              <Show when={props.onRemove}>
                <button
                  type="button"
                  onClick={() => props.onRemove?.()}
                  aria-label={t('Remove')}
                  class="rounded px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-error-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  ✕
                </button>
              </Show>
            </div>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => props.onReceive?.()}
              class="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {t('Receive')}
            </button>
            <button
              type="button"
              disabled={props.balance === 0}
              onClick={() => props.onSend?.()}
              class="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('Send')}
            </button>
            <span class="text-xs text-slate-500">
              {t('Pending')}: {props.pendingCount}
            </span>
            <button
              type="button"
              onClick={() => props.onHistory?.()}
              class="rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              {t('History')}
            </button>
          </div>
        </li>
      </Show>

      {/* Receive panel */}
      <Show when={panel() === 'receive' && state()}>
        <div class="mt-4 space-y-4">
          <button
            type="button"
            onClick={() => state()?.onClosePanel?.()}
            class="text-sm text-slate-600 hover:underline"
          >
            ← {t('Back')}
          </button>
          <p class="text-sm font-medium text-slate-700">
            {t('Receive')} — {truncateUrl(props.mintUrl, 28)}
          </p>
          <p class="text-xs text-slate-500">{t('Paste a Cashu token to receive.')}</p>
          <textarea
            value={state()!.receiveTokenInput}
            onInput={(e) => state()!.setReceiveTokenInput(e.currentTarget.value)}
            rows={4}
            placeholder="cashuAey..."
            class="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <Show when={state()!.errorMessage}>
            <p class="text-sm text-red-600">{state()!.errorMessage}</p>
          </Show>
          <button
            type="button"
            onClick={() => state()?.onReceiveSubmit?.()}
            disabled={state()!.loadingOp}
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {state()!.loadingOp ? t('Receiving…') : t('Receive')}
          </button>
        </div>
      </Show>

      {/* Send panel */}
      <Show when={panel() === 'send' && state()}>
        <div class="mt-4 space-y-4">
          <button
            type="button"
            onClick={() => state()?.onClosePanel?.()}
            class="text-sm text-slate-600 hover:underline"
          >
            ← {t('Back')}
          </button>
          <p class="text-sm font-medium text-slate-700">
            {t('Send')} — {truncateUrl(props.mintUrl, 28)}
          </p>
          <Show when={!state()!.sentTokenEncoded}>
            <label class="block text-xs text-slate-600">{t('Amount (sats)')}</label>
            <input
              type="number"
              min="1"
              value={state()!.sendAmountInput}
              onInput={(e) => state()!.setSendAmountInput(e.currentTarget.value)}
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <Show when={state()!.errorMessage}>
              <p class="text-sm text-red-600">{state()!.errorMessage}</p>
            </Show>
            <button
              type="button"
              onClick={() => state()?.onSendSubmit?.()}
              disabled={state()!.loadingOp}
              class="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
            >
              {state()!.loadingOp ? t('Sending…') : t('Send')}
            </button>
          </Show>
          <Show when={state()!.sentTokenEncoded}>
            <p class="text-xs text-slate-600">{t('Share this token with the recipient:')}</p>
            <textarea
              readOnly
              value={state()!.sentTokenEncoded ?? ''}
              rows={4}
              class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs focus:outline-none"
            />
            <button
              type="button"
              onClick={() => state()?.onClosePanel?.()}
              class="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              {t('Done')}
            </button>
          </Show>
        </div>
      </Show>

      {/* History panel */}
      <Show when={panel() === 'history' && state()}>
        <div class="mt-4 space-y-4">
          <button
            type="button"
            onClick={() => state()?.onClosePanel?.()}
            class="text-sm text-slate-600 hover:underline"
          >
            ← {t('Back')}
          </button>
          <p class="text-sm font-medium text-slate-700">
            {t('History')} — {truncateUrl(props.mintUrl, 28)}
          </p>
          <p class="text-xs text-slate-500">{t('Transaction history will appear here.')}</p>
        </div>
      </Show>
    </>
  );
}
