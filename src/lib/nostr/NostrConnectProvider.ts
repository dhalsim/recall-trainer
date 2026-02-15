import { finalizeEvent, nip04, nip44 } from 'nostr-tools';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';

import { assertUnreachable, createKeyPair, generateRandomHexString, pool } from '../../utils/nostr';

import type {
  NostrConnectData,
  NostrProvider,
  ProviderCapability,
  SignEventParams,
  SignEventResult,
} from './types';

export type { NostrConnectData } from './types';

function generateRandomSecret(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

export function generateNostrConnectUri(relays: string[]): {
  uri: string;
  ephemeralData: NostrConnectData;
} {
  const keyPair = createKeyPair();
  const connectionSecret = generateRandomSecret();

  const params = new URLSearchParams({
    secret: connectionSecret,
    perms: 'sign_event,get_public_key',
    name: 'Recall Trainer',
    url: typeof window !== 'undefined' ? window.location.origin : '',
  });

  relays.forEach((r) => params.append('relay', r));

  const uri = `nostrconnect://${keyPair.pubkey}?${params.toString()}`;

  const ephemeralData: NostrConnectData = {
    relays,
    uri,
    ephemeralSecret: bytesToHex(keyPair.secret),
    ephemeralPubkey: keyPair.pubkey,
    timestamp: Math.floor(Date.now() / 1000),
    connectionSecret,
    remoteSignerPubkey: null,
  };

  return { uri, ephemeralData };
}

export function decryptContent(
  content: string,
  pubkey: string,
  ephemeralSecretBytes: Uint8Array,
): string | null {
  try {
    if (content.includes('?iv=')) {
      return nip04.decrypt(ephemeralSecretBytes, pubkey, content);
    }

    const conversationKey = nip44.v2.utils.getConversationKey(ephemeralSecretBytes, pubkey);

    return nip44.decrypt(content, conversationKey);
  } catch (error) {
    console.error('Failed to decrypt content:', error);

    return null;
  }
}

export class NostrConnectProvider implements NostrProvider {
  method = 'nostrconnect' as const;

  private data: NostrConnectData;

  constructor(data: NostrConnectData) {
    this.data = data;
  }

  async isReady(): Promise<boolean> {
    return true;
  }

  async getPublicKey(): Promise<string | null> {
    return this.data.remoteSignerPubkey;
  }

  async signEvent(params: SignEventParams): Promise<SignEventResult> {
    const id = generateRandomHexString(16);
    const ephemeralSecret = hexToBytes(this.data.ephemeralSecret);

    if (!this.data.remoteSignerPubkey) {
      throw new Error('Remote signer pubkey not set');
    }

    let encryptedContent: string;

    try {
      const conversationKey = nip44.v2.utils.getConversationKey(
        ephemeralSecret,
        this.data.remoteSignerPubkey,
      );

      encryptedContent = nip44.encrypt(
        JSON.stringify({
          id,
          method: 'sign_event',
          params: [JSON.stringify(params.event)],
        }),
        conversationKey,
      );
    } catch (error) {
      console.error('Failed to encrypt content:', error);

      throw error;
    }

    const eventTemplateForSigning = {
      kind: 24133,
      pubkey: this.data.ephemeralPubkey,
      content: encryptedContent,
      tags: [['p', this.data.remoteSignerPubkey]],
      created_at: Math.floor(Date.now() / 1000),
    };

    const signedEvent = finalizeEvent(eventTemplateForSigning, ephemeralSecret);
    const relays = this.data.relays.filter((u) => u.trim().length > 0);

    if (relays.length === 0) {
      throw new Error('No relay configured for Nostr Connect');
    }

    await Promise.allSettled(pool.publish(relays, signedEvent));

    return new Promise((resolve, reject) => {
      const sub = pool.subscribe(
        relays,
        {
          kinds: [24133],
          authors: [this.data.remoteSignerPubkey as string],
          '#p': [this.data.ephemeralPubkey],
          limit: 1,
        },
        {
          onevent: (event) => {
            if (event.kind !== 24133 || event.pubkey !== this.data.remoteSignerPubkey) {
              return;
            }

            const decrypted = decryptContent(event.content, event.pubkey, ephemeralSecret);

            if (!decrypted) {
              sub.close();
              reject(new Error('Failed to decrypt content'));

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

export function createNostrConnectProvider(data: NostrConnectData): NostrConnectProvider {
  return new NostrConnectProvider(data);
}
