import type { EventTemplate, NostrEvent } from 'nostr-tools';

import { logger } from '../../utils/logger';
import { assertUnreachable } from '../../utils/nostr';

import type {
  Nip55SignerData,
  NostrProvider,
  ProviderCapability,
  SignEventParams,
  SignEventResult,
} from './types';

export type { Nip55SignerData } from './types';

const NIP55_PENDING_KEY = 'nip55_pending_request';
const NIP55_RESULT_KEY = 'nip55_result';
const NIP55_NAVIGATION_ERROR_CODE = 'NIP55_NAVIGATION';
const { error: logError } = logger();

/** Base URL for NIP-55 callback (signer redirects here with ?event= result). */
export function getNip55CallbackBaseUrl(): string {
  if (typeof window === 'undefined') {
    return 'https://recall-trainer.vercel.app';
  }

  const origin = window.location.origin;

  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
    return 'https://recall-trainer.vercel.app';
  }

  return origin;
}

/** Build nostrsigner: URI for get_public_key (login). */
export function buildNip55GetPublicKeyUri(): string {
  const base = getNip55CallbackBaseUrl();
  const callbackUrl = encodeURIComponent(`${base}/?event=`);
  const params = `compressionType=none&returnType=signature&type=get_public_key&callbackUrl=${callbackUrl}`;

  return `nostrsigner:?${params}`;
}

/** Build nostrsigner: URI for sign_event. Uses returnType=event to get full signed event JSON. */
export function buildNip55SignEventUri(event: EventTemplate): string {
  const base = getNip55CallbackBaseUrl();
  const callbackUrl = encodeURIComponent(`${base}/?event=`);
  const encodedEvent = encodeURIComponent(JSON.stringify(event));
  const params = `compressionType=none&returnType=signature&type=sign_event&callbackUrl=${callbackUrl}`;

  return `nostrsigner:${encodedEvent}?${params}`;
}

/** Build nostrsigner: URI for nip44_encrypt. */
export function buildNip55Nip44EncryptUri(pubkey: string, plaintext: string): string {
  const base = getNip55CallbackBaseUrl();
  const callbackUrl = encodeURIComponent(`${base}/?event=`);
  const encodedPlaintext = encodeURIComponent(plaintext);
  const encodedPubkey = encodeURIComponent(pubkey);
  const params = `compressionType=none&returnType=signature&type=nip44_encrypt&pubkey=${encodedPubkey}&callbackUrl=${callbackUrl}`;

  return `nostrsigner:${encodedPlaintext}?${params}`;
}

/** Build nostrsigner: URI for nip44_decrypt. */
export function buildNip55Nip44DecryptUri(pubkey: string, ciphertext: string): string {
  const base = getNip55CallbackBaseUrl();
  const callbackUrl = encodeURIComponent(`${base}/?event=`);
  const encodedCiphertext = encodeURIComponent(ciphertext);
  const encodedPubkey = encodeURIComponent(pubkey);
  const params = `compressionType=none&returnType=signature&type=nip44_decrypt&pubkey=${encodedPubkey}&callbackUrl=${callbackUrl}`;

  return `nostrsigner:${encodedCiphertext}?${params}`;
}

export type Nip55PendingType = 'get_public_key' | 'sign_event' | 'nip44_encrypt' | 'nip44_decrypt';

export type Nip55PendingPayload = {
  event?: EventTemplate;
  pubkey?: string;
  plaintext?: string;
  ciphertext?: string;
};

export interface Nip55PendingRequest {
  requestId: string;
  type: Nip55PendingType;
  timestamp: number;
  payload?: Nip55PendingPayload;
}

export function saveNip55PendingRequest(
  type: Nip55PendingType,
  payload: Nip55PendingPayload,
): void {
  const request: Nip55PendingRequest = {
    requestId:
      crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2),
    type,
    timestamp: Date.now(),
    payload,
  };

  try {
    localStorage.setItem(NIP55_PENDING_KEY, JSON.stringify(request));
  } catch (e) {
    logError('Failed to save NIP-55 pending request', e);
  }
}

export interface Nip55CallbackResult {
  requestId: string;
  type: Nip55PendingType;
  result: string;
}

/**
 * Call on every page load. Reads ?event= from URL; if present and we have a pending request,
 * saves result to localStorage and cleans the URL.
 */
export function checkNip55Callback(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const result = params.get('event');

  if (!result) {
    return;
  }

  let pending: Nip55PendingRequest | null = null;

  try {
    const raw = localStorage.getItem(NIP55_PENDING_KEY);

    if (!raw) {
      return;
    }

    pending = JSON.parse(raw) as Nip55PendingRequest;
  } catch {
    return;
  }

  try {
    const callbackResult: Nip55CallbackResult = {
      requestId: pending.requestId,
      type: pending.type,
      result: decodeURIComponent(result),
    };

    localStorage.setItem(NIP55_RESULT_KEY, JSON.stringify(callbackResult));
    localStorage.removeItem(NIP55_PENDING_KEY);
  } finally {
    const url = new URL(window.location.href);
    url.searchParams.delete('event');
    window.history.replaceState({}, '', url.pathname + url.search || '/');
  }
}

export function getNip55Result(): Nip55CallbackResult | null {
  try {
    const raw = localStorage.getItem(NIP55_RESULT_KEY);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as Nip55CallbackResult;
  } catch {
    return null;
  }
}

export function clearNip55Result(): void {
  try {
    localStorage.removeItem(NIP55_RESULT_KEY);
  } catch {
    // ignore
  }
}

/** Parse NIP-55 sign_event result (full event JSON) into NostrEvent. */
export function parseNip55SignEventResult(result: string): NostrEvent {
  try {
    const parsed = JSON.parse(result) as unknown;

    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as NostrEvent).id === 'string' &&
      typeof (parsed as NostrEvent).pubkey === 'string' &&
      typeof (parsed as NostrEvent).sig === 'string'
    ) {
      return parsed as NostrEvent;
    }
  } catch (e) {
    logError('Failed to parse NIP-55 sign_event result', e);
  }

  throw new Error('Invalid signed event from NIP-55 signer');
}

/** Parse NIP-55 nip44_encrypt/nip44_decrypt result as non-empty string. */
export function parseNip55Nip44Result(result: string): string {
  const trimmed = result.trim();

  if (!trimmed) {
    throw new Error('Invalid NIP-55 NIP-44 result');
  }

  return trimmed;
}

function createNip55NavigationError(): Error & { code: string } {
  const err = new Error(NIP55_NAVIGATION_ERROR_CODE) as Error & { code: string };
  err.code = NIP55_NAVIGATION_ERROR_CODE;

  return err;
}

export class Nip55Provider implements NostrProvider {
  method = 'nip55' as const;

  private data: Nip55SignerData;

  constructor(data: Nip55SignerData) {
    this.data = data;
  }

  async isReady(): Promise<boolean> {
    return true;
  }

  async getPublicKey(): Promise<string | null> {
    return this.data.pubkey;
  }

  async signEvent(params: SignEventParams): Promise<SignEventResult> {
    saveNip55PendingRequest('sign_event', { event: params.event });
    const url = buildNip55SignEventUri(params.event);
    window.location.href = url;

    return Promise.reject(createNip55NavigationError()) as Promise<SignEventResult>;
  }

  async nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
    saveNip55PendingRequest('nip44_encrypt', { pubkey, plaintext });
    const url = buildNip55Nip44EncryptUri(pubkey, plaintext);
    window.location.href = url;

    return Promise.reject(createNip55NavigationError()) as Promise<string>;
  }

  async nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    saveNip55PendingRequest('nip44_decrypt', { pubkey, ciphertext });
    const url = buildNip55Nip44DecryptUri(pubkey, ciphertext);
    window.location.href = url;

    return Promise.reject(createNip55NavigationError()) as Promise<string>;
  }

  hasCapability(cap: ProviderCapability): boolean {
    switch (cap) {
      case 'signEvent':
        return true;
      case 'getRelays':
        return false;
      case 'getPublicKey':
        return true;
      case 'nip44':
        return true;
      default:
        assertUnreachable(cap);
    }
  }

  dispose(): void {}
}

export function createNip55Provider(data: Nip55SignerData): Nip55Provider {
  return new Nip55Provider(data);
}
