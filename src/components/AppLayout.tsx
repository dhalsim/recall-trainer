import type { JSX } from 'solid-js';
import { createSignal, Show } from 'solid-js';

import { t } from '../i18n';
import {
  ensureNip55ClipboardReadAccess,
  isNip55ClipboardAccessGranted,
} from '../lib/nostr/nip55ClipboardFlow';
import { store } from '../store';

import { AppHeader } from './AppHeader';
import { AppLogs } from './AppLogs';
import { Nip55ResultConsumer } from './Nip55ResultConsumer';
import { NostrConnectModal } from './NostrConnectModal';
import { SettingsDialog } from './SettingsDialog';

interface AppLayoutProps {
  children?: JSX.Element;
}

/**
 * Shared mobile-first layout: consistent spacing, safe-area aware, max-width container.
 * Header with [Profile] [Settings]; Connect modal and Settings dialog are global.
 */
export function AppLayout(props: AppLayoutProps) {
  const [showSettings, setShowSettings] = createSignal(false);
  const [showConnectModal, setShowConnectModal] = createSignal(false);
  const [showAppLogs, setShowAppLogs] = createSignal(false);
  const [clipboardAccessError, setClipboardAccessError] = createSignal(false);
  const isNip55Session = () => store.state().authLoginState?.method === 'nip55';

  async function askForClipboardAccess(): Promise<void> {
    const granted = await ensureNip55ClipboardReadAccess();
    setClipboardAccessError(!granted);
  }

  return (
    <div class="flex min-h-screen min-h-[100dvh] flex-col bg-slate-50 px-4 py-6 sm:px-6 sm:py-8">
      {/* Header outside <main> so only one icon row; fixed at top of layout */}
      <header class="mx-auto w-full max-w-2xl shrink-0" aria-label="App header">
        <AppHeader
          onOpenConnect={() => setShowConnectModal(true)}
          onOpenSettings={() => setShowSettings(true)}
        />
        <Show when={isNip55Session() && !isNip55ClipboardAccessGranted()}>
          <div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs text-amber-900">
                {t('Clipboard access is required for signing events.')}
              </p>
              <button
                type="button"
                onClick={() => void askForClipboardAccess()}
                class="shrink-0 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 shadow-sm transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              >
                {t('Ask for access')}
              </button>
            </div>
            <Show when={clipboardAccessError()}>
              <p class="mt-1 text-xs text-rose-700">{t('Clipboard access request was denied.')}</p>
            </Show>
          </div>
        </Show>
      </header>
      <div class="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <main class="flex-1" role="main">
          {props.children}
        </main>
        <footer
          class="shrink-0 py-4 pb-[max(2rem,env(safe-area-inset-bottom,0px))] text-center text-xs text-slate-400"
          aria-label="App version"
        >
          v {__APP_VERSION__}
        </footer>
      </div>
      <SettingsDialog
        open={showSettings()}
        onClose={() => setShowSettings(false)}
        onCheckLogs={() => {
          setShowSettings(false);
          setShowAppLogs(true);
        }}
      />
      <AppLogs open={showAppLogs()} onClose={() => setShowAppLogs(false)} />
      <NostrConnectModal
        open={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onSuccess={() => setShowConnectModal(false)}
      />
      <Nip55ResultConsumer />
    </div>
  );
}
