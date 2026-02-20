import { Show } from 'solid-js';

import { getProfile } from '../../lib/profile/profileCache';
import { getDisplayName } from '../../lib/profile/profileParse';

import { ProfilePopover } from './ProfilePopover.tsx';

const SIZE_CLASSES: Record<string, string> = {
  xs: 'h-4 w-4 text-[8px]',
  sm: 'h-6 w-6 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
};

interface ProfileAvatarProps {
  pubkey: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  disablePopup?: boolean;
  class?: string;
}

export function ProfileAvatar(props: ProfileAvatarProps) {
  const profile = () => getProfile(props.pubkey);
  const size = () => props.size ?? 'md';
  const sizeClasses = () => SIZE_CLASSES[size()] ?? SIZE_CLASSES.md;

  const avatarContent = () => {
    const p = profile();
    const displayName = getDisplayName(p, props.pubkey);

    const fallbackText = p
      ? displayName.slice(0, 2).toUpperCase()
      : props.pubkey.slice(0, 2).toUpperCase();

    return (
      <span
        class={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 font-medium text-slate-600 ${sizeClasses()} ${props.class ?? ''}`}
      >
        <Show when={p?.picture} fallback={fallbackText}>
          <img src={profile()!.picture!} alt={displayName} class="h-full w-full object-cover" />
        </Show>
      </span>
    );
  };

  return (
    <Show when={!props.disablePopup && profile()} fallback={avatarContent()}>
      <ProfilePopover pubkey={props.pubkey} profile={profile()!}>
        {avatarContent()}
      </ProfilePopover>
    </Show>
  );
}
