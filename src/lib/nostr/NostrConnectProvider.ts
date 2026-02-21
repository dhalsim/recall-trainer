import { bytesToHex, hexToBytes } from 'nostr-tools/utils';

import { logger } from '../../utils/logger';
import { assertUnreachable, createKeyPair } from '../../utils/nostr';

import { sendNip46Request } from './RemoteSignerHelpers';
import type {
  NostrConnectData,
  NostrProvider,
  ProviderCapability,
  SignEventParams,
  SignEventResult,
} from './types';

export type { NostrConnectData } from './types';
export { decryptContent } from './RemoteSignerHelpers';
const { log, error: logError } = logger();

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

  log(
    `[NostrConnectProvider] Generated nostrconnect URI. relays=${relays.length}, ephemeralPubkey=${keyPair.pubkey}`,
  );

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
    log(
      `[NostrConnectProvider] getPublicKey called. hasRemoteSigner=${Boolean(this.data.remoteSignerPubkey)}`,
    );

    return this.data.remoteSignerPubkey;
  }

  async signEvent(params: SignEventParams): Promise<SignEventResult> {
    log('[NostrConnectProvider] signEvent called.');

    if (!this.data.remoteSignerPubkey) {
      throw new Error('Remote signer pubkey not set');
    }

    const relays = this.data.relays.filter((u) => u.trim().length > 0);

    if (relays.length === 0) {
      throw new Error('No relay configured for Nostr Connect');
    }

    const ephemeralSecret = hexToBytes(this.data.ephemeralSecret);
    log(`[NostrConnectProvider] Sending sign_event request. relays=${relays.length}`);

    try {
      const response = await sendNip46Request({
        relays,
        ephemeralSecret,
        ephemeralPubkey: this.data.ephemeralPubkey,
        remoteSignerPubkey: this.data.remoteSignerPubkey,
        method: 'sign_event',
        params: [JSON.stringify(params.event)],
      });

      const signed = JSON.parse(response.result ?? 'null') as SignEventResult['signedEvent'];
      log('[NostrConnectProvider] sign_event response parsed successfully.');

      return { signedEvent: signed, provider: this };
    } catch (error) {
      logError('[NostrConnectProvider] sign_event request failed:', error);
      throw error;
    }
  }

  async nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
    log('[NostrConnectProvider] nip44Encrypt called.');

    if (!this.data.remoteSignerPubkey) {
      throw new Error('Remote signer pubkey not set');
    }

    const relays = this.data.relays.filter((u) => u.trim().length > 0);

    if (relays.length === 0) {
      throw new Error('No relay configured for Nostr Connect');
    }

    const ephemeralSecret = hexToBytes(this.data.ephemeralSecret);
    log(`[NostrConnectProvider] Sending nip44_encrypt request. relays=${relays.length}`);

    try {
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

      log('[NostrConnectProvider] nip44_encrypt response received.');

      return response.result;
    } catch (error) {
      logError('[NostrConnectProvider] nip44_encrypt request failed:', error);
      throw error;
    }
  }

  async nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    log('[NostrConnectProvider] nip44Decrypt called.');

    if (!this.data.remoteSignerPubkey) {
      throw new Error('Remote signer pubkey not set');
    }

    const relays = this.data.relays.filter((u) => u.trim().length > 0);

    if (relays.length === 0) {
      throw new Error('No relay configured for Nostr Connect');
    }

    const ephemeralSecret = hexToBytes(this.data.ephemeralSecret);
    log(`[NostrConnectProvider] Sending nip44_decrypt request. relays=${relays.length}`);

    try {
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

      log('[NostrConnectProvider] nip44_decrypt response received.');

      return response.result;
    } catch (error) {
      logError('[NostrConnectProvider] nip44_decrypt request failed:', error);
      throw error;
    }
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

export function createNostrConnectProvider(data: NostrConnectData): NostrConnectProvider {
  return new NostrConnectProvider(data);
}
