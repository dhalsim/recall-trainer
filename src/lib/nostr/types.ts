import type { EventTemplate, NostrEvent } from 'nostr-tools';

export type NostrProviderMethod = 'nostrconnect' | 'nip55' | 'passkey_signer' | 'password_signer';

export type ProviderCapability = 'getRelays' | 'signEvent' | 'getPublicKey';

export type SignEventParams = {
  event: EventTemplate;
  reason: string;
};

export type SignEventResult = { signedEvent: NostrEvent; provider: NostrProvider };

export type SignEvent = (params: SignEventParams) => Promise<SignEventResult>;

export type GetPublicKeyParams = { reason: string };

export type GetPublicKey = (params: GetPublicKeyParams) => Promise<string | null>;

export interface NostrProvider {
  method: NostrProviderMethod;
  isReady(): Promise<boolean>;
  getPublicKey: GetPublicKey;
  signEvent: SignEvent;
  hasCapability(cap: ProviderCapability): boolean;
  getRelays?(): Promise<unknown>;
  dispose?(): void;
}

export interface NostrConnectData {
  relay: string;
  uri: string;
  ephemeralSecret: string;
  ephemeralPubkey: string;
  timestamp: number;
  connectionSecret: string;
  remoteSignerPubkey: string | null;
}

/** Persisted data for NIP-55 Android Signer (nostrsigner: intent). */
export interface Nip55SignerData {
  pubkey: string;
}

/** Persisted data for Passkey Signer (WebAuthn PRF + NIP-49). */
export interface PasskeySignerData {
  ncryptsec: string;
  credentialId: string;
  salt: string;
}

/** Persisted data for Password Signer (NIP-49). Only ncryptsec is stored; raw key never persisted. */
export interface PasswordSignerData {
  ncryptsec: string;
}

export type LoginResult =
  | { success: true; provider: NostrProvider }
  | { success: false; provider: null };

export type AuthIntent = 'log_in' | 'read_pubkey' | 'sign_event';

/** Persisted auth state (e.g. in store). */
export type AuthLoginState = {
  method: NostrProviderMethod;
  loggedIn: boolean;
  data?: NostrConnectData | Nip55SignerData | PasskeySignerData | PasswordSignerData;
};

export type EventItem = NostrEvent & {
  relays: string[];
};
