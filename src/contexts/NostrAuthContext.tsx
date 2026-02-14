import type { JSX } from 'solid-js';
import { createContext, createEffect, createSignal, useContext } from 'solid-js';

import {
  createNostrConnectProvider,
  type NostrConnectData,
} from '../lib/nostr/NostrConnectProvider';
import type {
  LoginResult,
  NostrProvider,
  SignEventParams,
  SignEventResult,
} from '../lib/nostr/types';
import { store } from '../store';

export type { NostrConnectData, LoginResult, NostrProvider };

interface NostrAuthContextValue {
  provider: NostrProvider | null;
  isLoggedIn: () => boolean;
  isInitialized: () => boolean;
  loginWithNostrConnect: (data: NostrConnectData) => Promise<LoginResult>;
  logout: () => void;
  getPublicKey: (params?: { options?: { reason?: string } }) => Promise<string | null>;
  signEvent: (params: SignEventParams) => Promise<SignEventResult>;
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

  createEffect(() => {
    const auth = store.state().authLoginState;

    if (auth?.loggedIn && auth.method === 'nostrconnect' && auth.data) {
      setProvider(createNostrConnectProvider(auth.data));
    } else {
      setProvider(null);
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
    logout,
    getPublicKey,
    signEvent,
  };

  return <NostrAuthContext.Provider value={value}>{props.children}</NostrAuthContext.Provider>;
}
