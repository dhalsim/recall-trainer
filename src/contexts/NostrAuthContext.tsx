import type { JSX } from 'solid-js';
import { createContext, createEffect, createSignal, useContext } from 'solid-js';

import {
  createNostrConnectProvider,
  type NostrConnectData,
} from '../lib/nostr/NostrConnectProvider';
import {
  checkNip55Callback,
  clearNip55Result,
  createNip55Provider,
  getNip55Result,
  parseNip55SignEventResult,
} from '../lib/nostr/Nip55Provider';
import type {
  LoginResult,
  Nip55SignerData,
  NostrProvider,
  SignEventParams,
  SignEventResult,
} from '../lib/nostr/types';
import { assertUnreachable } from '../utils/nostr';
import { store } from '../store';

export type { NostrConnectData, LoginResult, NostrProvider };

interface NostrAuthContextValue {
  provider: NostrProvider | null;
  isLoggedIn: () => boolean;
  isInitialized: () => boolean;
  loginWithNostrConnect: (data: NostrConnectData) => Promise<LoginResult>;
  loginWithNip55: (data: Nip55SignerData) => Promise<LoginResult>;
  logout: () => void;
  getPublicKey: (params?: { options?: { reason?: string } }) => Promise<string | null>;
  signEvent: (params: SignEventParams) => Promise<SignEventResult>;
  getPendingNip55SignResult: () => SignEventResult | null;
}

const NostrAuthContext = createContext<NostrAuthContextValue | null>(null);

export function useNostrAuth(): NostrAuthContextValue {
  const ctx = useContext(NostrAuthContext);

  if (!ctx) {
    throw new Error('useNostrAuth must be used within NostrAuthProvider');
  }

  return ctx;
}

export function NostrAuthProvider(props: { children: JSX.Element }) {
  const [provider, setProvider] = createSignal<NostrProvider | null>(null);
  const [isInitialized, setIsInitialized] = createSignal(false);
  const [pendingNip55SignResult, setPendingNip55SignResult] = createSignal<SignEventResult | null>(
    null,
  );

  createEffect(() => {
    checkNip55Callback();

    const nip55Result = getNip55Result();

    if (nip55Result) {
      if (nip55Result.type === 'get_public_key') {
        store.setAuthLoginState({
          method: 'nip55',
          loggedIn: true,
          data: { pubkey: nip55Result.result },
        });
        setProvider(createNip55Provider({ pubkey: nip55Result.result }));
        clearNip55Result();
      } else if (nip55Result.type === 'sign_event') {
        const auth = store.state().authLoginState;
        const nip55Data: Nip55SignerData | null =
          auth?.method === 'nip55' && auth.data && 'pubkey' in auth.data ? auth.data : null;
        const p = nip55Data ? createNip55Provider(nip55Data) : createNip55Provider({ pubkey: '' });
        const signedEvent = parseNip55SignEventResult(nip55Result.result);
        setPendingNip55SignResult({ signedEvent, provider: p });
        clearNip55Result();
      }
    }

    const auth = store.state().authLoginState;

    if (!nip55Result || nip55Result.type !== 'get_public_key') {
      if (!auth?.loggedIn || !auth.data) {
        setProvider(null);
      } else {
        switch (auth.method) {
          case 'nostrconnect':
            if ('relay' in auth.data) {
              setProvider(createNostrConnectProvider(auth.data));
            } else {
              setProvider(null);
            }
            break;
          case 'nip55':
            if ('pubkey' in auth.data) {
              setProvider(createNip55Provider(auth.data));
            } else {
              setProvider(null);
            }
            break;
          default:
            assertUnreachable(auth.method);
        }
      }
    }

    if (!isInitialized()) {
      setIsInitialized(true);
    }
  });

  const getIsLoggedIn = (): boolean => Boolean(provider());

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
      console.error('Nostr Connect login failed:', error);
      store.clearAuthLoginState();
      setProvider(null);

      return { success: false, provider: null };
    }
  };

  const loginWithNip55 = async (data: Nip55SignerData): Promise<LoginResult> => {
    try {
      store.setAuthLoginState({
        method: 'nip55',
        loggedIn: true,
        data,
      });

      const p = createNip55Provider(data);

      setProvider(p);

      return { success: true, provider: p };
    } catch (error) {
      console.error('NIP-55 login failed:', error);
      store.clearAuthLoginState();
      setProvider(null);

      return { success: false, provider: null };
    }
  };

  const getPendingNip55SignResult = (): SignEventResult | null => {
    const result = pendingNip55SignResult();

    if (result) {
      setPendingNip55SignResult(null);

      return result;
    }

    return null;
  };

  const logout = (): void => {
    store.clearAuthLoginState();
    setProvider(null);
  };

  const getPublicKey = async (params?: {
    options?: { reason?: string };
  }): Promise<string | null> => {
    const p = provider();

    if (!p) {
      return null;
    }

    try {
      return await p.getPublicKey(params ?? undefined);
    } catch (error) {
      console.error('Failed to get public key from provider:', error);

      return null;
    }
  };

  const signEvent = async (params: SignEventParams): Promise<SignEventResult> => {
    const p = provider();

    if (!p) {
      throw new Error('Provider not ready');
    }

    return p.signEvent(params);
  };

  const value: NostrAuthContextValue = {
    get provider() {
      return provider();
    },
    isLoggedIn: getIsLoggedIn,
    isInitialized,
    loginWithNostrConnect,
    loginWithNip55,
    logout,
    getPublicKey,
    signEvent,
    getPendingNip55SignResult,
  };

  return <NostrAuthContext.Provider value={value}>{props.children}</NostrAuthContext.Provider>;
}
