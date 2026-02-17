/**
 * NIP-46 Bunker (remote signer) provider.
 * Direct connection initiated by client: user pastes bunker:// URL from remote signer,
 * client sends connect request then get_public_key. See https://nips.nostr.com/46
 */

import { finalizeEvent, nip44 } from 'nostr-tools';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';

import { assertUnreachable, createKeyPair, generateRandomHexString, pool } from '../../utils/nostr';

import { decryptContent } from './NostrConnectProvider';
import type {
  BunkerSignerData,
  NostrProvider,
  ProviderCapability,
  SignEventParams,
  SignEventResult,
} from './types';

export type { BunkerSignerData };

const NIP46_KIND = 24133;
const DEFAULT_PERMS = 'sign_event,get_public_key';

export interface ParsedBunkerUrl {
  remoteSignerPubkey: string;
  relays: string[];
  secret?: string;
}

/**
 * Parse a bunker:// URL from the remote signer.
 * Format: bunker://<remote-signer-pubkey>?relay=wss://...&relay=...&secret=optional
 */
export function parseBunkerUrl(bunkerUrl: string): ParsedBunkerUrl {
  const trimmed = bunkerUrl.trim();

  if (!trimmed.toLowerCase().startsWith('bunker://')) {
    throw new Error('Invalid bunker URL: must start with bunker://');
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Invalid bunker URL');
  }

  const remoteSignerPubkey = url.hostname;

  if (!/^[a-fA-F0-9]{64}$/.test(remoteSignerPubkey)) {
    throw new Error('Invalid bunker URL: host must be 64-char hex remote-signer pubkey');
  }

  const relays = url.searchParams.getAll('relay').filter((r) => r.length > 0);
  const secret = url.searchParams.get('secret') ?? undefined;

  if (relays.length === 0) {
    throw new Error('Invalid bunker URL: at least one relay= is required');
  }

  return { remoteSignerPubkey, relays, secret };
}

function encryptRequest(
  method: string,
  params: string[],
  clientSecret: Uint8Array,
  remoteSignerPubkey: string,
): { encrypted: string; id: string } {
  const id = generateRandomHexString(16);
  const conversationKey = nip44.v2.utils.getConversationKey(clientSecret, remoteSignerPubkey);

  const encrypted = nip44.encrypt(JSON.stringify({ id, method, params }), conversationKey);

  return { encrypted, id };
}

/**
 * Establish a NIP-46 connection using a bunker URL from the remote signer.
 * Sends connect, then get_public_key; returns data suitable for persistence and BunkerProvider.
 */
export function connectBunker(bunkerUrl: string): Promise<BunkerSignerData> {
  const { remoteSignerPubkey, relays, secret } = parseBunkerUrl(bunkerUrl);
  const keyPair = createKeyPair();
  const clientSecret = keyPair.secret;
  const clientPubkey = keyPair.pubkey;

  const { encrypted: connectContent, id: connectId } = encryptRequest(
    'connect',
    [remoteSignerPubkey, secret ?? '', DEFAULT_PERMS],
    clientSecret,
    remoteSignerPubkey,
  );

  return new Promise((resolve, reject) => {
    const sub = pool.subscribe(
      relays,
      {
        kinds: [NIP46_KIND],
        authors: [remoteSignerPubkey],
        '#p': [clientPubkey],
        limit: 10,
      },
      {
        onevent: async (event) => {
          if (event.kind !== NIP46_KIND || event.pubkey !== remoteSignerPubkey) {
            return;
          }

          const decrypted = decryptContent(event.content, event.pubkey, clientSecret);

          if (!decrypted) {
            return;
          }

          let parsed: { id: string; result?: string; error?: string };

          try {
            parsed = JSON.parse(decrypted);
          } catch {
            return;
          }

          if (parsed.id !== connectId) {
            return;
          }

          if (parsed.error) {
            sub.close();
            reject(new Error(parsed.error));

            return;
          }

          const result = parsed.result ?? '';

          if (result === 'ack' || (secret !== undefined && result === secret)) {
            sub.close();

            try {
              const userPubkey = await requestGetPublicKey(
                clientPubkey,
                clientSecret,
                remoteSignerPubkey,
                relays,
              );

              resolve({
                relays,
                ephemeralSecret: bytesToHex(clientSecret),
                ephemeralPubkey: clientPubkey,
                remoteSignerPubkey,
                userPubkey,
              });
            } catch (err) {
              reject(err);
            }
          }
        },
      },
    );

    (async () => {
      try {
        const template = {
          kind: NIP46_KIND,
          pubkey: clientPubkey,
          content: connectContent,
          tags: [['p', remoteSignerPubkey]],
          created_at: Math.floor(Date.now() / 1000),
        };

        const signed = finalizeEvent(template, clientSecret);

        await Promise.allSettled(pool.publish(relays, signed));
      } catch (err) {
        sub.close();
        reject(err);
      }
    })();
  });
}

function requestGetPublicKey(
  clientPubkey: string,
  clientSecret: Uint8Array,
  remoteSignerPubkey: string,
  relays: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const { encrypted: content, id } = encryptRequest(
      'get_public_key',
      [],
      clientSecret,
      remoteSignerPubkey,
    );

    const template = {
      kind: NIP46_KIND,
      pubkey: clientPubkey,
      content,
      tags: [['p', remoteSignerPubkey]],
      created_at: Math.floor(Date.now() / 1000),
    };

    const event = finalizeEvent(template, clientSecret);

    const sub = pool.subscribe(
      relays,
      {
        kinds: [NIP46_KIND],
        authors: [remoteSignerPubkey],
        '#p': [clientPubkey],
        limit: 1,
      },
      {
        onevent: (ev) => {
          if (ev.kind !== NIP46_KIND || ev.pubkey !== remoteSignerPubkey) {
            return;
          }

          const decrypted = decryptContent(ev.content, ev.pubkey, clientSecret);

          if (!decrypted) {
            sub.close();
            reject(new Error('Failed to decrypt get_public_key response'));

            return;
          }

          let parsed: { id: string; result?: string; error?: string };

          try {
            parsed = JSON.parse(decrypted);
          } catch {
            sub.close();
            reject(new Error('Invalid get_public_key response'));

            return;
          }

          if (parsed.id !== id) {
            return;
          }

          if (parsed.error) {
            sub.close();
            reject(new Error(parsed.error));

            return;
          }

          const pubkey = parsed.result?.trim();

          if (!pubkey || !/^[a-fA-F0-9]{64}$/.test(pubkey)) {
            sub.close();
            reject(new Error('Invalid get_public_key result'));

            return;
          }

          sub.close();
          resolve(pubkey);
        },
      },
    );

    void Promise.allSettled(pool.publish(relays, event)).catch((err) => {
      sub.close();
      reject(err);
    });
  });
}

export class BunkerProvider implements NostrProvider {
  method = 'bunker' as const;

  private data: BunkerSignerData;

  constructor(data: BunkerSignerData) {
    this.data = data;
  }

  async isReady(): Promise<boolean> {
    return true;
  }

  async getPublicKey(): Promise<string | null> {
    return this.data.userPubkey;
  }

  async signEvent(params: SignEventParams): Promise<SignEventResult> {
    const id = generateRandomHexString(16);
    const ephemeralSecret = hexToBytes(this.data.ephemeralSecret);

    const conversationKey = nip44.v2.utils.getConversationKey(
      ephemeralSecret,
      this.data.remoteSignerPubkey,
    );

    const encryptedContent = nip44.encrypt(
      JSON.stringify({
        id,
        method: 'sign_event',
        params: [JSON.stringify(params.event)],
      }),
      conversationKey,
    );

    const template = {
      kind: NIP46_KIND,
      pubkey: this.data.ephemeralPubkey,
      content: encryptedContent,
      tags: [['p', this.data.remoteSignerPubkey]],
      created_at: Math.floor(Date.now() / 1000),
    };

    const signedEvent = finalizeEvent(template, ephemeralSecret);
    const relays = this.data.relays.filter((u) => u.trim().length > 0);

    if (relays.length === 0) {
      throw new Error('No relay configured for Bunker');
    }

    await Promise.allSettled(pool.publish(relays, signedEvent));

    return new Promise((resolve, reject) => {
      const sub = pool.subscribe(
        relays,
        {
          kinds: [NIP46_KIND],
          authors: [this.data.remoteSignerPubkey],
          '#p': [this.data.ephemeralPubkey],
          limit: 1,
        },
        {
          onevent: (event) => {
            if (event.kind !== NIP46_KIND || event.pubkey !== this.data.remoteSignerPubkey) {
              return;
            }

            const decrypted = decryptContent(event.content, event.pubkey, ephemeralSecret);

            if (!decrypted) {
              sub.close();
              reject(new Error('Failed to decrypt sign_event response'));

              return;
            }

            let parsed: { id: string; result?: string; error?: string };

            try {
              parsed = JSON.parse(decrypted);
            } catch (e) {
              sub.close();
              reject(e);

              return;
            }

            if (parsed.id !== id) {
              return;
            }

            if (parsed.error) {
              sub.close();
              reject(new Error(parsed.error));

              return;
            }

            try {
              const signed = JSON.parse(parsed.result ?? 'null') as SignEventResult['signedEvent'];

              sub.close();
              resolve({ signedEvent: signed, provider: this });
            } catch (e) {
              sub.close();
              reject(e);
            }
          },
        },
      );
    });
  }

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
  }

  dispose(): void {}
}

export function createBunkerProvider(data: BunkerSignerData): BunkerProvider {
  return new BunkerProvider(data);
}
