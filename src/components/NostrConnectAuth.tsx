/* eslint-disable solid/no-innerhtml -- QR code SVG from qrcode library (our-generated URI only) */
import { Relay } from 'nostr-tools';
import { hexToBytes } from 'nostr-tools/utils';
import qrcode from 'qrcode';
import { onCleanup, onMount, Show } from 'solid-js';
import { createSignal } from 'solid-js';

import { useNostrAuth } from '../contexts/NostrAuthContext';
import { t } from '../i18n';
import {
  decryptContent,
  generateNostrConnectUri,
  type NostrConnectData,
} from '../lib/nostr/NostrConnectProvider';
import {
  buildNip55GetPublicKeyUri,
  saveNip55PendingRequest,
} from '../lib/nostr/Nip55Provider';

interface NostrConnectAuthProps {
  onSuccess: (result: {
    success: true;
    provider: import('../lib/nostr/types').NostrProvider;
  }) => void;
  onError: (error: string) => void;
}

const DEFAULT_RELAY = 'wss://relay.nsec.app';

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /Android/i.test(navigator.userAgent);
}

export function NostrConnectAuth(props: NostrConnectAuthProps) {
  const { loginWithNostrConnect } = useNostrAuth();
  const [generatedUri, setGeneratedUri] = createSignal('');
  const [qrSvg, setQrSvg] = createSignal('');
  const [isQrLoading, setIsQrLoading] = createSignal(false);
  const [relay, setRelay] = createSignal(DEFAULT_RELAY);
  const [isWaitingForConnection, setIsWaitingForConnection] = createSignal(false);
  const [showRelayInput, setShowRelayInput] = createSignal(false);
  const [showCopied, setShowCopied] = createSignal(false);
  const [isTyping, setIsTyping] = createSignal(false);

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
      console.error('Failed to generate QR code:', error);
      props.onError(t('Login failed'));
    } finally {
      setIsQrLoading(false);
    }
  }

  function startSubscription(ephemeralData: NostrConnectData) {
    const r = new Relay(ephemeralData.relay);

    r.connect().then(() => {
      const sub = r.subscribe(
        [
          {
            kinds: [24133],
            '#p': [ephemeralData.ephemeralPubkey],
            since: ephemeralData.timestamp,
            limit: 1,
          },
        ],
        {
          onevent(evt) {
            const ephemeralSecret = hexToBytes(ephemeralData.ephemeralSecret);

            const decrypted = decryptContent(evt.content, evt.pubkey, ephemeralSecret);

            if (!decrypted) {
              props.onError(t('Encryption format not recognized'));

              return;
            }

            let responseData: { id?: string; result?: string; error?: string };

            try {
              responseData = JSON.parse(decrypted);
            } catch {
              props.onError(t('Invalid response format'));

              return;
            }

            const responseSecret = responseData.result;

            if (responseSecret !== ephemeralData.connectionSecret) {
              props.onError(t('Connection secret mismatch'));

              return;
            }

            ephemeralData.remoteSignerPubkey = evt.pubkey;

            /* eslint-disable-next-line solid/reactivity -- async relay callback; state updates on result */
            void loginWithNostrConnect(ephemeralData).then((result) => {
              if (result.success) {
                setCurrentSubscription(null);
                sub.close();
                props.onSuccess(result);
              } else {
                props.onError(t('Login failed'));
              }
            });
          },
        },
      );

      setCurrentSubscription(sub);
    });
  }

  async function refresh() {
    const currentSub = currentSubscription();

    if (currentSub) {
      currentSub.close();
      setCurrentSubscription(null);
    }

    setIsTyping(false);
    const r = relay();
    const { uri, ephemeralData } = generateNostrConnectUri(r);

    setGeneratedUri(uri);
    setIsWaitingForConnection(true);
    props.onError('');
    await generateQrSvg(uri);
    startSubscription(ephemeralData);
  }

  function handleRelayChange(newRelay: string) {
    setRelay(newRelay);
    setIsTyping(true);
    setQrSvg('');
    setIsWaitingForConnection(false);

    const sub = currentSubscription();

    if (sub) {
      sub.close();
      setCurrentSubscription(null);
    }
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
      console.error('Failed to copy URI:', error);
      props.onError(t('Login failed'));
    }
  }

  function openAndroidSigner() {
    saveNip55PendingRequest('get_public_key', {});
    window.location.href = buildNip55GetPublicKeyUri();
  }

  onMount(() => {
    void refresh();
  });

  onCleanup(() => {
    const sub = currentSubscription();

    if (sub) {
      sub.close();
    }
  });

  return (
    <div class="space-y-4 max-h-[70vh] overflow-y-auto">
      <div class="space-y-4">
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
                    <p class="mt-2 text-center text-sm font-medium text-green-600">{t('Copied')}</p>
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

        <Show when={isAndroid()}>
          <div class="flex flex-col gap-2">
            <p class="text-center text-sm text-slate-600">
              {t('On Android you can open your signer app directly.')}
            </p>
            <button
              type="button"
              onClick={openAndroidSigner}
              class="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 shadow-sm transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
            >
              {t('Open Android Signer')}
            </button>
          </div>
        </Show>

        <div class="flex justify-center gap-2">
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
            <label for="nostrconnect-relay" class="text-sm font-medium text-slate-700">
              {t('Relay URL')}
            </label>
            <div class="flex gap-2">
              <input
                id="nostrconnect-relay"
                type="url"
                placeholder={DEFAULT_RELAY}
                value={relay()}
                onInput={(e) => handleRelayChange(e.currentTarget.value)}
                class="block w-full flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
