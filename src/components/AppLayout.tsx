import type { JSX } from 'solid-js';
import { createSignal } from 'solid-js';

import { AppHeader } from './AppHeader';
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

  return (
    <div class="min-h-screen min-h-[100dvh] bg-slate-50 px-4 py-6 sm:px-6 sm:py-8">
      {/* Header outside <main> so only one icon row; fixed at top of layout */}
      <header class="mx-auto max-w-2xl" aria-label="App header">
        <AppHeader
          onOpenConnect={() => setShowConnectModal(true)}
          onOpenSettings={() => setShowSettings(true)}
        />
      </header>
      <div class="mx-auto max-w-2xl">
        <main role="main">{props.children}</main>
      </div>
      <SettingsDialog open={showSettings()} onClose={() => setShowSettings(false)} />
      <NostrConnectModal
        open={showConnectModal()}
        onClose={() => setShowConnectModal(false)}
        onSuccess={() => setShowConnectModal(false)}
      />
    </div>
  );
}
