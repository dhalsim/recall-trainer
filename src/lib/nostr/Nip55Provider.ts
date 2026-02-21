import type { EventTemplate, NostrEvent } from 'nostr-tools';

import { logger } from '../../utils/logger';
import { assertUnreachable } from '../../utils/nostr';

import {
  NIP55_PENDING_KEY,
  NIP55_RESULT_KEY,
  resumeNip55ClipboardFlowFromPending,
  startNip55ClipboardFlow,
  stopNip55ClipboardFlow,
  type Nip55PendingType,
} from './nip55ClipboardFlow';
import type {
  Nip55SignerData,
  NostrProvider,
  ProviderCapability,
  SignEventParams,
  SignEventResult,
} from './types';

export type { Nip55SignerData } from './types';
export type { Nip55PendingType } from './nip55ClipboardFlow';
const NIP55_NAVIGATION_ERROR_CODE = 'NIP55_NAVIGATION';
const { log, error: logError } = logger();

/** Build nostrsigner: URI for get_public_key (login). */
export function buildNip55GetPublicKeyUri(): string {
  const params = 'compressionType=none&returnType=signature&type=get_public_key';
  const uri = `nostrsigner:?${params}`;

  log('[NIP-55][Clipboard] Built get_public_key URI (clipboard-only mode).');
  log(`[NIP-55] URI=${uri}`);

  return uri;
}

/** Build nostrsigner: URI for sign_event. Uses returnType=event to get full signed event JSON. */
export function buildNip55SignEventUri(event: EventTemplate): string {
  const encodedEvent = encodeURIComponent(JSON.stringify(event));
  const params = 'compressionType=none&returnType=event&type=sign_event';
  const uri = `nostrsigner:${encodedEvent}?${params}`;

  log('[NIP-55][Clipboard] Built sign_event URI (clipboard-only mode, returnType=event).');

  return uri;
}

/** Build nostrsigner: URI for nip44_encrypt. */
export function buildNip55Nip44EncryptUri(pubkey: string, plaintext: string): string {
  const encodedPlaintext = encodeURIComponent(plaintext);
  const encodedPubkey = encodeURIComponent(pubkey);
  const params = `compressionType=none&returnType=signature&type=nip44_encrypt&pubkey=${encodedPubkey}`;
  const uri = `nostrsigner:${encodedPlaintext}?${params}`;

  log(`[NIP-55][Clipboard] Built nip44_encrypt URI (clipboard-only mode), pubkey=${pubkey}`);

  return uri;
}

/** Build nostrsigner: URI for nip44_decrypt. */
export function buildNip55Nip44DecryptUri(pubkey: string, ciphertext: string): string {
  const encodedCiphertext = encodeURIComponent(ciphertext);
  const encodedPubkey = encodeURIComponent(pubkey);
  const params = `compressionType=none&returnType=signature&type=nip44_decrypt&pubkey=${encodedPubkey}`;
  const uri = `nostrsigner:${encodedCiphertext}?${params}`;

  log(`[NIP-55][Clipboard] Built nip44_decrypt URI (clipboard-only mode), pubkey=${pubkey}`);

  return uri;
}

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
): Nip55PendingRequest | null {
  const request: Nip55PendingRequest = {
    requestId:
      crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2),
    type,
    timestamp: Date.now(),
    payload,
  };

  try {
    localStorage.setItem(NIP55_PENDING_KEY, JSON.stringify(request));
    log(`[NIP-55] Pending request saved. type=${type}, requestId=${request.requestId}`);
    void startNip55ClipboardFlow(request.requestId, type);

    return request;
  } catch (e) {
    logError('Failed to save NIP-55 pending request', e);

    return null;
  }
}

export interface Nip55CallbackResult {
  requestId: string;
  type: Nip55PendingType;
  result: string;
}

/**
 * Call on every page load. Clipboard flow only; callback route is ignored.
 */
export function checkNip55Callback(): void {
  if (typeof window === 'undefined') {
    return;
  }

  void resumeNip55ClipboardFlowFromPending();

  log(
    `[NIP-55] checkNip55Callback called. path=${window.location.pathname}${window.location.search}`,
  );

  const params = new URLSearchParams(window.location.search);
  const result = params.get('event');

  if (!result) {
    return;
  }

  log('[NIP-55][Callback] Ignoring callback result because clipboard-only mode is enabled.');
  const url = new URL(window.location.href);
  url.searchParams.delete('event');
  window.history.replaceState({}, '', url.pathname + url.search || '/');
  log(`[NIP-55][Callback] Callback param removed from URL: ${url.pathname}${url.search}`);
  stopNip55ClipboardFlow('callback-ignored');
}

export function getNip55Result(): Nip55CallbackResult | null {
  try {
    const raw = localStorage.getItem(NIP55_RESULT_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Nip55CallbackResult;
    log(`[NIP-55] Callback result loaded. type=${parsed.type}, requestId=${parsed.requestId}`);

    return parsed;
  } catch (e) {
    logError('Failed to parse NIP-55 callback result', e);

    return null;
  }
}

export function clearNip55Result(): void {
  try {
    localStorage.removeItem(NIP55_RESULT_KEY);
    log('[NIP-55] Callback result cleared.');
  } catch (e) {
    logError('Failed to clear NIP-55 callback result', e);
  }
}

export function startNip55GetPublicKeyFlow(): void {
  const request = saveNip55PendingRequest('get_public_key', {});

  if (!request) {
    throw new Error('Failed to initialize NIP-55 get_public_key flow');
  }

  const url = buildNip55GetPublicKeyUri();
  log(`[NIP-55] Redirecting to signer for get_public_key. requestId=${request.requestId}`);
  window.location.href = url;
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
      log('[NIP-55] sign_event callback parsed successfully.');

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

  log('[NIP-55] nip44 callback parsed successfully.');

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
    const request = saveNip55PendingRequest('sign_event', { event: params.event });

    if (!request) {
      throw new Error('Failed to initialize NIP-55 sign_event flow');
    }

    const url = buildNip55SignEventUri(params.event);
    log(`[NIP-55] Redirecting to signer for sign_event. requestId=${request.requestId}`);
    window.location.href = url;

    return Promise.reject(createNip55NavigationError()) as Promise<SignEventResult>;
  }

  async nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
    const request = saveNip55PendingRequest('nip44_encrypt', { pubkey, plaintext });

    if (!request) {
      throw new Error('Failed to initialize NIP-55 nip44_encrypt flow');
    }

    const url = buildNip55Nip44EncryptUri(pubkey, plaintext);
    log(`[NIP-55] Redirecting to signer for nip44_encrypt. requestId=${request.requestId}`);
    window.location.href = url;

    return Promise.reject(createNip55NavigationError()) as Promise<string>;
  }

  async nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    const request = saveNip55PendingRequest('nip44_decrypt', { pubkey, ciphertext });

    if (!request) {
      throw new Error('Failed to initialize NIP-55 nip44_decrypt flow');
    }

    const url = buildNip55Nip44DecryptUri(pubkey, ciphertext);
    log(`[NIP-55] Redirecting to signer for nip44_decrypt. requestId=${request.requestId}`);
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
