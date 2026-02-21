/**
 * Shared NIP-46 (remote signer) helpers for JSON-RPC-like request/response over kind 24133.
 * Used by NostrConnectProvider and BunkerProvider.
 */

import type { EventTemplate } from 'nostr-tools';
import { finalizeEvent, nip04, nip44 } from 'nostr-tools';

import { logger } from '../../utils/logger';
import { generateRandomHexString, pool } from '../../utils/nostr';
const { error: logError } = logger();

/** NIP-46 request/response event kind. */
export const NIP46_KIND = 24133;

/** JSON-RPC-like request payload (encrypted in event content). */
export type Nip46RequestPayload = {
  id: string;
  method: string;
  params: string[];
};

/** JSON-RPC-like response payload (encrypted in event content). */
export type Nip46ResponsePayload = {
  id: string;
  result?: string;
  error?: string;
};

/**
 * Encrypt a NIP-46 request for the remote signer.
 */
export function encryptRequest(
  method: string,
  params: string[],
  clientSecret: Uint8Array,
  remoteSignerPubkey: string,
): { encrypted: string; id: string } {
  const id = generateRandomHexString(16);
  const conversationKey = nip44.v2.utils.getConversationKey(clientSecret, remoteSignerPubkey);

  const encrypted = nip44.encrypt(
    JSON.stringify({ id, method, params } satisfies Nip46RequestPayload),
    conversationKey,
  );

  return { encrypted, id };
}

/**
 * Decrypt NIP-46 response content (supports NIP-04 legacy and NIP-44).
 */
export function decryptContent(
  content: string,
  senderPubkey: string,
  ephemeralSecret: Uint8Array,
): string | null {
  try {
    if (content.includes('?iv=')) {
      return nip04.decrypt(ephemeralSecret, senderPubkey, content);
    }

    const conversationKey = nip44.v2.utils.getConversationKey(ephemeralSecret, senderPubkey);

    return nip44.decrypt(content, conversationKey);
  } catch (error) {
    logError('[RemoteSigner] Failed to decrypt content:', error);

    return null;
  }
}

/**
 * Parse decrypted response string into Nip46ResponsePayload.
 */
export function parseResponse(decrypted: string): Nip46ResponsePayload {
  const parsed = JSON.parse(decrypted) as Nip46ResponsePayload;

  if (typeof parsed.id !== 'string') {
    throw new Error('Invalid NIP-46 response: missing id');
  }

  return parsed;
}

export type SendNip46RequestParams = {
  relays: string[];
  ephemeralSecret: Uint8Array;
  ephemeralPubkey: string;
  remoteSignerPubkey: string;
  method: string;
  params: string[];
};

/**
 * Send a NIP-46 request and wait for the matching response.
 * Resolves with the response payload; rejects on error or timeout.
 */
export function sendNip46Request(params: SendNip46RequestParams): Promise<Nip46ResponsePayload> {
  const {
    relays,
    ephemeralSecret,
    ephemeralPubkey,
    remoteSignerPubkey,
    method,
    params: requestParams,
  } = params;

  const { encrypted, id } = encryptRequest(
    method,
    requestParams,
    ephemeralSecret,
    remoteSignerPubkey,
  );

  const template: EventTemplate = {
    kind: NIP46_KIND,
    content: encrypted,
    tags: [['p', remoteSignerPubkey]],
    created_at: Math.floor(Date.now() / 1000),
  };

  const signedEvent = finalizeEvent(template, ephemeralSecret);

  return new Promise((resolve, reject) => {
    const sub = pool.subscribe(
      relays,
      {
        kinds: [NIP46_KIND],
        authors: [remoteSignerPubkey],
        '#p': [ephemeralPubkey],
        limit: 1,
      },
      {
        onevent: (event) => {
          if (event.kind !== NIP46_KIND || event.pubkey !== remoteSignerPubkey) {
            return;
          }

          const decrypted = decryptContent(event.content, event.pubkey, ephemeralSecret);

          if (!decrypted) {
            sub.close();
            reject(new Error('Failed to decrypt NIP-46 response'));

            return;
          }

          let parsed: Nip46ResponsePayload;

          try {
            parsed = parseResponse(decrypted);
          } catch (e) {
            sub.close();
            reject(e);

            return;
          }

          if (parsed.id !== id) {
            return;
          }

          sub.close();

          if (parsed.error) {
            reject(new Error(parsed.error));

            return;
          }

          resolve(parsed);
        },
      },
    );

    void Promise.allSettled(pool.publish(relays, signedEvent)).catch((err) => {
      sub.close();
      reject(err);
    });
  });
}
