/* eslint-disable solid/no-innerhtml -- QR code SVG from qrcode library (our-generated URI only) */
import { nip19 } from 'nostr-tools';
import { hexToBytes } from 'nostr-tools/utils';
import qrcode from 'qrcode';
import { createEffect, For, onCleanup, onMount, Show } from 'solid-js';
import { createSignal } from 'solid-js';

import { useNostrAuth } from '../contexts/NostrAuthContext';
import { t } from '../i18n';
import {
  ensureNip55ClipboardReadAccess,
  isNip55ClipboardAccessGranted,
} from '../lib/nostr/nip55ClipboardFlow';
import { isNip07Available } from '../lib/nostr/Nip07Provider';
import { startNip55GetPublicKeyFlow } from '../lib/nostr/Nip55Provider';
import {
  decryptContent,
  generateNostrConnectUri,
  type NostrConnectData,
} from '../lib/nostr/NostrConnectProvider';
import { createPasskeyCredentials, isPasskeySupported } from '../lib/nostr/PasskeySignerProvider';
import { createPasswordProtectedKeypair } from '../lib/nostr/PasswordSignerProvider';
import { store } from '../store';
import { logger } from '../utils/logger';
import { DEFAULT_WRITE_RELAYS, pool } from '../utils/nostr';

import type { ConnectStep } from './NostrConnectModal';

interface NostrConnectAuthProps {
  flow?: ConnectStep;
  onSuccess: (result: {
    success: true;
    provider: import('../lib/nostr/types').NostrProvider;
  }) => void;
  onError: (error: string) => void;
}
const { log, error: logError } = logger();

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /Android/i.test(navigator.userAgent);
}

function showPasskeyCreate(flow: ConnectStep | undefined): boolean {
  return !flow || flow === 'flow_passkey_create';
}

function showPasskeyLogin(flow: ConnectStep | undefined): boolean {
  return !flow || flow === 'flow_passkey_login';
}

function showAndroid(flow: ConnectStep | undefined): boolean {
  return !flow || flow === 'flow_amber_login';
}

function showNostrConnect(flow: ConnectStep | undefined): boolean {
  return !flow || flow === 'flow_nostr_connect';
}

function showExtensionLogin(flow: ConnectStep | undefined): boolean {
  return flow === 'flow_extension_login';
}

function showBunker(flow: ConnectStep | undefined): boolean {
  return flow === 'flow_bunker_login';
}

function showPasswordCreate(flow: ConnectStep | undefined): boolean {
  return flow === 'flow_password_create';
}

function showPasswordLogin(flow: ConnectStep | undefined): boolean {
  return flow === 'flow_password_login';
}

export function NostrConnectAuth(props: NostrConnectAuthProps) {
  const flow = (): ConnectStep | undefined => props.flow;
  const auth = useNostrAuth();

  const {
    loginWithBunker,
    loginWithNip55,
    loginWithNostrConnect,
    loginWithNip07,
    loginWithPasskey,
    loginWithPasswordSigner,
    getPublicKey,
  } = auth;

  const authState = () => store.state().authLoginState;
  const [generatedUri, setGeneratedUri] = createSignal('');
  const [qrSvg, setQrSvg] = createSignal('');
  const [isQrLoading, setIsQrLoading] = createSignal(false);
  const [relays, setRelays] = createSignal<string[]>([...DEFAULT_WRITE_RELAYS]);
  const [isWaitingForConnection, setIsWaitingForConnection] = createSignal(false);
  const [showRelayInput, setShowRelayInput] = createSignal(false);
  const [showCopied, setShowCopied] = createSignal(false);
  const [isTyping, setIsTyping] = createSignal(false);
  const [passkeySupported, setPasskeySupported] = createSignal(false);
  const [passkeyLoading, setPasskeyLoading] = createSignal(false);
  const [passwordCreateLoading, setPasswordCreateLoading] = createSignal(false);
  const [passwordLoginLoading, setPasswordLoginLoading] = createSignal(false);
  const [passwordCreatePassword, setPasswordCreatePassword] = createSignal('');
  const [passwordCreateConfirm, setPasswordCreateConfirm] = createSignal('');
  const [passwordLoginNcryptsec, setPasswordLoginNcryptsec] = createSignal('');
  const [passwordLoginPassword, setPasswordLoginPassword] = createSignal('');
  const [bunkerUrl, setBunkerUrl] = createSignal('');
  const [bunkerLoading, setBunkerLoading] = createSignal(false);
  const [nip55Waiting, setNip55Waiting] = createSignal(false);
  const [nip55TimedOut, setNip55TimedOut] = createSignal(false);
  const [nip55ManualResult, setNip55ManualResult] = createSignal('');
  const [nip55ManualLoading, setNip55ManualLoading] = createSignal(false);

  const [nip55TimeoutId, setNip55TimeoutId] = createSignal<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [currentSubscription, setCurrentSubscription] = createSignal<{ close: () => void } | null>(
    null,
  );

  async function generateQrSvg(uri: string) {
    setIsQrLoading(true);
    try {
      const svg = await qrcode.toString(uri, {
        type: 'svg',
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      });

      setQrSvg(svg);
    } catch (error) {
      logError('Failed to generate QR code:', error);
      props.onError(t('Login failed'));
    } finally {
      setIsQrLoading(false);
    }
  }

  function startSubscription(ephemeralData: NostrConnectData) {
    const relayList = ephemeralData.relays.filter((u) => u.trim().length > 0);

    log(
      `[NostrConnectAuth] startSubscription called. relays=${relayList.length}, ephemeralPubkey=${ephemeralData.ephemeralPubkey}`,
    );

    if (relayList.length === 0) {
      log('[NostrConnectAuth] startSubscription aborted: no relay provided.');

      return;
    }

    const sub = pool.subscribe(
      relayList,
      {
        kinds: [24133],
        '#p': [ephemeralData.ephemeralPubkey],
        since: ephemeralData.timestamp,
        limit: 1,
      },
      {
        onevent(evt) {
          log(
            `[NostrConnectAuth] connect response event received. kind=${evt.kind}, pubkey=${evt.pubkey}`,
          );

          const ephemeralSecret = hexToBytes(ephemeralData.ephemeralSecret);

          const decrypted = decryptContent(evt.content, evt.pubkey, ephemeralSecret);

          if (!decrypted) {
            log('[NostrConnectAuth] decryptContent returned null.');
            props.onError(t('Encryption format not recognized'));

            return;
          }

          let responseData: { id?: string; result?: string; error?: string };

          try {
            responseData = JSON.parse(decrypted);
          } catch (error) {
            logError('[NostrConnectAuth] Invalid connect response JSON:', error);
            props.onError(t('Invalid response format'));

            return;
          }

          const responseSecret = responseData.result;

          if (responseSecret !== ephemeralData.connectionSecret) {
            log('[NostrConnectAuth] connection secret mismatch.');
            props.onError(t('Connection secret mismatch'));

            return;
          }

          ephemeralData.remoteSignerPubkey = evt.pubkey;
          log(`[NostrConnectAuth] remote signer connected. pubkey=${evt.pubkey}`);

          /* eslint-disable-next-line solid/reactivity -- async relay callback; state updates on result */
          void loginWithNostrConnect(ephemeralData).then((result) => {
            if (result.success) {
              log('[NostrConnectAuth] loginWithNostrConnect succeeded.');
              setCurrentSubscription(null);
              sub.close();
              props.onSuccess(result);
            } else {
              log('[NostrConnectAuth] loginWithNostrConnect returned success=false.');
              props.onError(t('Login failed'));
            }
          });
        },
      },
    );

    setCurrentSubscription(sub);
  }

  async function refresh() {
    log('[NostrConnectAuth] refresh called.');
    const currentSub = currentSubscription();

    if (currentSub) {
      log('[NostrConnectAuth] closing previous subscription before refresh.');
      currentSub.close();
      setCurrentSubscription(null);
    }

    setIsTyping(false);
    const relayList = relays().filter((u) => u.trim().length > 0);
    log(`[NostrConnectAuth] refresh relay count=${relayList.length}.`);

    if (relayList.length === 0) {
      setRelays([...DEFAULT_WRITE_RELAYS]);
      props.onError(t('Add at least one relay URL'));
      log('[NostrConnectAuth] refresh aborted: no relay after filtering.');

      return;
    }

    const { uri, ephemeralData } = generateNostrConnectUri(relayList);

    setGeneratedUri(uri);
    log('[NostrConnectAuth] URI generated; starting QR generation.');
    setIsWaitingForConnection(true);
    props.onError('');
    await generateQrSvg(uri);
    log('[NostrConnectAuth] QR ready; starting subscription.');
    startSubscription(ephemeralData);
  }

  function setRelayAt(index: number, value: string) {
    setRelays((prev) => {
      const next = [...prev];
      next[index] = value;

      return next;
    });

    markRelaysChanged();
  }

  function removeRelay(index: number) {
    setRelays((prev) => {
      if (prev.length <= 1) {
        return prev;
      }

      const next = prev.filter((_, i) => i !== index);

      return next;
    });

    markRelaysChanged();
  }

  function addRelay() {
    setRelays((prev) => [...prev, '']);
    setIsTyping(true);
    setQrSvg('');
    setIsWaitingForConnection(false);
    const sub = currentSubscription();

    if (sub) {
      sub.close();
      setCurrentSubscription(null);
    }
  }

  function markRelaysChanged() {
    setIsTyping(true);
    setQrSvg('');
    setIsWaitingForConnection(false);
    const sub = currentSubscription();

    if (sub) {
      sub.close();
      setCurrentSubscription(null);
    }
  }

  function handleRelayInput(index: number, value: string) {
    setRelayAt(index, value);
  }

  async function copyUri() {
    const uri = generatedUri();

    if (!uri) {
      return;
    }

    try {
      await navigator.clipboard.writeText(uri);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (error) {
      logError('Failed to copy URI:', error);
      props.onError(t('Login failed'));
    }
  }

  function openAndroidSigner() {
    log('[NostrConnectAuth] Starting NIP-55 get_public_key flow (Android signer).');
    setNip55Waiting(true);
    setNip55TimedOut(false);
    props.onError('');
    const existingTimeout = nip55TimeoutId();

    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeoutId = setTimeout(() => {
      if (!nip55Waiting()) {
        return;
      }

      setNip55TimedOut(true);
      log('[NostrConnectAuth] NIP-55 get_public_key timed out.');
      props.onError(t('NIP-55 login timed out. Return from signer and try again.'));
    }, 60_000);

    setNip55TimeoutId(timeoutId);
    startNip55GetPublicKeyFlow();
  }

  function normalizeNip55ManualPubkey(raw: string): string | null {
    const trimmed = raw.trim();

    if (!trimmed) {
      return null;
    }

    if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }

    if (trimmed.startsWith('npub')) {
      try {
        const decoded = nip19.decode(trimmed);

        if (decoded.type === 'npub' && typeof decoded.data === 'string') {
          return decoded.data.toLowerCase();
        }
      } catch (error) {
        logError('[NostrConnectAuth] Failed to decode manual npub result:', error);
      }
    }

    return null;
  }

  async function submitManualNip55Result(): Promise<void> {
    const normalizedPubkey = normalizeNip55ManualPubkey(nip55ManualResult());

    if (!normalizedPubkey) {
      props.onError(t('Invalid signer result. Paste a valid hex pubkey or npub.'));

      return;
    }

    setNip55ManualLoading(true);
    props.onError('');

    try {
      const result = await loginWithNip55({ pubkey: normalizedPubkey });

      if (result.success) {
        setNip55Waiting(false);
        setNip55TimedOut(false);
        const timeoutId = nip55TimeoutId();

        if (timeoutId) {
          clearTimeout(timeoutId);
          setNip55TimeoutId(null);
        }

        props.onSuccess(result);
      } else {
        props.onError(t('Login failed'));
      }
    } catch (error) {
      logError('[NostrConnectAuth] Manual NIP-55 login failed:', error);
      props.onError(error instanceof Error ? error.message : t('Login failed'));
    } finally {
      setNip55ManualLoading(false);
    }
  }

  async function askForClipboardAccess(): Promise<void> {
    const granted = await ensureNip55ClipboardReadAccess();

    if (granted) {
      props.onError('');
      log('[NostrConnectAuth] Clipboard access granted by user gesture.');

      return;
    }

    props.onError(t('Clipboard access request was denied.'));
  }

  onMount(() => {
    const f = flow();
    log(`[NostrConnectAuth] onMount flow=${String(f)}`);

    if (showNostrConnect(f)) {
      log('[NostrConnectAuth] onMount will call refresh() for Nostr Connect flow.');
      void refresh();
    } else {
      log('[NostrConnectAuth] onMount skipped refresh() because flow is not Nostr Connect.');
    }

    if (showPasskeyCreate(f) || showPasskeyLogin(f)) {
      void isPasskeySupported().then(setPasskeySupported);
    }
  });

  createEffect(() => {
    const method = authState()?.method;

    if (!nip55Waiting() || method !== 'nip55') {
      return;
    }

    log('[NostrConnectAuth] NIP-55 login completed; stopping waiting state.');
    setNip55Waiting(false);
    setNip55TimedOut(false);
    const timeoutId = nip55TimeoutId();

    if (timeoutId) {
      clearTimeout(timeoutId);
      setNip55TimeoutId(null);
    }
  });

  async function handleSetUpPasskey() {
    setPasskeyLoading(true);
    props.onError('');

    try {
      const result = await createPasskeyCredentials();
      const loginResult = await loginWithPasskey(result);

      if (loginResult.success) {
        props.onSuccess(loginResult);
      } else {
        props.onError(t('Login failed'));
      }
    } catch (error) {
      logError('Passkey setup failed:', error);

      props.onError(error instanceof Error ? error.message : t('Login failed'));
    } finally {
      setPasskeyLoading(false);
    }
  }

  onCleanup(() => {
    const sub = currentSubscription();

    if (sub) {
      sub.close();
    }

    const timeoutId = nip55TimeoutId();

    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });

  async function handlePasswordCreate() {
    const password = passwordCreatePassword().trim();
    const confirm = passwordCreateConfirm().trim();

    if (!password || password !== confirm) {
      props.onError(t('Passwords do not match.'));

      return;
    }

    setPasswordCreateLoading(true);
    props.onError('');

    try {
      const data = createPasswordProtectedKeypair(password);
      const loginResult = await loginWithPasswordSigner(data, password);

      if (loginResult.success) {
        props.onSuccess(loginResult);
      } else {
        props.onError(t('Login failed'));
      }
    } catch (error) {
      logError('Password create failed:', error);
      props.onError(error instanceof Error ? error.message : t('Login failed'));
    } finally {
      setPasswordCreateLoading(false);
    }
  }

  async function handlePasswordLogin() {
    const ncryptsec = passwordLoginNcryptsec().trim();
    const password = passwordLoginPassword();

    if (!ncryptsec || !password) {
      props.onError(t('Enter your ncryptsec and password.'));

      return;
    }

    setPasswordLoginLoading(true);
    props.onError('');

    try {
      const data = { ncryptsec };
      const loginResult = await loginWithPasswordSigner(data, password);

      if (loginResult.success) {
        props.onSuccess(loginResult);
      } else {
        props.onError(t('Login failed'));
      }
    } catch (error) {
      logError('Password login failed:', error);
      props.onError(error instanceof Error ? error.message : t('Login failed'));
    } finally {
      setPasswordLoginLoading(false);
    }
  }

  return (
    <div class="space-y-4 max-h-[70vh] overflow-y-auto">
      <div class="space-y-4">
        <Show when={showPasskeyCreate(flow()) && passkeySupported()}>
          <div class="flex flex-col gap-2">
            <p class="text-center text-sm text-slate-600">
              {t('Use your device passkey (Face ID, Touch ID, or security key) to sign in.')}
            </p>
            <button
              type="button"
              disabled={passkeyLoading()}
              onClick={() => void handleSetUpPasskey()}
              class="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 shadow-sm transition-colors hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50"
            >
              <Show when={passkeyLoading()} fallback={t('Set up Passkey')}>
                <span class="h-4 w-4 animate-spin rounded-full border-2 border-b-emerald-600" />
                <span>{t('Set up Passkey')}</span>
              </Show>
            </button>
          </div>
        </Show>

        <Show when={showPasskeyLogin(flow())}>
          <div class="flex flex-col gap-2">
            <Show
              when={authState()?.method === 'passkey_signer'}
              fallback={
                <p class="text-center text-sm text-slate-600">
                  {t('Set up a passkey first')} ({t('New User')} →{' '}
                  {t('Create Passkey Protected Keypair')})
                </p>
              }
            >
              <p class="text-center text-sm text-slate-600">{t("You're signed in with passkey")}</p>
              <button
                type="button"
                disabled={passkeyLoading()}
                onClick={async () => {
                  setPasskeyLoading(true);
                  props.onError('');
                  try {
                    const pubkey = await getPublicKey({
                      reason: t('Get public key for passkey verification'),
                    });

                    const p = auth.provider;

                    if (pubkey && p) {
                      props.onSuccess({ success: true, provider: p });
                    } else {
                      props.onError(t('Login failed'));
                    }
                  } catch (error) {
                    logError('[NostrConnectAuth] Passkey verification failed:', error);
                    props.onError(t('Login failed'));
                  } finally {
                    setPasskeyLoading(false);
                  }
                }}
                class="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800"
              >
                {t('Verify passkey')}
              </button>
            </Show>
          </div>
        </Show>

        <Show when={showPasswordCreate(flow())}>
          <div class="flex flex-col gap-3">
            <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t('Password backup warning')}
            </p>
            <div class="space-y-2">
              <label
                for="password-create-password"
                class="block text-sm font-medium text-slate-700"
              >
                {t('Password')}
              </label>
              <input
                id="password-create-password"
                type="password"
                value={passwordCreatePassword()}
                onInput={(e) => setPasswordCreatePassword(e.currentTarget.value)}
                class="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                autocomplete="new-password"
              />
            </div>
            <div class="space-y-2">
              <label for="password-create-confirm" class="block text-sm font-medium text-slate-700">
                {t('Confirm password')}
              </label>
              <input
                id="password-create-confirm"
                type="password"
                value={passwordCreateConfirm()}
                onInput={(e) => setPasswordCreateConfirm(e.currentTarget.value)}
                class="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                autocomplete="new-password"
              />
            </div>
            <button
              type="button"
              disabled={passwordCreateLoading()}
              onClick={() => void handlePasswordCreate()}
              class="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <Show when={passwordCreateLoading()} fallback={t('Create keypair')}>
                <span class="h-4 w-4 animate-spin rounded-full border-2 border-b-white" />
              </Show>
            </button>
          </div>
        </Show>

        <Show when={showPasswordLogin(flow())}>
          <div class="flex flex-col gap-3">
            <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t('Password backup warning')}
            </p>
            <div class="space-y-2">
              <label
                for="password-login-ncryptsec"
                class="block text-sm font-medium text-slate-700"
              >
                {t('Paste ncryptsec')}
              </label>
              <textarea
                id="password-login-ncryptsec"
                value={passwordLoginNcryptsec()}
                onInput={(e) => setPasswordLoginNcryptsec(e.currentTarget.value)}
                rows={3}
                placeholder="ncryptsec1..."
                class="block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900"
              />
            </div>
            <div class="space-y-2">
              <label for="password-login-password" class="block text-sm font-medium text-slate-700">
                {t('Password')}
              </label>
              <input
                id="password-login-password"
                type="password"
                value={passwordLoginPassword()}
                onInput={(e) => setPasswordLoginPassword(e.currentTarget.value)}
                class="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                autocomplete="current-password"
              />
            </div>
            <button
              type="button"
              disabled={passwordLoginLoading()}
              onClick={() => void handlePasswordLogin()}
              class="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <Show when={passwordLoginLoading()} fallback={t('Unlock')}>
                <span class="h-4 w-4 animate-spin rounded-full border-2 border-b-white" />
              </Show>
            </button>
          </div>
        </Show>

        <Show when={showExtensionLogin(flow())}>
          <div class="flex flex-col gap-2">
            <Show
              when={isNip07Available()}
              fallback={
                <p class="text-center text-sm text-slate-600">
                  {t('Install a Nostr browser extension (e.g. Quetta) to sign in with NIP-07.')}
                </p>
              }
            >
              <p class="text-center text-sm text-slate-600">
                {t('Sign in with your browser extension.')}
              </p>
              <button
                type="button"
                onClick={async () => {
                  props.onError('');
                  try {
                    const result = await loginWithNip07();

                    if (result.success) {
                      props.onSuccess(result);
                    } else {
                      props.onError(t('Login failed'));
                    }
                  } catch (error) {
                    logError('NIP-07 login failed:', error);
                    props.onError(error instanceof Error ? error.message : t('Login failed'));
                  }
                }}
                class="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-400 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-800 shadow-sm transition-colors hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {t('Sign in with extension')}
              </button>
            </Show>
          </div>
        </Show>

        <Show when={showBunker(flow())}>
          <div class="flex flex-col gap-3">
            <p class="text-sm text-slate-600">
              {t('Paste the bunker:// URL from your remote signer (NIP-46) to connect.')}
            </p>
            <label for="bunker-url" class="sr-only">
              {t('Bunker URL')}
            </label>
            <textarea
              id="bunker-url"
              value={bunkerUrl()}
              onInput={(e) => setBunkerUrl(e.currentTarget.value)}
              placeholder="bunker://&lt;pubkey&gt;?relay=wss://..."
              rows={3}
              class="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              disabled={bunkerLoading() || !bunkerUrl().trim()}
              onClick={async () => {
                const url = bunkerUrl().trim();

                if (!url) {
                  return;
                }

                setBunkerLoading(true);
                props.onError('');

                try {
                  const result = await loginWithBunker(url);

                  if (result.success) {
                    props.onSuccess(result);
                  } else {
                    props.onError(t('Login failed'));
                  }
                } catch (error) {
                  logError('Bunker login failed:', error);
                  props.onError(error instanceof Error ? error.message : t('Login failed'));
                } finally {
                  setBunkerLoading(false);
                }
              }}
              class="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-400 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-800 shadow-sm transition-colors hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              <Show when={bunkerLoading()} fallback={t('Connect')}>
                <span class="inline-flex items-center gap-2">
                  <span class="h-4 w-4 animate-spin rounded-full border-2 border-b-blue-600" />
                  {t('Connecting…')}
                </span>
              </Show>
            </button>
          </div>
        </Show>

        <Show when={showAndroid(flow())}>
          <div class="flex flex-col gap-2">
            <Show
              when={isAndroid()}
              fallback={
                <p class="text-center text-sm text-slate-600">
                  {t(
                    'Amber is for Android. Use this option on an Android device, or use Nostr Connect (QR) from this device.',
                  )}
                </p>
              }
            >
              <p class="text-center text-sm text-slate-600">
                {t('On Android you can open your signer app directly.')}
              </p>
              <Show when={!isNip55ClipboardAccessGranted()}>
                <div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-left text-xs text-amber-800">
                      {t('Clipboard access is required for Amber login. Please allow clipboard access.')}
                    </p>
                    <button
                      type="button"
                      onClick={() => void askForClipboardAccess()}
                      class="shrink-0 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 shadow-sm transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                    >
                      {t('Ask for access')}
                    </button>
                  </div>
                </div>
              </Show>
              <button
                type="button"
                onClick={() => void openAndroidSigner()}
                class="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 shadow-sm transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              >
                {t('Open Android Signer')}
              </button>
              <Show when={nip55Waiting()}>
                <p class="text-center text-xs text-slate-500">
                  {t('Waiting for Android signer response…')}
                </p>
              </Show>
              <Show when={nip55TimedOut()}>
                <p class="text-center text-xs text-amber-700">
                  {t('NIP-55 login timed out. Return from signer and try again.')}
                </p>
              </Show>
              <div class="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-xs text-slate-600">
                    {t('If clipboard auto-detect fails, paste signer result manually.')}
                  </p>
                </div>
                <textarea
                  value={nip55ManualResult()}
                  onInput={(e) => setNip55ManualResult(e.currentTarget.value)}
                  rows={2}
                  placeholder={t('Paste pubkey or npub from Amber')}
                  class="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div class="flex gap-2">
                  <button
                    type="button"
                    disabled={nip55ManualLoading() || nip55ManualResult().trim().length === 0}
                    onClick={() => void submitManualNip55Result()}
                    class="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 shadow-sm transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    <Show when={nip55ManualLoading()} fallback={t('Use pasted result')}>
                      {t('Connecting…')}
                    </Show>
                  </button>
                </div>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={showNostrConnect(flow())}>
          <div class="space-y-2">
            <div class="flex justify-center">
              <div class="rounded-lg border-2 border-slate-200 bg-white p-4">
                <Show
                  when={!isQrLoading() && !isTyping() && qrSvg()}
                  fallback={
                    <div class="flex h-[200px] w-[200px] items-center justify-center">
                      <div class="h-8 w-8 animate-spin rounded-full border-2 border-b-blue-500" />
                    </div>
                  }
                >
                  <div
                    class="cursor-pointer"
                    onClick={copyUri}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        copyUri();
                      }
                    }}
                    aria-label={t('Scan the QR code or click to copy')}
                  >
                    <div
                      class="flex h-[200px] w-[200px] items-center justify-center [&>svg]:max-h-[200px] [&>svg]:max-w-[200px]"
                      innerHTML={qrSvg()}
                    />
                    <Show when={showCopied()}>
                      <p class="mt-2 text-center text-sm font-medium text-green-600">
                        {t('Copied')}
                      </p>
                    </Show>
                  </div>
                </Show>
              </div>
            </div>

            <Show when={isWaitingForConnection() && !isTyping()}>
              <div class="py-2 text-center">
                <div class="flex flex-col items-center gap-2 text-sm text-amber-600">
                  <div class="h-4 w-4 animate-spin rounded-full border-2 border-b-amber-500" />
                  <span>{t('Waiting for connection…')}</span>
                  <span>{t('Scan the QR code or click to copy')}</span>
                </div>
              </div>
            </Show>

            <Show when={isTyping()}>
              <div class="py-2 text-center">
                <p class="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
                  {t('Relay changed. Click Refresh to update the QR code.')}
                </p>
              </div>
            </Show>
          </div>

          <div class="flex justify-center gap-2 p-4">
            <button
              type="button"
              onClick={() => setShowRelayInput((v) => !v)}
              class="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {showRelayInput() ? t('Hide settings') : t('Settings')}
            </button>
            <button
              type="button"
              onClick={() => refresh()}
              class="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t('Refresh')}
            </button>
          </div>

          <Show when={showRelayInput()}>
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label for="nostrconnect-relay-0" class="text-sm font-medium text-slate-700">
                  {t('Relays')}
                </label>
                <button
                  type="button"
                  onClick={addRelay}
                  class="rounded border border-slate-300 bg-white px-2 py-1 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {t('Add relay')}
                </button>
              </div>
              <ul class="flex flex-col gap-2">
                <For each={relays()}>
                  {(url, index) => (
                    <li class="flex gap-2">
                      <input
                        id={`nostrconnect-relay-${index()}`}
                        type="url"
                        placeholder="wss://..."
                        value={url}
                        onInput={(e) => handleRelayInput(index(), e.currentTarget.value)}
                        class="block flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeRelay(index())}
                        disabled={relays().length <= 1}
                        class="rounded border border-slate-300 bg-white px-2 py-2 text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        aria-label={t('Remove relay')}
                      >
                        ×
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
