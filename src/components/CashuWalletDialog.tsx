import { getEncodedToken, sumProofs, Wallet } from '@cashu/cashu-ts';
import type { Proof } from '@cashu/cashu-ts';
import { createEffect, createSignal, Show, For } from 'solid-js';

import { useNostrAuth } from '../contexts/NostrAuthContext';
import { t } from '../i18n';
import type { Nip60WalletContent } from '../lib/cashu/nip60';
import {
  buildTokenEventTemplate,
  buildWalletEventTemplate,
  decryptTokenContent,
  decryptWalletContent,
  queryTokens,
  queryWallet,
  walletContentToArray,
} from '../lib/cashu/nip60';
import type { Nip65Relays } from '../lib/nostr/nip65';
import { getRelays } from '../lib/nostr/nip65';
import {
  DEFAULT_READ_RELAYS,
  DEFAULT_WRITE_RELAYS,
  generateRandomHexString,
  pool,
} from '../utils/nostr';

interface CashuWalletDialogProps {
  open: boolean;
  onClose: () => void;
}

type WalletState = 'loading' | 'no-wallet' | 'loaded' | 'error';

function getReadRelays(pubkey: string): string[] {
  const nip65 = getRelays(pubkey) as Nip65Relays | undefined;

  return nip65?.readRelays?.length ? nip65.readRelays : DEFAULT_READ_RELAYS;
}

function getWriteRelays(pubkey: string): string[] {
  const nip65 = getRelays(pubkey) as Nip65Relays | undefined;

  return nip65?.writeRelays?.length ? nip65.writeRelays : DEFAULT_WRITE_RELAYS;
}

function truncateUrl(url: string, maxLen: number): string {
  if (url.length <= maxLen) {
    return url;
  }

  return url.slice(0, maxLen - 3) + '...';
}

/** In-dialog workflow: receive (paste token), send (amount), or history. */
type MintPanel = 'receive' | 'send' | 'history' | null;

export function CashuWalletDialog(props: CashuWalletDialogProps) {
  const auth = useNostrAuth();
  const [walletState, setWalletState] = createSignal<WalletState>('loading');
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [walletContent, setWalletContent] = createSignal<Nip60WalletContent | null>(null);
  /** Proofs we hold per mint (aggregated from NIP-60 token events). */
  const [proofsByMint, setProofsByMint] = createSignal<Map<string, Proof[]>>(new Map());
  /** Proofs we've sent in a token, not yet redeemed (for Pending count). */
  const [pendingSentByMint, setPendingSentByMint] = createSignal<Map<string, Proof[]>>(new Map());
  const [showCreateForm, setShowCreateForm] = createSignal(false);
  const [showAddMint, setShowAddMint] = createSignal(false);
  const [createMintUrls, setCreateMintUrls] = createSignal<string[]>(['']);
  const [creating, setCreating] = createSignal(false);
  const [addMintUrl, setAddMintUrl] = createSignal('');
  const [mintPanel, setMintPanel] = createSignal<MintPanel>(null);
  const [selectedMintUrl, setSelectedMintUrl] = createSignal<string | null>(null);
  const [receiveTokenInput, setReceiveTokenInput] = createSignal('');
  const [sendAmountInput, setSendAmountInput] = createSignal('');
  const [sentTokenEncoded, setSentTokenEncoded] = createSignal<string | null>(null);
  const [loadingOp, setLoadingOp] = createSignal(false);

  const loadWallet = async (): Promise<void> => {
    const pubkey = auth.pubkey();

    if (!pubkey) {
      setWalletState('error');
      setErrorMessage(t('Could not get public key.'));

      return;
    }

    if (!auth.provider?.hasCapability('nip44')) {
      setWalletState('error');
      setErrorMessage(t('NIP-44 encryption is not supported by your current signer.'));

      return;
    }

    setWalletState('loading');
    setErrorMessage(null);

    const readRelays = getReadRelays(pubkey);

    try {
      const walletEvent = await queryWallet(readRelays, pubkey);

      if (!walletEvent) {
        setWalletState('no-wallet');
        setWalletContent(null);
        setProofsByMint(new Map());

        return;
      }

      const content = await decryptWalletContent(walletEvent, auth.nip44Decrypt, pubkey);

      setWalletContent(content);

      const tokenEvents = await queryTokens(readRelays, pubkey);
      const byMint = new Map<string, Proof[]>();

      for (const ev of tokenEvents) {
        const decrypted = await decryptTokenContent(ev, auth.nip44Decrypt, pubkey);

        if (decrypted) {
          const cur = byMint.get(decrypted.mint) ?? [];
          byMint.set(decrypted.mint, [...cur, ...decrypted.proofs]);
        }
      }

      setProofsByMint(byMint);
      setWalletState('loaded');
    } catch (err) {
      console.error('[CashuWallet] Load failed:', err);
      setWalletState('error');
      setErrorMessage(t('Failed to load wallet.'));
    }
  };

  createEffect(() => {
    if (props.open && auth.isLoggedIn()) {
      void loadWallet();
    }
  });

  const handleCreateWallet = async (): Promise<void> => {
    const pubkey = auth.pubkey();

    if (!pubkey) {
      setErrorMessage(t('Could not get public key.'));

      return;
    }

    const urls = createMintUrls().filter((u) => u.trim().length > 0);

    if (urls.length === 0) {
      setErrorMessage(t('Enter a valid mint URL.'));

      return;
    }

    setCreating(true);
    setErrorMessage(null);

    try {
      const privkey = generateRandomHexString(64);
      const content: Nip60WalletContent = { privkey, mints: urls };

      const encrypted = await auth.nip44Encrypt(
        pubkey,
        JSON.stringify(walletContentToArray(content)),
      );

      const template = buildWalletEventTemplate(encrypted);

      const { signedEvent } = await auth.signEvent({
        event: template,
        reason: t('Create Cashu wallet'),
      });

      const writeRelays = getWriteRelays(pubkey);
      pool.publish(writeRelays, signedEvent);

      setWalletContent(content);
      setProofsByMint(new Map());
      setWalletState('loaded');
      setShowCreateForm(false);
      setCreateMintUrls(['']);
    } catch (err) {
      console.error('[CashuWallet] Create failed:', err);
      setErrorMessage(t('Failed to create wallet.'));
    } finally {
      setCreating(false);
    }
  };

  const handleAddMint = (): void => {
    const url = addMintUrl().trim();

    if (!url) {
      setErrorMessage(t('Enter a valid mint URL.'));

      return;
    }

    const content = walletContent();

    if (!content) {
      return;
    }

    const newMints = [...content.mints, url];
    const updated: Nip60WalletContent = { ...content, mints: newMints };

    setWalletContent(updated);
    setAddMintUrl('');
    setShowAddMint(false);
    setErrorMessage(null);

    void (async () => {
      const pk = auth.pubkey();

      if (!pk) {
        return;
      }

      try {
        const encrypted = await auth.nip44Encrypt(
          pk,
          JSON.stringify(walletContentToArray(updated)),
        );

        const template = buildWalletEventTemplate(encrypted);

        const { signedEvent } = await auth.signEvent({
          event: template,
          reason: t('Add mint to wallet'),
        });

        const writeRelays = getWriteRelays(pk);
        pool.publish(writeRelays, signedEvent);
      } catch (err) {
        console.error('[CashuWallet] Add mint publish failed:', err);
        setErrorMessage(t('Failed to create wallet.'));
      }
    })();
  };

  const addCreateMintRow = (): void => {
    setCreateMintUrls((prev) => [...prev, '']);
  };

  const setCreateMintUrlAt = (index: number, value: string): void => {
    setCreateMintUrls((prev) => {
      const next = [...prev];
      next[index] = value;

      return next;
    });
  };

  const publishTokenEvent = async (mintUrl: string, proofs: Proof[]): Promise<void> => {
    const pk = auth.pubkey();

    if (!pk) {
      return;
    }

    const encrypted = await auth.nip44Encrypt(pk, JSON.stringify({ mint: mintUrl, proofs }));

    const template = buildTokenEventTemplate(encrypted);

    const { signedEvent } = await auth.signEvent({
      event: template,
      reason: t('Publish token event'),
    });

    const writeRelays = getWriteRelays(pk);
    pool.publish(writeRelays, signedEvent);
  };

  const openReceive = (mintUrl: string): void => {
    setSelectedMintUrl(mintUrl);
    setMintPanel('receive');
    setReceiveTokenInput('');
    setSentTokenEncoded(null);
    setErrorMessage(null);
  };

  const openSend = (mintUrl: string): void => {
    setSelectedMintUrl(mintUrl);
    setMintPanel('send');
    setSendAmountInput('');
    setSentTokenEncoded(null);
    setErrorMessage(null);
  };

  const closeMintPanel = (): void => {
    setMintPanel(null);
    setSelectedMintUrl(null);
    setSentTokenEncoded(null);
    setErrorMessage(null);
  };

  const handleReceive = async (): Promise<void> => {
    const mintUrl = selectedMintUrl();
    const tokenStr = receiveTokenInput().trim();

    if (!mintUrl || !tokenStr) {
      setErrorMessage(t('Paste a Cashu token.'));

      return;
    }

    setLoadingOp(true);
    setErrorMessage(null);
    try {
      const wallet = new Wallet(mintUrl, { unit: 'sat' });
      await wallet.loadMint();

      const newProofs = await wallet.ops
        .receive(tokenStr)
        .asDeterministic()
        .requireDleq(true)
        .run();

      const prev = proofsByMint().get(mintUrl) ?? [];
      const merged = [...prev, ...newProofs];

      setProofsByMint((m) => {
        const next = new Map(m);
        next.set(mintUrl, merged);

        return next;
      });

      await publishTokenEvent(mintUrl, merged);
      closeMintPanel();
    } catch (err) {
      console.error('[CashuWallet] Receive failed:', err);
      setErrorMessage(err instanceof Error ? err.message : t('Failed to receive token.'));
    } finally {
      setLoadingOp(false);
    }
  };

  const handleSend = async (): Promise<void> => {
    const mintUrl = selectedMintUrl();
    const amount = Number.parseInt(sendAmountInput().trim(), 10);

    if (!mintUrl || Number.isNaN(amount) || amount <= 0) {
      setErrorMessage(t('Enter a valid amount.'));

      return;
    }

    const proofs = proofsByMint().get(mintUrl) ?? [];
    const balance = sumProofs(proofs);

    if (amount > balance) {
      setErrorMessage(t('Insufficient balance.'));

      return;
    }

    setLoadingOp(true);
    setErrorMessage(null);
    try {
      const wallet = new Wallet(mintUrl, { unit: 'sat' });
      await wallet.loadMint();

      const { keep, send: toSend } = await wallet.ops
        .send(amount, proofs)
        .asDeterministic()
        .includeFees(true)
        .run();

      const token = { mint: mintUrl, proofs: toSend };
      const encoded = getEncodedToken(token);
      setSentTokenEncoded(encoded);

      setProofsByMint((m) => {
        const next = new Map(m);
        next.set(mintUrl, keep);

        return next;
      });

      setPendingSentByMint((p) => {
        const next = new Map(p);
        const cur = next.get(mintUrl) ?? [];
        next.set(mintUrl, [...cur, ...toSend]);

        return next;
      });

      await publishTokenEvent(mintUrl, keep);
    } catch (err) {
      console.error('[CashuWallet] Send failed:', err);
      setErrorMessage(err instanceof Error ? err.message : t('Failed to send.'));
    } finally {
      setLoadingOp(false);
    }
  };

  const balanceForMint = (mintUrl: string): number => sumProofs(proofsByMint().get(mintUrl) ?? []);

  const pendingCountForMint = (mintUrl: string): number =>
    (pendingSentByMint().get(mintUrl) ?? []).length;

  return (
    <Show when={props.open}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cashu-wallet-title"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            props.onClose();
          }
        }}
      >
        <div class="fixed inset-0 bg-slate-900/50" aria-hidden="true" />
        <div
          class="relative z-10 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="cashu-wallet-title" class="text-lg font-semibold text-slate-900">
            {t('Wallet')}
          </h2>

          <Show when={!auth.isLoggedIn()}>
            <p class="mt-4 text-sm text-slate-500">
              {t('Sign in with Nostr to use the Cashu wallet.')}
            </p>
          </Show>

          <Show when={auth.isLoggedIn()}>
            <Show when={walletState() === 'loading'}>
              <p class="mt-4 text-sm text-slate-600">{t('Loading wallets...')}</p>
            </Show>

            <Show when={walletState() === 'error'}>
              <p class="mt-4 text-sm text-red-600">{errorMessage()}</p>
            </Show>

            <Show when={walletState() === 'no-wallet' && !showCreateForm()}>
              <p class="mt-4 text-sm text-slate-600">{t('No wallets found for this account.')}</p>
              <p class="mt-2 text-sm text-slate-500">
                {t('Create a new wallet and transfer funds to it.')}
              </p>
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {t('Create Wallet')}
              </button>
            </Show>

            <Show when={walletState() === 'no-wallet' && showCreateForm()}>
              <div class="mt-4 space-y-4">
                <div>
                  <p class="text-sm font-medium text-slate-700">{t('Add Mint')}</p>
                  <For each={createMintUrls()}>
                    {(url, i) => (
                      <div class="mt-2 flex gap-2">
                        <input
                          type="url"
                          placeholder={t('Mint URL')}
                          value={url}
                          onInput={(e) => setCreateMintUrlAt(i(), e.currentTarget.value)}
                          class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    )}
                  </For>
                  <button
                    type="button"
                    onClick={addCreateMintRow}
                    class="mt-2 text-sm text-blue-600 hover:underline"
                  >
                    + {t('Add Mint')}
                  </button>
                </div>
                <Show when={errorMessage()}>
                  <p class="text-sm text-red-600">{errorMessage()}</p>
                </Show>
                <div class="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      setErrorMessage(null);
                    }}
                    class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
                  >
                    {t('Back')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateWallet()}
                    disabled={creating()}
                    class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    {creating() ? t('Creating wallet...') : t('Create Wallet')}
                  </button>
                </div>
              </div>
            </Show>

            <Show when={walletState() === 'loaded' && !mintPanel()}>
              <div class="mt-4 space-y-4">
                <div>
                  <p class="text-sm font-medium text-slate-700">{t('Mints')}</p>
                  <ul class="mt-2 space-y-3">
                    <For each={walletContent()?.mints ?? []}>
                      {(mintUrl) => (
                        <li class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <div class="flex flex-wrap items-center justify-between gap-2">
                            <span class="truncate font-mono text-xs text-slate-700" title={mintUrl}>
                              {truncateUrl(mintUrl, 32)}
                            </span>
                            <span class="text-sm font-semibold text-slate-900">
                              {balanceForMint(mintUrl)} {t('sats')}
                            </span>
                          </div>
                          <div class="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openReceive(mintUrl)}
                              class="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {t('Receive')}
                            </button>
                            <button
                              type="button"
                              disabled={balanceForMint(mintUrl) === 0}
                              onClick={() => openSend(mintUrl)}
                              class="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {t('Send')}
                            </button>
                            <span class="text-xs text-slate-500">
                              {t('Pending')}: {pendingCountForMint(mintUrl)}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedMintUrl(mintUrl);
                                setMintPanel('history');
                              }}
                              class="rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400"
                            >
                              {t('History')}
                            </button>
                          </div>
                        </li>
                      )}
                    </For>
                  </ul>
                </div>

                <Show when={showAddMint()}>
                  <div class="flex gap-2">
                    <input
                      type="url"
                      placeholder={t('Mint URL')}
                      value={addMintUrl()}
                      onInput={(e) => setAddMintUrl(e.currentTarget.value)}
                      class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddMint}
                      class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      {t('Add Mint')}
                    </button>
                  </div>
                </Show>
                <Show when={errorMessage()}>
                  <p class="text-sm text-red-600">{errorMessage()}</p>
                </Show>
                <button
                  type="button"
                  onClick={() => setShowAddMint((v) => !v)}
                  class="text-sm text-blue-600 hover:underline"
                >
                  {showAddMint() ? t('Close') : `+ ${t('Add Mint')}`}
                </button>
              </div>
            </Show>

            <Show when={walletState() === 'loaded' && mintPanel() === 'receive'}>
              <div class="mt-4 space-y-4">
                <button
                  type="button"
                  onClick={closeMintPanel}
                  class="text-sm text-slate-600 hover:underline"
                >
                  ← {t('Back')}
                </button>
                <p class="text-sm font-medium text-slate-700">
                  {t('Receive')} — {selectedMintUrl() && truncateUrl(selectedMintUrl()!, 28)}
                </p>
                <p class="text-xs text-slate-500">{t('Paste a Cashu token to receive.')}</p>
                <textarea
                  value={receiveTokenInput()}
                  onInput={(e) => setReceiveTokenInput(e.currentTarget.value)}
                  rows={4}
                  placeholder="cashuAey..."
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <Show when={errorMessage()}>
                  <p class="text-sm text-red-600">{errorMessage()}</p>
                </Show>
                <button
                  type="button"
                  onClick={() => void handleReceive()}
                  disabled={loadingOp()}
                  class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loadingOp() ? t('Receiving…') : t('Receive')}
                </button>
              </div>
            </Show>

            <Show when={walletState() === 'loaded' && mintPanel() === 'send'}>
              <div class="mt-4 space-y-4">
                <button
                  type="button"
                  onClick={closeMintPanel}
                  class="text-sm text-slate-600 hover:underline"
                >
                  ← {t('Back')}
                </button>
                <p class="text-sm font-medium text-slate-700">
                  {t('Send')} — {selectedMintUrl() && truncateUrl(selectedMintUrl()!, 28)}
                </p>
                <Show when={!sentTokenEncoded()}>
                  <label class="block text-xs text-slate-600">{t('Amount (sats)')}</label>
                  <input
                    type="number"
                    min="1"
                    value={sendAmountInput()}
                    onInput={(e) => setSendAmountInput(e.currentTarget.value)}
                    class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <Show when={errorMessage()}>
                    <p class="text-sm text-red-600">{errorMessage()}</p>
                  </Show>
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={loadingOp()}
                    class="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                  >
                    {loadingOp() ? t('Sending…') : t('Send')}
                  </button>
                </Show>
                <Show when={sentTokenEncoded()}>
                  <p class="text-xs text-slate-600">{t('Share this token with the recipient:')}</p>
                  <textarea
                    readOnly
                    value={sentTokenEncoded() ?? ''}
                    rows={4}
                    class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={closeMintPanel}
                    class="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
                  >
                    {t('Done')}
                  </button>
                </Show>
              </div>
            </Show>

            <Show when={walletState() === 'loaded' && mintPanel() === 'history'}>
              <div class="mt-4 space-y-4">
                <button
                  type="button"
                  onClick={closeMintPanel}
                  class="text-sm text-slate-600 hover:underline"
                >
                  ← {t('Back')}
                </button>
                <p class="text-sm font-medium text-slate-700">
                  {t('History')} — {selectedMintUrl() && truncateUrl(selectedMintUrl()!, 28)}
                </p>
                <p class="text-xs text-slate-500">{t('Transaction history will appear here.')}</p>
              </div>
            </Show>
          </Show>

          <div class="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => props.onClose()}
              class="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t('Close')}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
