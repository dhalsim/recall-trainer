import { finalizeEvent, getPublicKey } from 'nostr-tools';
import { decrypt as nip49Decrypt, encrypt as nip49Encrypt } from 'nostr-tools/nip49';

import { assertUnreachable } from '../../utils/nostr';
import { createKeyPair } from '../../utils/nostr';

import type {
  PasswordSignerData,
  ProviderCapability,
  SignEventParams,
  SignEventResult,
} from './types';
import type { NostrProvider } from './types';

export type { PasswordSignerData } from './types';

export interface PasswordSignerProvider extends NostrProvider {
  unlock(password: string): Promise<void>;
  lock(): void;
}

/**
 * Create a new keypair and encrypt it with the given password (NIP-49).
 * Caller must store the returned ncryptsec and zero the secret if held elsewhere.
 */
export function createPasswordProtectedKeypair(password: string): PasswordSignerData {
  const keyPair = createKeyPair();
  try {
    const ncryptsec = nip49Encrypt(keyPair.secret, password);

    return { ncryptsec };
  } finally {
    keyPair.secret.fill(0);
  }
}

/**
 * Create a password signer provider (closure-based). Key lives in closure; never stored on the object.
 * Exposes unlock(password) and lock() for the UI. getPublicKey caches pubkey after first unlock.
 * signEvent requires unlocked key; auto-locks after each sign.
 */
export function createPasswordSigner(data: PasswordSignerData): PasswordSignerProvider {
  let key: Uint8Array | null = null;
  let cachedPubkey: string | null = null;
  const ncryptsec = data.ncryptsec;

  const lock = (): void => {
    if (key) {
      key.fill(0);
      key = null;
    }
  };

  const unlock = async (password: string): Promise<void> => {
    if (key) {
      return;
    }

    key = nip49Decrypt(ncryptsec, password);

    if (cachedPubkey === null) {
      cachedPubkey = getPublicKey(key);
    }
  };

  const provider: PasswordSignerProvider = {
    method: 'password_signer',

    async unlock(password: string): Promise<void> {
      await unlock(password);
    },

    lock(): void {
      lock();
    },

    async isReady(): Promise<boolean> {
      return true;
    },

    async getPublicKey(): Promise<string | null> {
      return cachedPubkey;
    },

    async signEvent(params: SignEventParams): Promise<SignEventResult> {
      if (!key) {
        throw new Error('PASSWORD_REQUIRED');
      }

      try {
        const signedEvent = finalizeEvent(params.event, key);

        return { signedEvent, provider };
      } finally {
        lock();
      }
    },

    hasCapability(cap: ProviderCapability): boolean {
      switch (cap) {
        case 'signEvent':
          return true;
        case 'getRelays':
          return false;
        case 'getPublicKey':
          return true;
        default:
          assertUnreachable(cap);
      }
    },

    dispose(): void {
      lock();
    },
  };

  return provider;
}
