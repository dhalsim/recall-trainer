import { nip19 } from 'nostr-tools';
import { createSignal, onCleanup, onMount, Show } from 'solid-js';

import { t } from '../../i18n';
import type { StoredProfile } from '../../lib/profile/profileParse';
import { getDisplayName } from '../../lib/profile/profileParse';
import { PROFILE_RELAYS } from '../../utils/nostr';

import { Nip05Badge } from './Nip05Badge.tsx';

interface ProfilePopoverProps {
  pubkey: string;
  profile: StoredProfile;
  children: import('solid-js').JSX.Element;
}

export function ProfilePopover(props: ProfilePopoverProps) {
  const [open, setOpen] = createSignal(false);
  const displayName = () => getDisplayName(props.profile, props.pubkey);

  function handleClickOutside(e: MouseEvent): void {
    const target = e.target as Node;

    if (target instanceof Node && !document.getElementById('profile-popover')?.contains(target)) {
      setOpen(false);
    }
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside);
  });

  onCleanup(() => {
    document.removeEventListener('click', handleClickOutside);
  });

  function handleProfileLink(): void {
    const relays = props.profile.relays?.length ? props.profile.relays : PROFILE_RELAYS;

    const nprofile = nip19.nprofileEncode({ pubkey: props.pubkey, relays });

    window.open(`https://njump.me/${nprofile}`, '_blank');
    setOpen(false);
  }

  return (
    <div id="profile-popover" class="relative inline-block">
      <span
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setOpen((o) => !o)}
        class="cursor-pointer transition-opacity hover:opacity-80"
      >
        {props.children}
      </span>
      <Show when={open()}>
        <div
          class="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
          role="dialog"
          aria-label={displayName()}
        >
          <div class="flex items-center gap-3">
            <span class="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-sm font-medium text-slate-600">
              {props.profile.picture ? (
                <img
                  src={props.profile.picture}
                  alt={displayName()}
                  class="h-full w-full object-cover"
                />
              ) : (
                displayName().slice(0, 2).toUpperCase()
              )}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-slate-900">{displayName()}</p>
              <Show when={props.profile.nip05}>
                <Nip05Badge nip05={props.profile.nip05!} pubkey={props.pubkey} size="sm" />
              </Show>
            </div>
          </div>
          <Show when={props.profile.about}>
            <p class="mt-2 line-clamp-3 text-sm text-slate-600">{props.profile.about}</p>
          </Show>
          <button
            type="button"
            onClick={handleProfileLink}
            class="mt-3 w-full rounded bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            {t('View profile')}
          </button>
        </div>
      </Show>
    </div>
  );
}
