import { createResource, Show } from 'solid-js';

import { t } from '../../i18n';
import { logger } from '../../utils/logger';

const VERIFY_CACHE = new Map<string, boolean | null>();
const { error } = logger();

interface Nip05BadgeProps {
  nip05: string;
  pubkey: string;
  size?: 'sm' | 'md';
  class?: string;
}

function verifyNip05(nip05: string, pubkey: string): Promise<boolean | null> {
  const cacheKey = `${nip05}:${pubkey}`;
  const cached = VERIFY_CACHE.get(cacheKey);

  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  return (async () => {
    try {
      const [username, host] = nip05.split('@');

      if (!username || !host) {
        VERIFY_CACHE.set(cacheKey, false);

        return false;
      }

      const res = await fetch(`https://${host}/.well-known/nostr.json?name=${username}`);

      if (!res.ok) {
        VERIFY_CACHE.set(cacheKey, null);

        return null;
      }

      const data = (await res.json()) as { names?: Record<string, string> };

      if (!data.names || Object.keys(data.names).length === 0) {
        VERIFY_CACHE.set(cacheKey, false);

        return false;
      }

      const verified = data.names[username] === pubkey;

      VERIFY_CACHE.set(cacheKey, verified);

      return verified;
    } catch (err) {
      error('[Nip05Badge] Verification failed:', err);
      VERIFY_CACHE.set(cacheKey, null);

      return null;
    }
  })();
}

export function Nip05Badge(props: Nip05BadgeProps) {
  const [result] = createResource(
    () => ({ nip05: props.nip05, pubkey: props.pubkey }),
    ({ nip05, pubkey }) => verifyNip05(nip05, pubkey),
  );

  const sizeClasses = () => (props.size === 'sm' ? 'w-3 h-3' : 'w-4 h-4');

  const icon = () => {
    const r = result();

    if (result.loading) {
      return (
        <svg class={sizeClasses()} fill="currentColor" viewBox="0 0 20 20">
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
            clip-rule="evenodd"
          />
        </svg>
      );
    }

    if (r === true) {
      return (
        <svg class={sizeClasses()} fill="currentColor" viewBox="0 0 20 20">
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clip-rule="evenodd"
          />
        </svg>
      );
    }

    if (r === false) {
      return (
        <svg class={sizeClasses()} fill="currentColor" viewBox="0 0 20 20">
          <path
            fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
            clip-rule="evenodd"
          />
        </svg>
      );
    }

    return (
      <svg class={sizeClasses()} fill="currentColor" viewBox="0 0 20 20">
        <path
          fill-rule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 9a1 1 0 00-1-1H9a1 1 0 100 2h1a1 1 0 001-1z"
          clip-rule="evenodd"
        />
      </svg>
    );
  };

  const title = () => {
    if (result.loading) {
      return t('Verifying NIP-05…');
    }

    if (result() === true) {
      return t('NIP-05 verified');
    }

    if (result() === false) {
      return t('NIP-05 not verified');
    }

    return t('Could not verify NIP-05');
  };

  const colorClass = () => {
    if (result.loading) {
      return 'text-slate-400';
    }

    if (result() === true) {
      return 'text-green-600';
    }

    if (result() === false) {
      return 'text-slate-500';
    }

    return 'text-amber-600';
  };

  return (
    <div class={`flex items-center gap-1 ${colorClass()} ${props.class ?? ''}`} title={title()}>
      {icon()}
      <Show when={!result.loading}>
        <span class="text-xs">{props.nip05}</span>
      </Show>
    </div>
  );
}
