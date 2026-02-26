import type { JSX } from 'solid-js';
import { createContext, createEffect, createMemo, createSignal, useContext } from 'solid-js';

import { connectBunker, createBunkerProvider } from '../lib/nostr/BunkerProvider';
import { createNip07Provider } from '../lib/nostr/Nip07Provider';
import { createNip55Provider } from '../lib/nostr/Nip55Provider';
import { clearRelays, getRelays, subscribeRelays } from '../lib/nostr/nip65';
import { clearSyncState, subscribeSyncEvents } from '../lib/nostr/nip78';
import {
  createNostrConnectProvider,
  type NostrConnectData,
} from '../lib/nostr/NostrConnectProvider';
import { createPasskeySigner } from '../lib/nostr/PasskeySignerProvider';
import { createPasswordSigner } from '../lib/nostr/PasswordSignerProvider';
import type {
  BunkerSignerData,
  GetPublicKeyParams,
  LoginResult,
  Nip55SignerData,
  NostrProvider,
  PasskeySignerData,
  PasswordSignerData,
  SignEventParams,
  SignEventResult,
} from '../lib/nostr/types';
import { store } from '../store';
import { delay } from '../utils/delay';
import { logger } from '../utils/logger';
import { assertUnreachable, DEFAULT_READ_RELAYS, pool } from '../utils/nostr';

export type { BunkerSignerData, NostrConnectData, LoginResult, NostrProvider };
const { log, error: logError } = logger();

export interface NostrAuthContextValue {
  provider: NostrProvider | null;
  pubkey: () => string | null;
  isLoggedIn: () => boolean;
  isInitialized: () => boolean;
  loginWithBunker: (bunkerUrl: string) => Promise<LoginResult>;
  loginWithNostrConnect: (data: NostrConnectData) => Promise<LoginResult>;
  loginWithNip07: () => Promise<LoginResult>;
  loginWithNip55: (data: Nip55SignerData) => Promise<LoginResult>;
  loginWithPasskey: (data: PasskeySignerData) => Promise<LoginResult>;
  loginWithPasswordSigner: (data: PasswordSignerData, password: string) => Promise<LoginResult>;
  logout: () => void;
  getPublicKey: (params: GetPublicKeyParams) => Promise<string | null>;
  signEvent: (params: SignEventParams) => Promise<SignEventResult>;
  getPendingNip55SignResult: () => SignEventResult | null;
  nip44Encrypt: (pubkey: string, plaintext: string) => Promise<string>;
  nip44Decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  applyNip55Login: (pubkey: string) => void;
  setPendingNip55SignResult: (result: SignEventResult) => void;
  setPendingNip55EncryptResult: (result: string) => void;
  setPendingNip55DecryptResult: (result: string) => void;
}

const NostrAuthContext = createContext<NostrAuthContextValue | null>(null);

type PendingNip55ResultState = {
  signEvent: SignEventResult | null;
  nip44Encrypt: string | null;
  nip44Decrypt: string | null;
};

export function useNostrAuth(): NostrAuthContextValue {
  const ctx = useContext(NostrAuthContext);

  if (!ctx) {
    throw new Error('useNostrAuth must be used within NostrAuthProvider');
  }

  return ctx;
}

export function NostrAuthProvider(props: { children: JSX.Element }) {
  const [provider, setProvider] = createSignal<NostrProvider | null>(null);
  const [pubkey, setPubkey] = createSignal<string | null>(null);
  const [isInitialized, setIsInitialized] = createSignal(false);

  const [pendingNip55Result, setPendingNip55Result] = createSignal<PendingNip55ResultState>({
    signEvent: null,
    nip44Encrypt: null,
    nip44Decrypt: null,
  });

  const authLoginState = createMemo(() => store.state().authLoginState);

  createEffect(() => {
    const auth = authLoginState();
    let cancelled = false;

    const hasDataOrNip07 = auth?.loggedIn && (auth.method === 'nip07' || auth.data !== undefined);

    if (!hasDataOrNip07) {
      setProvider(null);

      if (!isInitialized()) {
        setIsInitialized(true);
      }

      return;
    }

    switch (auth.method) {
      case 'bunker':
        if (
          auth.data &&
          'userPubkey' in auth.data &&
          'remoteSignerPubkey' in auth.data &&
          'ephemeralSecret' in auth.data
        ) {
          setProvider(createBunkerProvider(auth.data));
        } else {
          setProvider(null);
        }

        break;
      case 'nostrconnect':
        if (auth.data && 'uri' in auth.data) {
          setProvider(createNostrConnectProvider(auth.data));
        } else {
          setProvider(null);
        }

        break;
      case 'nip07': {
        void delay(createNip07Provider, 2000).then((p) => {
          if (!cancelled) {
            setProvider(p);
          }
        });

        break;
      }

      case 'nip55':
        if (auth.data && 'pubkey' in auth.data) {
          setProvider(createNip55Provider(auth.data));
        } else {
          setProvider(null);
        }

        break;
      case 'passkey_signer':
        if (auth.data && 'ncryptsec' in auth.data && 'credentialId' in auth.data) {
          setProvider(createPasskeySigner(auth.data));
        } else {
          setProvider(null);
        }

        break;
      case 'password_signer':
        if (auth.data && 'ncryptsec' in auth.data && !('credentialId' in auth.data)) {
          setProvider(createPasswordSigner(auth.data));
        } else {
          setProvider(null);
        }

        break;
      default:
        assertUnreachable(auth.method);
    }

    if (!isInitialized()) {
      setIsInitialized(true);
    }

    return () => {
      cancelled = true;
    };
  });

  // Resolve pubkey when provider changes
  createEffect(() => {
    const p = provider();

    if (!p) {
      setPubkey(null);

      return;
    }

    let cancelled = false;

    void p.getPublicKey({ reason: 'Get public key' }).then((pk) => {
      if (cancelled || !pk) {
        return;
      }

      setPubkey(pk);
    });

    return () => {
      cancelled = true;
      setPubkey(null);
    };
  });

  // Subscribe to NIP-65 and NIP-78 when pubkey is available
  createEffect(() => {
    const pk = pubkey();

    if (!pk) {
      clearRelays();
      clearSyncState();

      return;
    }

    const unsub65 = subscribeRelays(pool, pk);

    const readRelays = getRelays(pk)?.readRelays?.length
      ? getRelays(pk)!.readRelays
      : DEFAULT_READ_RELAYS;

    const unsub78 = subscribeSyncEvents(readRelays, pk);

    return () => {
      unsub65();
      unsub78();
    };
  });

  const getIsLoggedIn = (): boolean => Boolean(provider());

  const applyNip55Login = (nextPubkey: string): void => {
    store.setAuthLoginState({
      method: 'nip55',
      loggedIn: true,
      data: { pubkey: nextPubkey },
    });

    setProvider(createNip55Provider({ pubkey: nextPubkey }));
  };

  const setPendingNip55SignResult = (result: SignEventResult): void => {
    setPendingNip55Result((prev) => ({ ...prev, signEvent: result }));
  };

  const setPendingNip55EncryptResult = (result: string): void => {
    setPendingNip55Result((prev) => ({ ...prev, nip44Encrypt: result }));
  };

  const setPendingNip55DecryptResult = (result: string): void => {
    setPendingNip55Result((prev) => ({ ...prev, nip44Decrypt: result }));
  };

  const loginWithBunker = async (bunkerUrl: string): Promise<LoginResult> => {
    try {
      const data = await connectBunker(bunkerUrl);

      store.setAuthLoginState({
        method: 'bunker',
        loggedIn: true,
        data,
      });

      const p = createBunkerProvider(data);

      setProvider(p);

      return { success: true, provider: p };
    } catch (error) {
      logError('Bunker login failed:', error);
      store.clearAuthLoginState();
      setProvider(null);

      return { success: false, provider: null };
    }
  };

  const loginWithNostrConnect = async (data: NostrConnectData): Promise<LoginResult> => {
    try {
      store.setAuthLoginState({
        method: 'nostrconnect',
        loggedIn: true,
        data,
      });

      const p = createNostrConnectProvider(data);

      setProvider(p);

      return { success: true, provider: p };
    } catch (error) {
      logError('Nostr Connect login failed:', error);
      store.clearAuthLoginState();
      setProvider(null);

      return { success: false, provider: null };
    }
  };

  const loginWithNip07 = async (): Promise<LoginResult> => {
    try {
      const p = createNip07Provider();
      const ready = await p.isReady();

      if (!ready) {
        return { success: false, provider: null };
      }

      store.setAuthLoginState({
        method: 'nip07',
        loggedIn: true,
      });

      setProvider(p);

      return { success: true, provider: p };
    } catch (error) {
      logError('NIP-07 login failed:', error);
      store.clearAuthLoginState();
      setProvider(null);

      return { success: false, provider: null };
    }
  };

  const loginWithNip55 = async (data: Nip55SignerData): Promise<LoginResult> => {
    try {
      log('[NostrAuth] loginWithNip55 called.');

      store.setAuthLoginState({
        method: 'nip55',
        loggedIn: true,
        data,
      });

      const p = createNip55Provider(data);

      setProvider(p);
      log('[NostrAuth] NIP-55 provider initialized.');

      return { success: true, provider: p };
    } catch (error) {
      logError('NIP-55 login failed:', error);
      store.clearAuthLoginState();
      setProvider(null);

      return { success: false, provider: null };
    }
  };

  const loginWithPasskey = async (data: PasskeySignerData): Promise<LoginResult> => {
    try {
      store.setAuthLoginState({
        method: 'passkey_signer',
        loggedIn: true,
        data,
      });

      const p = createPasskeySigner(data);

      setProvider(p);

      return { success: true, provider: p };
    } catch (error) {
      logError('Passkey signer login failed:', error);
      store.clearAuthLoginState();
      setProvider(null);

      return { success: false, provider: null };
    }
  };

  const loginWithPasswordSigner = async (
    data: PasswordSignerData,
    password: string,
  ): Promise<LoginResult> => {
    try {
      const p = createPasswordSigner(data);

      await p.unlock(password);

      store.setAuthLoginState({
        method: 'password_signer',
        loggedIn: true,
        data,
      });

      setProvider(p);

      return { success: true, provider: p };
    } catch (error) {
      logError('Password signer login failed:', error);
      store.clearAuthLoginState();
      setProvider(null);

      return { success: false, provider: null };
    }
  };

  const getPendingNip55SignResult = (): SignEventResult | null => {
    const result = pendingNip55Result().signEvent;

    if (result) {
      setPendingNip55Result((prev) => ({ ...prev, signEvent: null }));

      return result;
    }

    return null;
  };

  const logout = (): void => {
    store.clearAuthLoginState();
    setProvider(null);
    setPendingNip55Result({ signEvent: null, nip44Encrypt: null, nip44Decrypt: null });
  };

  const getPublicKey = async (params: GetPublicKeyParams): Promise<string | null> => {
    const p = provider();

    if (!p) {
      return null;
    }

    try {
      return await p.getPublicKey(params);
    } catch (error) {
      logError('Failed to get public key from provider:', error);

      return null;
    }
  };

  const signEvent = async (params: SignEventParams): Promise<SignEventResult> => {
    const p = provider();

    if (!p) {
      throw new Error('Provider not ready');
    }

    if (p.method === 'nip55') {
      const pending = pendingNip55Result().signEvent;

      if (pending) {
        setPendingNip55Result((prev) => ({ ...prev, signEvent: null }));

        return pending;
      }
    }

    return p.signEvent(params);
  };

  const nip44Encrypt = async (pubkey: string, plaintext: string): Promise<string> => {
    const p = provider();

    if (!p) {
      throw new Error('Provider not ready');
    }

    if (!p.hasCapability('nip44') || !p.nip44Encrypt) {
      throw new Error('NIP-44 encryption is not supported by your current signer.');
    }

    if (p.method === 'nip55') {
      const pending = pendingNip55Result().nip44Encrypt;

      if (pending !== null) {
        setPendingNip55Result((prev) => ({ ...prev, nip44Encrypt: null }));

        return pending;
      }
    }

    return p.nip44Encrypt(pubkey, plaintext);
  };

  const nip44Decrypt = async (pubkey: string, ciphertext: string): Promise<string> => {
    const p = provider();

    if (!p) {
      throw new Error('Provider not ready');
    }

    if (!p.hasCapability('nip44') || !p.nip44Decrypt) {
      throw new Error('NIP-44 encryption is not supported by your current signer.');
    }

    if (p.method === 'nip55') {
      const pending = pendingNip55Result().nip44Decrypt;

      if (pending !== null) {
        setPendingNip55Result((prev) => ({ ...prev, nip44Decrypt: null }));

        return pending;
      }
    }

    return p.nip44Decrypt(pubkey, ciphertext);
  };

  const value: NostrAuthContextValue = {
    get provider() {
      return provider();
    },
    pubkey,
    isLoggedIn: getIsLoggedIn,
    isInitialized,
    loginWithBunker,
    loginWithNostrConnect,
    loginWithNip07,
    loginWithNip55,
    loginWithPasskey,
    loginWithPasswordSigner,
    logout,
    getPublicKey,
    signEvent,
    getPendingNip55SignResult,
    nip44Encrypt,
    nip44Decrypt,
    applyNip55Login,
    setPendingNip55SignResult,
    setPendingNip55EncryptResult,
    setPendingNip55DecryptResult,
  };

  return <NostrAuthContext.Provider value={value}>{props.children}</NostrAuthContext.Provider>;
}
