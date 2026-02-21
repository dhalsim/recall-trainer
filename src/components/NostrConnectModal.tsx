import { createEffect, createMemo, createSignal, Show, For } from 'solid-js';

import { t } from '../i18n';
import { isNip07Available } from '../lib/nostr/Nip07Provider';
import { logger } from '../utils/logger';

import { NostrConnectAuth } from './NostrConnectAuth';

export type ConnectStep =
  | 'choice'
  | 'new_user'
  | 'existing_user'
  | 'flow_extension_install'
  | 'flow_extension_login'
  | 'flow_amber_install'
  | 'flow_amber_login'
  | 'flow_bunker_login'
  | 'flow_passkey_create'
  | 'flow_passkey_login'
  | 'flow_password_create'
  | 'flow_password_login'
  | 'flow_nostr_connect';

interface NostrConnectModalProps {
  /** Accessor so the modal can track open state and re-run effects (e.g. NIP-07 check) when dialog opens */
  open: () => boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const NEW_USER_OPTIONS = [
  {
    id: 'extension_install' as const,
    titleKey: 'Install Browser Extension',
    descKey: 'Find a Nostr browser extension (e.g. Quetta) and install it.',
    comingSoon: true,
    flow: 'flow_extension_install' as ConnectStep,
  },
  {
    id: 'amber_install' as const,
    titleKey: 'Install Amber on Android',
    descKey: 'Get Amber from GitHub or the Play Store to use as a remote signer.',
    comingSoon: false,
    flow: 'flow_amber_install' as ConnectStep,
  },
  {
    id: 'password_create' as const,
    titleKey: 'Create Password Protected Keypair',
    descKey: 'Generate a key and encrypt it with a password. Works on every platform.',
    comingSoon: false,
    flow: 'flow_password_create' as ConnectStep,
  },
  {
    id: 'passkey_create' as const,
    titleKey: 'Create Passkey Protected Keypair',
    descKey: 'Use your device passkey (Face ID, Touch ID, or security key). Browser only.',
    comingSoon: false,
    flow: 'flow_passkey_create' as ConnectStep,
  },
];

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /Android/i.test(navigator.userAgent);
}

const EXISTING_USER_OPTIONS_BASE = [
  {
    id: 'nostr_connect' as const,
    titleKey: 'Nostr Connect (QR)',
    descKey: 'Scan the QR code with your signer app or copy the URI.',
    comingSoon: false,
    flow: 'flow_nostr_connect' as ConnectStep,
  },
  {
    id: 'bunker_login' as const,
    titleKey: 'Bunker (paste URL)',
    descKey: 'Paste a bunker:// URL from your remote signer to connect.',
    comingSoon: false,
    flow: 'flow_bunker_login' as ConnectStep,
  },
  {
    id: 'password_login' as const,
    titleKey: 'Password Protected Login',
    descKey: 'Paste your ncryptsec and enter your password to unlock.',
    comingSoon: false,
    flow: 'flow_password_login' as ConnectStep,
  },
  {
    id: 'passkey_login' as const,
    titleKey: 'Passkey Protected Login',
    descKey: 'Decrypt with your passkey or set one up first.',
    comingSoon: false,
    flow: 'flow_passkey_login' as ConnectStep,
  },
  {
    id: 'extension_login' as const,
    titleKey: 'Extension Login',
    descKey: 'Sign in with your browser extension (e.g. Quetta). Desktop or Android with Quetta.',
    comingSoon: false,
    flow: 'flow_extension_login' as ConnectStep,
  },
  {
    id: 'amber_login' as const,
    titleKey: 'Amber Login',
    descKey: 'Open the NIP-55 flow to connect your Android signer.',
    comingSoon: false,
    flow: 'flow_amber_login' as ConnectStep,
  },
];

function SubCard(props: {
  titleKey: string;
  descKey: string;
  comingSoon: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const isDisabled = () => props.comingSoon || props.disabled;

  return (
    <button
      type="button"
      disabled={isDisabled()}
      onClick={() => props.onClick?.()}
      class="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white"
    >
      <p class="font-medium text-slate-900">{t(props.titleKey)}</p>
      <p class="mt-1 text-sm text-slate-600">{t(props.descKey)}</p>
      <Show when={props.comingSoon}>
        <span class="mt-2 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          {t('Coming soon')}
        </span>
      </Show>
    </button>
  );
}

function ChoiceCard(props: { titleKey: string; descKey: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => props.onClick()}
      class="w-full rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      <p class="font-medium text-slate-900">{t(props.titleKey)}</p>
      <p class="mt-1 text-sm text-slate-600">{t(props.descKey)}</p>
    </button>
  );
}

type ExistingOptionId = (typeof EXISTING_USER_OPTIONS_BASE)[number]['id'];
const { error: logError } = logger();

export function NostrConnectModal(props: NostrConnectModalProps) {
  const [step, setStep] = createSignal<ConnectStep>('choice');

  // Reactive so we pick up late-injected NIP-07 extensions
  const [nip07Available, setNip07Available] = createSignal(isNip07Available());

  createEffect(() => {
    if (!props.open()) {
      return;
    }

    setNip07Available(isNip07Available());
    const t1 = setTimeout(() => setNip07Available(isNip07Available()), 300);
    const t2 = setTimeout(() => setNip07Available(isNip07Available()), 1000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  });

  const existingUserOptions = createMemo(() => {
    const extAvailable = nip07Available();

    const order: ExistingOptionId[] = [
      ...(extAvailable ? (['extension_login'] as const) : []),
      ...(isAndroid() ? (['amber_login'] as const) : []),
      'nostr_connect',
      'bunker_login',
      'password_login',
      'passkey_login',
    ];

    return order.map((id) => {
      const opt = EXISTING_USER_OPTIONS_BASE.find((o) => o.id === id)!;

      if (opt.id === 'extension_login') {
        return {
          ...opt,
          comingSoon: !extAvailable,
        };
      }

      return opt;
    });
  });

  function handleBack() {
    const s = step();

    if (s === 'new_user' || s === 'existing_user') {
      setStep('choice');
    } else if (
      s === 'flow_extension_install' ||
      s === 'flow_amber_install' ||
      s === 'flow_password_create' ||
      s === 'flow_passkey_create'
    ) {
      setStep('new_user');
    } else if (
      s === 'flow_amber_login' ||
      s === 'flow_bunker_login' ||
      s === 'flow_extension_login' ||
      s === 'flow_password_login' ||
      s === 'flow_passkey_login' ||
      s === 'flow_nostr_connect'
    ) {
      setStep('existing_user');
    }
  }

  const isFlowStep = (): boolean => {
    const s = step();

    return (
      s === 'flow_extension_install' ||
      s === 'flow_extension_login' ||
      s === 'flow_amber_install' ||
      s === 'flow_amber_login' ||
      s === 'flow_bunker_login' ||
      s === 'flow_passkey_create' ||
      s === 'flow_passkey_login' ||
      s === 'flow_password_create' ||
      s === 'flow_password_login' ||
      s === 'flow_nostr_connect'
    );
  };

  const showBack = (): boolean => step() !== 'choice';

  return (
    <Show when={props.open()}>
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
        <div
          class="fixed inset-0 bg-slate-900/50"
          aria-hidden="true"
          onClick={() => props.onClose()}
        />
        <div
          class="relative z-10 flex w-full max-w-sm flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center gap-2">
            <Show when={showBack()}>
              <button
                type="button"
                onClick={handleBack}
                class="rounded-lg p-1 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label={t('Back')}
              >
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            </Show>
            <h2 id="nostr-connect-modal-title" class="text-lg font-semibold text-slate-900">
              {t('Connect')}
            </h2>
          </div>

          <div class="mt-4 flex-1 overflow-y-auto">
            <Show when={step() === 'choice'}>
              <div class="grid gap-3 sm:grid-cols-2">
                <ChoiceCard
                  titleKey="New User"
                  descKey="I don't have a Nostr account or signer yet"
                  onClick={() => setStep('new_user')}
                />
                <ChoiceCard
                  titleKey="Existing User"
                  descKey="I already use Nostr and want to connect"
                  onClick={() => setStep('existing_user')}
                />
              </div>
            </Show>

            <Show when={step() === 'new_user'}>
              <div class="space-y-3">
                <For each={NEW_USER_OPTIONS}>
                  {(opt) => (
                    <SubCard
                      titleKey={opt.titleKey}
                      descKey={opt.descKey}
                      comingSoon={opt.comingSoon}
                      onClick={
                        opt.comingSoon
                          ? undefined
                          : opt.id === 'amber_install'
                            ? () => window.open('https://github.com/greenart7c3/Amber', '_blank')
                            : opt.flow
                              ? () => setStep(opt.flow!)
                              : undefined
                      }
                    />
                  )}
                </For>
              </div>
            </Show>

            <Show when={step() === 'existing_user'}>
              <div class="space-y-3">
                <For each={existingUserOptions()}>
                  {(opt) => (
                    <SubCard
                      titleKey={opt.titleKey}
                      descKey={opt.descKey}
                      comingSoon={opt.comingSoon}
                      disabled={
                        (opt.id === 'amber_login' && !isAndroid()) ||
                        (opt.id === 'extension_login' && !nip07Available())
                      }
                      onClick={
                        opt.flow &&
                        !opt.comingSoon &&
                        !(opt.id === 'amber_login' && !isAndroid()) &&
                        !(opt.id === 'extension_login' && !nip07Available())
                          ? () => setStep(opt.flow!)
                          : undefined
                      }
                    />
                  )}
                </For>
              </div>
            </Show>

            <Show when={isFlowStep()}>
              <NostrConnectAuth
                flow={step()}
                onSuccess={() => {
                  props.onSuccess();
                  props.onClose();
                }}
                onError={(error) => {
                  if (!error) {
                    return;
                  }

                  logError('[NostrConnectModal] Auth flow error:', error);
                }}
              />
            </Show>
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
