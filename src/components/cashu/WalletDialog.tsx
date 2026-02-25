import { getEncodedToken, sumProofs, Wallet } from '@cashu/cashu-ts';
import type { Proof } from '@cashu/cashu-ts';
import { createEffect, createSignal, Show, For } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';

import { useNostrAuth } from '../../contexts/NostrAuthContext';
import { t } from '../../i18n';
import {
  clearCounters,
  getAllCounters,
  recoverCounter,
  setCounter,
} from '../../lib/cashu/counterStore';
import { backgroundSync, loadFromDB, type DiscoverStore } from '../../lib/cashu/discoverCache';
import { clearMintData, fetchAndStoreMintData } from '../../lib/cashu/mintStore';
import type { Nip60WalletContent } from '../../lib/cashu/nip60';
import {
  buildTokenEventTemplate,
  buildWalletEventTemplate,
  decryptTokenContent,
  decryptWalletContent,
  queryTokens,
  queryWallet,
  walletContentToArray,
  getProofKeysetId,
} from '../../lib/cashu/nip60';
import {
  clearSeedCache,
  generateAndConvertMnemonic,
  loadSeedFromCache,
  saveSeedToCache,
} from '../../lib/cashu/seed';
import {
  clearWalletCache,
  proofMapFromCache,
  readWalletCache,
  writeWalletCache,
  addPendingProofs,
  getPendingProofsForMint,
  removePendingProofs,
} from '../../lib/cashu/walletCache';
import type { Nip65Relays } from '../../lib/nostr/nip65';
import { getRelays } from '../../lib/nostr/nip65';
import { readSyncMeta, writeSyncMeta } from '../../lib/syncMeta';
import { logger } from '../../utils/logger';
import {
  DEFAULT_READ_RELAYS,
  DEFAULT_WRITE_RELAYS,
  generateRandomHexString,
  pool,
} from '../../utils/nostr';

import { Mint, type MintPanelState, type MintPanelType } from './Mint';
import { MintDiscovery } from './MintDiscovery';

async function getWalletSeed(
  pubkey: string,
  nip44Decrypt: (pubkey: string, ciphertext: string) => Promise<string>,
): Promise<Uint8Array | null> {
  return loadSeedFromCache(pubkey, nip44Decrypt);
}

export interface WalletDialogProps {
  open: boolean;
  onClose: () => void;
}

type WalletState = 'loading' | 'no-wallet' | 'loaded' | 'error';
type PendingWalletAction =
  | {
      type: 'create_wallet';
      pubkey: string;
      content: Nip60WalletContent;
    }
  | {
      type: 'add_mint';
      pubkey: string;
      content: Nip60WalletContent;
    }
  | {
      type: 'remove_mint';
      pubkey: string;
      content: Nip60WalletContent;
    }
  | {
      type: 'publish_token';
      pubkey: string;
      mintUrl: string;
      proofs: Proof[];
    };

const PENDING_WALLET_ACTION_KEY = 'cashu_wallet_pending_action';
const NIP55_NAVIGATION_CODE = 'NIP55_NAVIGATION';
const { error: logError } = logger();

function getReadRelays(pubkey: string): string[] {
  const nip65 = getRelays(pubkey) as Nip65Relays | undefined;

  return nip65?.readRelays?.length ? nip65.readRelays : DEFAULT_READ_RELAYS;
}

function getWriteRelays(pubkey: string): string[] {
  const nip65 = getRelays(pubkey) as Nip65Relays | undefined;

  return nip65?.writeRelays?.length ? nip65.writeRelays : DEFAULT_WRITE_RELAYS;
}

function isNip55NavigationError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === NIP55_NAVIGATION_CODE
  );
}

function normalizeMintUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl.trim());
  const withoutTrailingSlash = parsed.toString().replace(/\/+$/, '');

  return withoutTrailingSlash;
}

function readPendingWalletAction(): PendingWalletAction | null {
  try {
    const raw = localStorage.getItem(PENDING_WALLET_ACTION_KEY);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as PendingWalletAction;
  } catch (err) {
    logError('[CashuWallet] Failed to read pending action:', err);

    return null;
  }
}

function writePendingWalletAction(action: PendingWalletAction): void {
  try {
    localStorage.setItem(PENDING_WALLET_ACTION_KEY, JSON.stringify(action));
  } catch (err) {
    logError('[CashuWallet] Failed to persist pending action:', err);
  }
}

function clearPendingWalletAction(): void {
  try {
    localStorage.removeItem(PENDING_WALLET_ACTION_KEY);
  } catch (err) {
    logError('[CashuWallet] Failed to clear pending action:', err);
  }
}

export function WalletDialog(props: WalletDialogProps) {
  const auth = useNostrAuth();
  const [walletState, setWalletState] = createSignal<WalletState>('loading');
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [walletContent, setWalletContent] = createSignal<Nip60WalletContent | null>(null);
  const [proofsByMint, setProofsByMint] = createSignal<Map<string, Proof[]>>(new Map());
  const [pendingSentByMint, setPendingSentByMint] = createSignal<Map<string, Proof[]>>(new Map());
  const [showCreateForm, setShowCreateForm] = createSignal(false);
  const [createMintUrls, setCreateMintUrls] = createSignal<string[]>(['']);
  const [creating, setCreating] = createSignal(false);
  const [addMintUrl, setAddMintUrl] = createSignal('');
  const [mintPanel, setMintPanel] = createSignal<MintPanelType>(null);
  const [selectedMintUrl, setSelectedMintUrl] = createSignal<string | null>(null);
  const [receiveTokenInput, setReceiveTokenInput] = createSignal('');
  const [sendAmountInput, setSendAmountInput] = createSignal('');
  const [sentTokenEncoded, setSentTokenEncoded] = createSignal<string | null>(null);
  const [loadingOp, setLoadingOp] = createSignal(false);
  const [showDiscoverPanel, setShowDiscoverPanel] = createSignal(false);
  const [generateSeed, setGenerateSeed] = createSignal(true);
  const [generatedMnemonic, setGeneratedMnemonic] = createSignal<string | null>(null);

  const [discoverStore, setDiscoverStore] = createStore<DiscoverStore>({
    mints: {},
    loading: false,
    syncing: false,
    error: null,
  });

  const [syncing, setSyncing] = createSignal(false);

  const syncWalletFromRelays = async (pubkey: string): Promise<void> => {
    setSyncing(true);

    const readRelays = getReadRelays(pubkey);

    try {
      const walletEvent = await queryWallet(readRelays, pubkey);

      if (!walletEvent) {
        setWalletState('no-wallet');
        setWalletContent(null);
        setProofsByMint(new Map());
        clearWalletCache(pubkey);

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
      writeWalletCache(pubkey, content, byMint);
      writeSyncMeta(pubkey, 'wallet', Math.floor(Date.now() / 1000));
    } catch (err) {
      logError('[CashuWallet] Background sync failed:', err);

      if (walletState() !== 'loaded') {
        setWalletState('error');
        setErrorMessage(t('Failed to load wallet.'));
      }
    } finally {
      setSyncing(false);
    }
  };

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

    setErrorMessage(null);

    const cached = readWalletCache(pubkey);

    if (cached && cached.walletContent.privkey) {
      setWalletContent(cached.walletContent);
      setProofsByMint(proofMapFromCache(cached));
      setWalletState('loaded');

      void syncWalletFromRelays(pubkey);
      void startProofStateStream();
      void cleanupAllProofs();

      return;
    }

    setWalletState('loading');
    await syncWalletFromRelays(pubkey);
  };

  createEffect((prev: { open: boolean; pubkey: string | null } | undefined) => {
    const open = props.open;
    const pubkey = auth.pubkey();

    if (!open || !pubkey) {
      return { open, pubkey };
    }

    if (prev?.open && prev.pubkey === pubkey) {
      return { open, pubkey };
    }

    // Never block wallet hydration on pending signer actions.
    // If a pending action hangs (e.g. external signer flow), we still want to show cached/relay data.
    void loadWallet();
    void resumePendingWalletAction();

    return { open, pubkey };
  });

  const completeWalletAction = async (action: PendingWalletAction): Promise<void> => {
    if (
      action.type === 'create_wallet' ||
      action.type === 'add_mint' ||
      action.type === 'remove_mint'
    ) {
      const encrypted = await auth.nip44Encrypt(
        action.pubkey,
        JSON.stringify(walletContentToArray(action.content)),
      );

      const template = buildWalletEventTemplate(encrypted);

      const reason =
        action.type === 'create_wallet'
          ? t('Create Cashu wallet')
          : action.type === 'add_mint'
            ? t('Add mint to wallet')
            : t('Remove mint from wallet');

      const { signedEvent } = await auth.signEvent({
        event: template,
        reason,
      });

      const writeRelays = getWriteRelays(action.pubkey);
      pool.publish(writeRelays, signedEvent);

      if (action.type === 'create_wallet') {
        const emptyProofs = new Map<string, Proof[]>();
        setWalletContent(action.content);
        setProofsByMint(emptyProofs);
        setWalletState('loaded');
        setShowCreateForm(false);
        setCreateMintUrls(['']);
        writeWalletCache(action.pubkey, action.content, emptyProofs);
      } else {
        setWalletContent(action.content);
        setAddMintUrl('');
        setShowDiscoverPanel(false);
        writeWalletCache(action.pubkey, action.content, proofsByMint());
      }

      return;
    }

    const encrypted = await auth.nip44Encrypt(
      action.pubkey,
      JSON.stringify({ mint: action.mintUrl, proofs: action.proofs }),
    );

    const template = buildTokenEventTemplate(encrypted);

    const { signedEvent } = await auth.signEvent({
      event: template,
      reason: t('Publish token event'),
    });

    const writeRelays = getWriteRelays(action.pubkey);
    pool.publish(writeRelays, signedEvent);
  };

  const runWalletAction = async (action: PendingWalletAction): Promise<boolean> => {
    writePendingWalletAction(action);

    try {
      await completeWalletAction(action);
      clearPendingWalletAction();

      return true;
    } catch (err) {
      if (isNip55NavigationError(err)) {
        return false;
      }

      clearPendingWalletAction();
      throw err;
    }
  };

  const resumePendingWalletAction = async (): Promise<void> => {
    const pending = readPendingWalletAction();

    if (!pending) {
      return;
    }

    try {
      const completed = await runWalletAction(pending);

      if (!completed) {
        return;
      }
    } catch (err) {
      logError('[CashuWallet] Failed to resume pending action:', err);
      setErrorMessage(t('Failed to create wallet.'));
      clearPendingWalletAction();
    }
  };

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

      if (generateSeed()) {
        const { mnemonic, seed } = await generateAndConvertMnemonic();
        await saveSeedToCache(pubkey, seed, auth.nip44Encrypt);
        setGeneratedMnemonic(mnemonic);
      }

      const completed = await runWalletAction({ type: 'create_wallet', pubkey, content });

      if (!completed) {
        return;
      }

      for (const mintUrl of urls) {
        await fetchAndStoreMintData(mintUrl);
      }
    } catch (err) {
      logError('[CashuWallet] Create failed:', err);
      setErrorMessage(t('Failed to create wallet.'));
    } finally {
      setCreating(false);
    }
  };

  const handleAddMint = (url?: string): void => {
    const urlToAdd = (url ?? addMintUrl().trim()).trim();

    if (!urlToAdd) {
      setErrorMessage(t('Enter a valid mint URL.'));

      return;
    }

    const content = walletContent();

    if (!content) {
      return;
    }

    let normalizedMintUrl = '';
    try {
      normalizedMintUrl = normalizeMintUrl(urlToAdd);
    } catch (_err) {
      setErrorMessage(t('Enter a valid mint URL.'));

      return;
    }

    const existingMintUrls = new Set(content.mints.map((mint) => mint.trim().toLowerCase()));

    if (existingMintUrls.has(normalizedMintUrl.toLowerCase())) {
      setErrorMessage(t('Mint is already in your wallet.'));

      return;
    }

    const newMints = [...content.mints, normalizedMintUrl];
    const updated: Nip60WalletContent = { ...content, mints: newMints };

    setWalletContent(updated);
    setAddMintUrl('');
    setShowDiscoverPanel(false);
    setErrorMessage(null);

    const pk = auth.pubkey();

    if (pk) {
      writeWalletCache(pk, updated, proofsByMint());
    }

    void (async () => {
      if (!pk) {
        return;
      }

      try {
        const completed = await runWalletAction({ type: 'add_mint', pubkey: pk, content: updated });

        if (!completed) {
          return;
        }

        await fetchAndStoreMintData(normalizedMintUrl);
      } catch (err) {
        logError('[CashuWallet] Add mint publish failed:', err);
        setErrorMessage(t('Failed to create wallet.'));
      }
    })();
  };

  const handleRemoveMint = (mintUrl: string): void => {
    const content = walletContent();

    if (!content) {
      return;
    }

    const targetMint = mintUrl.trim().toLowerCase();
    const remainingMints = content.mints.filter((mint) => mint.trim().toLowerCase() !== targetMint);

    if (remainingMints.length === content.mints.length) {
      return;
    }

    const updated: Nip60WalletContent = { ...content, mints: remainingMints };
    const nextProofsByMint = new Map(proofsByMint());
    nextProofsByMint.delete(mintUrl);
    const nextPendingSentByMint = new Map(pendingSentByMint());
    nextPendingSentByMint.delete(mintUrl);

    setWalletContent(updated);
    setProofsByMint(nextProofsByMint);
    setPendingSentByMint(nextPendingSentByMint);
    setErrorMessage(null);

    if (selectedMintUrl() === mintUrl) {
      closeMintPanel();
    }

    const pk = auth.pubkey();

    if (pk) {
      writeWalletCache(pk, updated, nextProofsByMint);
    }

    void (async () => {
      if (!pk) {
        return;
      }

      try {
        const completed = await runWalletAction({
          type: 'remove_mint',
          pubkey: pk,
          content: updated,
        });

        if (!completed) {
          return;
        }
      } catch (err) {
        logError('[CashuWallet] Remove mint publish failed:', err);
        setErrorMessage(t('Failed to remove mint.'));
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

  const publishTokenEvent = async (mintUrl: string, proofs: Proof[]): Promise<boolean> => {
    const pk = auth.pubkey();

    if (!pk) {
      return false;
    }

    return runWalletAction({ type: 'publish_token', pubkey: pk, mintUrl, proofs });
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

  const STALE_DISCOVER_SECONDS = 24 * 60 * 60; // 1 day

  const runDiscoverBackgroundSync = (force: boolean): Promise<void> => {
    const pubkey = auth.pubkey();

    if (!pubkey) {
      return Promise.resolve();
    }

    const meta = readSyncMeta(pubkey);
    const lastSync = meta?.discoverMints ?? null;
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (!force && lastSync != null && nowSeconds - lastSync < STALE_DISCOVER_SECONDS) {
      return Promise.resolve();
    }

    setDiscoverStore('syncing', true);
    const relays = getReadRelays(pubkey);

    return backgroundSync(
      relays,
      (url, info) => {
        setDiscoverStore('mints', url, 'mintInfo', info);
        setDiscoverStore('mints', url, 'mintInfoError', undefined);
      },
      (url, error) => {
        setDiscoverStore('mints', url, 'mintInfoError', error);
      },
    )
      .then((result) => {
        setDiscoverStore('mints', reconcile(result.mints));
        writeSyncMeta(pubkey, 'discoverMints', Math.floor(Date.now() / 1000));
      })
      .catch((err) => {
        logError('[CashuWallet] Discover mints failed:', err);
        setDiscoverStore('error', t('No mints found.'));
      })
      .finally(() => {
        setDiscoverStore('syncing', false);
      });
  };

  const openDiscoverPanel = (): void => {
    setShowDiscoverPanel(true);
    setErrorMessage(null);
    setDiscoverStore('error', null);
    setDiscoverStore('loading', true);

    void loadFromDB()
      .then((mints) => {
        setDiscoverStore('mints', reconcile(mints));
        setDiscoverStore('loading', false);

        return runDiscoverBackgroundSync(false);
      })
      .catch((err) => {
        logError('[CashuWallet] Discover load failed:', err);
        setDiscoverStore('error', t('No mints found.'));
        setDiscoverStore('loading', false);
        setDiscoverStore('syncing', false);
      });
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

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const pubkey = auth.pubkey();
        const bip39seed = pubkey ? await getWalletSeed(pubkey, auth.nip44Decrypt) : null;
        const counters = getAllCounters();

        const wallet = new Wallet(mintUrl, {
          unit: 'sat',
          bip39seed: bip39seed ?? undefined,
          counterInit: counters,
        });

        wallet.on.countersReserved((op) => {
          setCounter(op.keysetId, op.next);
        });

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

        const wc = walletContent();
        const pk = auth.pubkey();

        if (wc && pk) {
          writeWalletCache(pk, wc, proofsByMint());
        }

        const completed = await publishTokenEvent(mintUrl, merged);

        if (!completed) {
          return;
        }

        if (pk && auth.signEvent && auth.nip44Encrypt) {
          const keysetId = getProofKeysetId(newProofs);

          if (keysetId) {
            try {
              const amount = newProofs.reduce((sum, p) => sum + p.amount, 0).toString();

              const content = JSON.stringify([
                ['direction', 'in'],
                ['amount', amount],
                ['unit', 'sat'],
                ['e', keysetId, '', 'created'],
              ]);

              const encryptedContent = await auth.nip44Encrypt(pk, content);

              const template = {
                kind: 7376,
                created_at: Math.floor(Date.now() / 1000),
                tags: [],
                content: encryptedContent,
              };

              const { signedEvent } = await auth.signEvent({
                event: template,
                reason: 'Publish token status',
              });

              if (signedEvent) {
                const { pool } = await import('../../utils/nostr');
                const writeRelays = getWriteRelays(pk);
                pool.publish(writeRelays, signedEvent);
              }
            } catch (err) {
              logError('[CashuWallet] Failed to publish token status event:', err);
            }
          }
        }

        closeMintPanel();

        return;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        const isAlreadySignedError =
          errorMessage.includes('outputs have already been signed') ||
          errorMessage.includes('already signed');

        if (isAlreadySignedError && attempt < maxRetries - 1) {
          logError(
            `[CashuWallet] Counter out of sync (attempt ${attempt + 1}), recovering...:`,
            err,
          );

          const counters = getAllCounters();
          for (const keysetId of Object.keys(counters)) {
            recoverCounter(keysetId);
          }

          continue;
        }

        logError('[CashuWallet] Receive failed:', err);
        setErrorMessage(err instanceof Error ? err.message : t('Failed to receive token.'));

        return;
      } finally {
        setLoadingOp(false);
      }
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

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const pubkey = auth.pubkey();
        const bip39seed = pubkey ? await getWalletSeed(pubkey, auth.nip44Decrypt) : null;
        const counters = getAllCounters();

        const wallet = new Wallet(mintUrl, {
          unit: 'sat',
          bip39seed: bip39seed ?? undefined,
          counterInit: counters,
        });

        wallet.on.countersReserved((op) => {
          setCounter(op.keysetId, op.next);
        });

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

        const pk = auth.pubkey();

        if (pk) {
          addPendingProofs(pk, mintUrl, toSend);
        }

        const wc = walletContent();

        if (wc && pk) {
          writeWalletCache(pk, wc, proofsByMint());
        }

        await publishTokenEvent(mintUrl, keep);

        if (pk && auth.signEvent && auth.nip44Encrypt) {
          const keysetId = getProofKeysetId(toSend);

          if (keysetId) {
            try {
              const content = JSON.stringify([
                ['direction', 'out'],
                ['amount', amount.toString()],
                ['unit', 'sat'],
                ['e', keysetId, '', 'created'],
              ]);

              const encryptedContent = await auth.nip44Encrypt(pk, content);

              const template = {
                kind: 7376,
                created_at: Math.floor(Date.now() / 1000),
                tags: [],
                content: encryptedContent,
              };

              const { signedEvent } = await auth.signEvent({
                event: template,
                reason: 'Publish token status',
              });

              if (signedEvent) {
                const { pool } = await import('../../utils/nostr');
                const writeRelays = getWriteRelays(pk);
                pool.publish(writeRelays, signedEvent);
              }
            } catch (err) {
              logError('[CashuWallet] Failed to publish token status event:', err);
            }
          }
        }

        return;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        const isAlreadySignedError =
          errorMessage.includes('outputs have already been signed') ||
          errorMessage.includes('already signed');

        if (isAlreadySignedError && attempt < maxRetries - 1) {
          logError(
            `[CashuWallet] Counter out of sync (attempt ${attempt + 1}), recovering...:`,
            err,
          );

          const counters = getAllCounters();
          for (const keysetId of Object.keys(counters)) {
            recoverCounter(keysetId);
          }

          continue;
        }

        logError('[CashuWallet] Send failed:', err);
        setErrorMessage(err instanceof Error ? err.message : t('Failed to send.'));

        return;
      } finally {
        setLoadingOp(false);
      }
    }
  };

  const balanceForMint = (mintUrl: string): number => sumProofs(proofsByMint().get(mintUrl) ?? []);

  const pendingCountForMint = (mintUrl: string): number => {
    const pk = auth.pubkey();

    if (!pk) {
      return 0;
    }

    const pending = getPendingProofsForMint(pk, mintUrl);

    return pending.length;
  };

  const checkPendingProofs = async (mintUrl?: string): Promise<void> => {
    const pk = auth.pubkey();

    if (!pk) {
      return;
    }

    try {
      const pending = mintUrl ? getPendingProofsForMint(pk, mintUrl) : [];

      if (pending.length === 0) {
        return;
      }

      const mint = new Wallet(mintUrl ?? pending[0].id);
      await mint.loadMint();

      const states = await mint.checkProofsStates(pending);
      const { CheckStateEnum } = await import('@cashu/cashu-ts');

      for (const state of states) {
        if (state.state === CheckStateEnum.SPENT) {
          const spentProof = pending.find((p) => p.secret === state.Y);

          if (spentProof) {
            console.log(
              '[CashuWallet] Proof spent (checked):',
              spentProof.secret.slice(0, 8),
              '...',
            );

            removePendingProofs(pk, mintUrl ?? pending[0].id, [spentProof.secret]);
          }
        }
      }

      console.log('[CashuWallet] Checked pending proofs:', pending.length, 'total');
    } catch (err) {
      logError('[CashuWallet] Failed to check pending proofs:', err);
    }
  };

  const cleanupAllProofs = async (): Promise<void> => {
    const pk = auth.pubkey();

    if (!pk) {
      return;
    }

    try {
      const proofsByMintMap = proofsByMint();
      const allProofs: { proof: Proof; mintUrl: string }[] = [];

      for (const [mintUrl, proofs] of proofsByMintMap) {
        for (const proof of proofs) {
          allProofs.push({ proof, mintUrl });
        }
      }

      const pendingProofs = getPendingProofsForMint(pk, '');
      for (const proof of pendingProofs) {
        const existing = allProofs.find((p) => p.proof.secret === proof.secret);

        if (!existing) {
          allProofs.push({ proof, mintUrl: '' });
        }
      }

      if (allProofs.length === 0) {
        console.log('[CashuWallet] No proofs to cleanup');

        return;
      }

      console.log('[CashuWallet] Cleaning up', allProofs.length, 'proofs...');

      const proofsByMintUrl = new Map<string, Proof[]>();
      const pendingByMintUrl = new Map<string, Proof[]>();

      for (const { proof, mintUrl } of allProofs) {
        if (!mintUrl) {
          const existing = pendingByMintUrl.get('') ?? [];
          pendingByMintUrl.set('', [...existing, proof]);
          continue;
        }

        const mint = new Wallet(mintUrl);
        await mint.loadMint();

        const states = await mint.checkProofsStates([proof]);
        const { CheckStateEnum } = await import('@cashu/cashu-ts');

        if (states[0]?.state === CheckStateEnum.SPENT) {
          console.log('[CashuWallet] Proof SPENT (cleanup):', proof.secret.slice(0, 8), '...');
        } else {
          const existing = proofsByMintUrl.get(mintUrl) ?? [];
          proofsByMintUrl.set(mintUrl, [...existing, proof]);
        }
      }

      setProofsByMint(proofsByMintUrl);

      const wc = walletContent();

      if (wc && pk) {
        writeWalletCache(pk, wc, proofsByMintUrl);
      }

      console.log('[CashuWallet] Cleanup complete. Remaining proofs:', proofsByMintUrl.size);
    } catch (err) {
      logError('[CashuWallet] Failed to cleanup proofs:', err);
    }
  };

  const startProofStateStream = async (): Promise<void> => {
    const pk = auth.pubkey();

    if (!pk) {
      return;
    }

    try {
      const pending = getPendingProofsForMint(pk, '');

      if (pending.length === 0) {
        console.log('[CashuWallet] No pending proofs to stream');

        return;
      }

      console.log('[CashuWallet] Starting proof state stream for', pending.length, 'proofs');

      const mint = new Wallet(pending[0].id);
      await mint.loadMint();

      const { CheckStateEnum } = await import('@cashu/cashu-ts');

      for await (const update of mint.on.proofStatesStream(pending) as AsyncIterable<{
        state: string;
        proof: { secret: string };
      }>) {
        console.log(
          '[CashuWallet] Proof state update:',
          update.state,
          update.proof.secret.slice(0, 8),
          '...',
        );

        if (update.state === CheckStateEnum.SPENT) {
          console.log(
            '[CashuWallet] Proof SPENT (stream):',
            update.proof.secret.slice(0, 8),
            '...',
          );

          removePendingProofs(pk, pending[0].id, [update.proof.secret]);
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        console.log('[CashuWallet] Proof state stream aborted');

        return;
      }

      logError('[CashuWallet] Proof state stream error:', err);
    }
  };

  const mintPanelState = (): MintPanelState | undefined => {
    const url = selectedMintUrl();

    if (!url || !mintPanel()) {
      return undefined;
    }

    return {
      receiveTokenInput: receiveTokenInput(),
      setReceiveTokenInput: setReceiveTokenInput,
      sendAmountInput: sendAmountInput(),
      setSendAmountInput: setSendAmountInput,
      sentTokenEncoded: sentTokenEncoded(),
      loadingOp: loadingOp(),
      errorMessage: errorMessage(),
      onReceiveSubmit: () => void handleReceive(),
      onSendSubmit: () => void handleSend(),
      onClosePanel: closeMintPanel,
    };
  };

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
          class="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex-shrink-0 border-b border-slate-100 px-6 py-4">
            <div class="flex items-center gap-2">
              <h2 id="cashu-wallet-title" class="text-lg font-semibold text-slate-900">
                {t('Wallet')}
              </h2>
              <Show when={syncing()}>
                <span class="text-xs text-slate-400">{t('Syncing...')}</span>
              </Show>
            </div>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto p-6">
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
                  <div class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="generate-seed"
                      checked={generateSeed()}
                      onChange={(e) => setGenerateSeed(e.currentTarget.checked)}
                      class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label for="generate-seed" class="text-sm text-slate-700">
                      {t('Generate recovery phrase (12 words)')}
                    </label>
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

              <Show when={walletState() === 'loaded' && showDiscoverPanel()}>
                <MintDiscovery
                  store={discoverStore}
                  onBack={() => setShowDiscoverPanel(false)}
                  onAddMint={handleAddMint}
                  onRefresh={() => runDiscoverBackgroundSync(true)}
                  isSyncing={() => discoverStore.syncing}
                  lastSyncedAt={
                    auth.pubkey() ? (readSyncMeta(auth.pubkey()!)?.discoverMints ?? null) : null
                  }
                />
              </Show>

              <Show when={walletState() === 'loaded' && !mintPanel() && !showDiscoverPanel()}>
                <div class="mt-4 space-y-4">
                  <Show when={generatedMnemonic()}>
                    <section class="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                      <div class="space-y-2">
                        <p class="text-sm font-semibold text-amber-800">{t('Recovery Phrase')}</p>
                        <p class="text-xs text-amber-700">
                          {t(
                            'Write these words down and store them safely. You will need them to recover your wallet.',
                          )}
                        </p>
                        <p class="mt-2 rounded-lg bg-white p-3 text-sm font-mono text-slate-800 leading-relaxed">
                          {generatedMnemonic()}
                        </p>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(generatedMnemonic()!)}
                          class="mt-2 text-xs text-blue-600 hover:underline"
                        >
                          {t('Copy to clipboard')}
                        </button>
                      </div>
                    </section>
                  </Show>
                  <div>
                    <p class="text-sm font-medium text-slate-700">{t('Mints')}</p>
                    <ul class="mt-2 space-y-3">
                      <For each={walletContent()?.mints ?? []}>
                        {(mintUrl) => (
                          <Mint
                            mintUrl={mintUrl}
                            balance={balanceForMint(mintUrl)}
                            pendingCount={pendingCountForMint(mintUrl)}
                            panel={null}
                            onReceive={() => openReceive(mintUrl)}
                            onSend={() => openSend(mintUrl)}
                            onHistory={() => {
                              setSelectedMintUrl(mintUrl);
                              setMintPanel('history');
                            }}
                            onRemove={() => handleRemoveMint(mintUrl)}
                            onRefresh={() => checkPendingProofs(mintUrl)}
                          />
                        )}
                      </For>
                    </ul>
                  </div>
                  <section class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div class="space-y-1">
                      <p class="text-sm font-semibold text-slate-800">{t('Add Mint')}</p>
                      <p class="text-xs text-slate-500">
                        {t('Choose how you want to add a mint to your wallet.')}
                      </p>
                    </div>
                    <div class="mt-3">
                      <label class="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-700">
                        {t('Mint URL')}
                      </label>
                      <input
                        type="url"
                        placeholder="https://mint-url"
                        value={addMintUrl()}
                        onInput={(e) => setAddMintUrl(e.currentTarget.value)}
                        class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => handleAddMint()}
                        class="flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        + {t('Add Mint')}
                      </button>
                      <button
                        type="button"
                        onClick={openDiscoverPanel}
                        class="flex items-center justify-center rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        {t('Discover mints')}
                      </button>
                    </div>

                    <Show when={errorMessage()}>
                      <p class="mt-3 text-sm text-red-600">{errorMessage()}</p>
                    </Show>
                  </section>
                  <button
                    type="button"
                    onClick={() => {
                      const pk = auth.pubkey();

                      if (pk) {
                        clearWalletCache(pk);
                        clearSeedCache(pk);
                        clearCounters();
                        for (const mintUrl of walletContent()?.mints ?? []) {
                          clearMintData(mintUrl);
                        }
                      }

                      setWalletState('no-wallet');
                      setWalletContent(null);
                      setProofsByMint(new Map());
                      setShowCreateForm(true);
                      setGeneratedMnemonic(null);
                    }}
                    class="mt-4 w-full rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  >
                    {t('Reset Wallet')}
                  </button>
                </div>
              </Show>

              <Show
                when={
                  walletState() === 'loaded' && mintPanel() !== null && selectedMintUrl() !== null
                }
                fallback={null}
              >
                <Mint
                  mintUrl={selectedMintUrl()!}
                  balance={balanceForMint(selectedMintUrl()!)}
                  pendingCount={pendingCountForMint(selectedMintUrl()!)}
                  panel={mintPanel()}
                  onReceive={() => openReceive(selectedMintUrl()!)}
                  onSend={() => openSend(selectedMintUrl()!)}
                  onHistory={() => setMintPanel('history')}
                  onRefresh={() => checkPendingProofs(selectedMintUrl()!)}
                  panelState={mintPanelState()}
                />
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
      </div>
    </Show>
  );
}
