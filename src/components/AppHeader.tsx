import { createSignal, onCleanup, onMount, Show } from 'solid-js';

import { SyncDataDialog } from './SyncDataDialog';
import { useNostrAuth } from '../contexts/NostrAuthContext';
import { t } from '../i18n';

interface AppHeaderProps {
  onOpenConnect: () => void;
  onOpenSettings: () => void;
}

export function AppHeader(props: AppHeaderProps) {
  const { isLoggedIn, logout } = useNostrAuth();
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const [syncDialogOpen, setSyncDialogOpen] = createSignal(false);

  let dropdownRef: HTMLDivElement | undefined;

  const handleClickOutside = (e: MouseEvent) => {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      setDropdownOpen(false);
    }
  };

  onMount(() => {
    document.addEventListener('click', handleClickOutside);
  });

  onCleanup(() => {
    document.removeEventListener('click', handleClickOutside);
  });

  const handleConnect = () => {
    setDropdownOpen(false);
    props.onOpenConnect();
  };

  const handleSyncData = () => {
    setDropdownOpen(false);
    setSyncDialogOpen(true);
  };

  const handleSignOut = () => {
    setDropdownOpen(false);
    logout();
  };

  return (
    <div class="flex items-center justify-end gap-1 py-2">
      <div class="relative" ref={(el) => (dropdownRef = el)}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDropdownOpen((v) => !v);
          }}
          class="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label={t('Profile')}
          title={t('Profile')}
          aria-expanded={dropdownOpen()}
          aria-haspopup="true"
        >
          <svg
            class="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>
        <Show when={dropdownOpen()}>
          <div
            class="absolute right-0 top-full z-50 mt-1 min-w-[10rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            role="menu"
          >
            <Show
              when={!isLoggedIn()}
              fallback={
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSyncData}
                    class="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                  >
                    {t('Sync Data')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    class="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                  >
                    {t('Log out')}
                  </button>
                </>
              }
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleConnect}
                class="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
              >
                {t('Connect')}
              </button>
            </Show>
          </div>
        </Show>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          props.onOpenSettings();
        }}
        class="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label={t('Settings')}
        title={t('Settings')}
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.39a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      <SyncDataDialog
        open={syncDialogOpen()}
        onClose={() => setSyncDialogOpen(false)}
      />
    </div>
  );
}
