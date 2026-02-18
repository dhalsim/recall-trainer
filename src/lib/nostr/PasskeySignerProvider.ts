import { finalizeEvent, getPublicKey, nip44 } from 'nostr-tools';
import { decrypt as nip49Decrypt, encrypt as nip49Encrypt } from 'nostr-tools/nip49';

import { assertUnreachable } from '../../utils/nostr';
import { createKeyPair } from '../../utils/nostr';

import type {
  PasskeySignerData,
  ProviderCapability,
  SignEventParams,
  SignEventResult,
} from './types';
import type { NostrProvider } from './types';

export type { PasskeySignerData } from './types';

const PASSKEY_SALT = 'recall-trainer-nostr-key-v1';

/** Encode 32-byte PRF output to a string usable as NIP-49 password (deterministic). */
function prfBytesToPassword(prfOutput: ArrayBuffer): string {
  const bytes = new Uint8Array(prfOutput);
  let binary = '';

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Base64url encode rawId for storage. */
function credentialIdToBase64url(rawId: ArrayBuffer): string {
  const bytes = new Uint8Array(rawId);
  let binary = '';

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Base64url decode to Uint8Array for allowCredentials[].id. */
function base64urlToCredentialId(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');

  switch (base64.length % 4) {
    case 2:
      base64 += '==';
      break;
    case 3:
      base64 += '=';
      break;
    default:
      break;
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

/**
 * Best-effort check for passkey support (platform authenticator available).
 * PRF support is only confirmed when create/get succeeds; unsupported authenticators
 * will fail at createPasskeyCredentials() with a clear error.
 */
export async function isPasskeySupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return false;
  }

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export interface CreatePasskeyCredentialsResult {
  credentialId: string;
  ncryptsec: string;
  salt: string;
}

/**
 * Create a new passkey and encrypt a new Nostr key with the PRF output.
 * User is prompted for biometric / security key once.
 */
export async function createPasskeyCredentials(): Promise<CreatePasskeyCredentialsResult> {
  const keyPair = createKeyPair();
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: {
        name: 'Recall Trainer',
        id: typeof window !== 'undefined' ? window.location.hostname : undefined,
      },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: 'nostr-key@recall-trainer',
        displayName: 'Nostr key',
      },
      challenge,
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      timeout: 60000,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
      extensions: {
        prf: {
          eval: {
            first: new TextEncoder().encode(PASSKEY_SALT),
          },
        },
      },
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Passkey creation was cancelled or failed');
  }

  const extResults = credential.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } };
  };

  const prfFirst = extResults?.prf?.results?.first;

  if (!prfFirst) {
    throw new Error('PRF extension not supported by this authenticator');
  }

  const password = prfBytesToPassword(prfFirst);
  const ncryptsec = nip49Encrypt(keyPair.secret, password);
  keyPair.secret.fill(0);

  const rawId = credential.rawId;
  const credentialId = credentialIdToBase64url(rawId);

  return {
    credentialId,
    ncryptsec,
    salt: PASSKEY_SALT,
  };
}

/** Get PRF output via credentials.get (for unlock / sign). */
async function getPrfOutput(credentialId: string, salt: string): Promise<string> {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  const idBytes = base64urlToCredentialId(credentialId);

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge,
      timeout: 60000,
      allowCredentials: [
        {
          id: idBytes as unknown as BufferSource,
          type: 'public-key',
        },
      ],
      userVerification: 'required',
      extensions: {
        prf: {
          eval: {
            first: new TextEncoder().encode(salt),
          },
        },
      },
    },
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error('Passkey assertion was cancelled or failed');
  }

  const extResults = assertion.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } };
  };

  const prfFirst = extResults?.prf?.results?.first;

  if (!prfFirst) {
    throw new Error('PRF result not returned');
  }

  return prfBytesToPassword(prfFirst);
}

export function createPasskeySigner(data: PasskeySignerData): NostrProvider {
  let key: Uint8Array | null = null;
  let cachedPubkey: string | null = null;

  const lock = (): void => {
    if (key) {
      key.fill(0);
      key = null;
    }
  };

  const unlock = async (): Promise<Uint8Array> => {
    if (key) {
      return key;
    }

    const password = await getPrfOutput(data.credentialId, data.salt);
    key = nip49Decrypt(data.ncryptsec, password);

    if (cachedPubkey === null) {
      cachedPubkey = getPublicKey(key);
    }

    return key;
  };

  const provider: NostrProvider = {
    method: 'passkey_signer',
    async isReady(): Promise<boolean> {
      return true;
    },
    async getPublicKey(): Promise<string | null> {
      if (cachedPubkey) {
        return cachedPubkey;
      }

      try {
        const k = await unlock();
        const pubkey = getPublicKey(k);
        cachedPubkey = pubkey;
        lock();

        return pubkey;
      } catch {
        lock();

        return null;
      }
    },
    async signEvent(params: SignEventParams): Promise<SignEventResult> {
      const k = await unlock();
      try {
        const signedEvent = finalizeEvent(params.event, k);

        return { signedEvent, provider };
      } finally {
        lock();
      }
    },
    async nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
      const k = await unlock();
      try {
        const conversationKey = nip44.v2.utils.getConversationKey(k, pubkey);

        return nip44.encrypt(plaintext, conversationKey);
      } finally {
        lock();
      }
    },
    async nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
      const k = await unlock();
      try {
        const conversationKey = nip44.v2.utils.getConversationKey(k, pubkey);

        return nip44.decrypt(ciphertext, conversationKey);
      } finally {
        lock();
      }
    },
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
    },
    dispose(): void {
      lock();
    },
  };

  return provider;
}
