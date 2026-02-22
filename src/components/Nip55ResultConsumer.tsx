import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';

import { useNostrAuth } from '../contexts/NostrAuthContext';
import {
  NIP55_PENDING_KEY,
  NIP55_RESULT_KEY,
  NIP55_RESULT_READY_EVENT,
} from '../lib/nostr/nip55ClipboardFlow';
import {
  checkNip55Callback,
  clearNip55Result,
  createNip55Provider,
  getNip55Result,
  parseNip55Nip44Result,
  parseNip55SignEventResult,
} from '../lib/nostr/Nip55Provider';
import { isAmberLoginFlowActive } from '../lib/nostr/nip55UiState';
import { store } from '../store';
import { logger } from '../utils/logger';

const { error: logError } = logger();

export function Nip55ResultConsumer() {
  const auth = useNostrAuth();
  const [tick, setTick] = createSignal(0);
  const [lastConsumedRequestId, setLastConsumedRequestId] = createSignal<string | null>(null);

  const shouldProcessNip55 = (): boolean => {
    if (typeof window === 'undefined') {
      return false;
    }

    const method = store.state().authLoginState?.method;
    const amberFlowActive = isAmberLoginFlowActive();

    if (method && method !== 'nip55' && !amberFlowActive) {
      return false;
    }

    if (method === 'nip55' || amberFlowActive) {
      return true;
    }

    return (
      localStorage.getItem(NIP55_PENDING_KEY) !== null ||
      localStorage.getItem(NIP55_RESULT_KEY) !== null
    );
  };

  const consumeNip55Result = (): void => {
    if (typeof window === 'undefined' || !shouldProcessNip55()) {
      return;
    }

    checkNip55Callback();
    const result = getNip55Result();

    if (!result) {
      return;
    }

    if (lastConsumedRequestId() === result.requestId) {
      clearNip55Result();

      return;
    }

    setLastConsumedRequestId(result.requestId);

    try {
      if (result.type === 'get_public_key') {
        auth.applyNip55Login(result.result);
      } else if (result.type === 'sign_event') {
        const signedEvent = parseNip55SignEventResult(result.result);
        const authData = store.state().authLoginState?.data;

        const fallbackPubkey =
          authData && 'pubkey' in authData && typeof authData.pubkey === 'string'
            ? authData.pubkey
            : '';

        const provider =
          auth.provider?.method === 'nip55'
            ? auth.provider
            : createNip55Provider({ pubkey: fallbackPubkey });

        auth.setPendingNip55SignResult({ signedEvent, provider });
      } else if (result.type === 'nip44_encrypt') {
        auth.setPendingNip55EncryptResult(parseNip55Nip44Result(result.result));
      } else if (result.type === 'nip44_decrypt') {
        auth.setPendingNip55DecryptResult(parseNip55Nip44Result(result.result));
      }
    } catch (error) {
      logError('[Nip55ResultConsumer] Failed to consume NIP-55 result:', error);
    } finally {
      clearNip55Result();
    }
  };

  onMount(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onResultReady = () => setTick((v) => v + 1);
    window.addEventListener(NIP55_RESULT_READY_EVENT, onResultReady);
    setTick((v) => v + 1);

    onCleanup(() => {
      window.removeEventListener(NIP55_RESULT_READY_EVENT, onResultReady);
    });
  });

  createEffect(() => {
    tick();
    consumeNip55Result();
  });

  return null;
}
