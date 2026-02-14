import { Show } from 'solid-js';

import { t } from '../i18n';

import { NostrConnectAuth } from './NostrConnectAuth.tsx';

interface NostrConnectModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NostrConnectModal(props: NostrConnectModalProps) {
  return (
    <Show when={props.open}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nostr-connect-modal-title"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            props.onClose();
          }
        }}
      >
        <div class="fixed inset-0 bg-slate-900/50" aria-hidden="true" />
        <div
          class="relative z-10 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="nostr-connect-modal-title" class="text-lg font-semibold text-slate-900">
            {t('Connect')}
          </h2>
          <div class="mt-4">
            <NostrConnectAuth
              onSuccess={() => {
                props.onSuccess();
                props.onClose();
              }}
              onError={() => {}}
            />
          </div>
          <div class="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => props.onClose()}
              class="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t('Close')}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
