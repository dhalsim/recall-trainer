/**
 * NIP-46 Bunker (remote signer) provider.
 * Direct connection initiated by client: user pastes bunker:// URL from remote signer,
 * client sends connect request then get_public_key. See https://nips.nostr.com/46
 */

import { finalizeEvent } from 'nostr-tools';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';

import { logger } from '../../utils/logger';
import { assertUnreachable, createKeyPair, pool } from '../../utils/nostr';

import {
  decryptContent,
  encryptRequest,
  NIP46_KIND,
  sendNip46Request,
} from './RemoteSignerHelpers';
import type {
  BunkerSignerData,
  NostrProvider,
  ProviderCapability,
  SignEventParams,
  SignEventResult,
} from './types';

export type { BunkerSignerData };
const DEFAULT_PERMS = 'sign_event,get_public_key';
const { error: logError } = logger();

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
          } catch (err) {
            logError('[BunkerProvider] Invalid connect response JSON:', err);

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

async function requestGetPublicKey(
  clientPubkey: string,
  clientSecret: Uint8Array,
  remoteSignerPubkey: string,
  relays: string[],
): Promise<string> {
  const response = await sendNip46Request({
    relays,
    ephemeralSecret: clientSecret,
    ephemeralPubkey: clientPubkey,
    remoteSignerPubkey,
    method: 'get_public_key',
    params: [],
  });

  const pubkey = response.result?.trim();

  if (!pubkey || !/^[a-fA-F0-9]{64}$/.test(pubkey)) {
    throw new Error('Invalid get_public_key result');
  }

  return pubkey;
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
    const relays = this.data.relays.filter((u) => u.trim().length > 0);

    if (relays.length === 0) {
      throw new Error('No relay configured for Bunker');
    }

    const ephemeralSecret = hexToBytes(this.data.ephemeralSecret);

    const response = await sendNip46Request({
      relays,
      ephemeralSecret,
      ephemeralPubkey: this.data.ephemeralPubkey,
      remoteSignerPubkey: this.data.remoteSignerPubkey,
      method: 'sign_event',
      params: [JSON.stringify(params.event)],
    });

    const signed = JSON.parse(response.result ?? 'null') as SignEventResult['signedEvent'];

    return { signedEvent: signed, provider: this };
  }

  async nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
    const relays = this.data.relays.filter((u) => u.trim().length > 0);

    if (relays.length === 0) {
      throw new Error('No relay configured for Bunker');
    }

    const ephemeralSecret = hexToBytes(this.data.ephemeralSecret);

    const response = await sendNip46Request({
      relays,
      ephemeralSecret,
      ephemeralPubkey: this.data.ephemeralPubkey,
      remoteSignerPubkey: this.data.remoteSignerPubkey,
      method: 'nip44_encrypt',
      params: [pubkey, plaintext],
    });

    if (response.result === undefined) {
      throw new Error('nip44_encrypt returned no result');
    }

    return response.result;
  }

  async nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    const relays = this.data.relays.filter((u) => u.trim().length > 0);

    if (relays.length === 0) {
      throw new Error('No relay configured for Bunker');
    }

    const ephemeralSecret = hexToBytes(this.data.ephemeralSecret);

    const response = await sendNip46Request({
      relays,
      ephemeralSecret,
      ephemeralPubkey: this.data.ephemeralPubkey,
      remoteSignerPubkey: this.data.remoteSignerPubkey,
      method: 'nip44_decrypt',
      params: [pubkey, ciphertext],
    });

    if (response.result === undefined) {
      throw new Error('nip44_decrypt returned no result');
    }

    return response.result;
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

export function createBunkerProvider(data: BunkerSignerData): BunkerProvider {
  return new BunkerProvider(data);
}
