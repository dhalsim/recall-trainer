import type { Proof } from '@cashu/cashu-ts';
import { CheckStateEnum, Wallet } from '@cashu/cashu-ts';
import { createSignal, Show, For } from 'solid-js';

import type { NostrAuthContextValue } from '../../contexts/NostrAuthContext';
import { t } from '../../i18n';
import { setCounter } from '../../lib/cashu/counterStore';
import {
  buildTokenEventTemplate,
  decryptTokenContent,
  decryptWalletContent,
  queryTokens,
  queryWallet,
} from '../../lib/cashu/nip60';
import { validateMnemonic, wordlist, convertMnemonicToSeed } from '../../lib/cashu/seed';
import { saveSeedToCache } from '../../lib/cashu/seed';
import {
  writeWalletCache,
  setTokenEventId,
  readPendingAndEventIds,
} from '../../lib/cashu/walletCache';
import { getRelays } from '../../lib/nostr/nip65';
import { logger } from '../../utils/logger';
import { pool } from '../../utils/nostr';

const { error: logError } = logger();

const DEFAULT_READ_RELAYS = ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://nos.lol'];

function getReadRelays(pubkey: string): string[] {
  const nip65 = getRelays(pubkey);

  return nip65?.readRelays?.length ? nip65.readRelays : DEFAULT_READ_RELAYS;
}

type RecoveryStep =
  | 'idle'
  | 'validating-mnemonic'
  | 'querying-nostr'
  | 'scanning-mints'
  | 'verifying-proofs'
  | 'publishing'
  | 'updating-cache'
  | 'done'
  | 'error';

interface RecoveryState {
  step: RecoveryStep;
  currentMint?: string;
  totalMints?: number;
  recoveredCount?: number;
  warningMints?: string[];
  errorMessage?: string;
}

interface RecoverWalletDialogProps {
  pubkey: string;
  auth: NostrAuthContextValue;
  onComplete: () => void;
  onCancel: () => void;
}

const STEPS: { key: RecoveryStep; label: string }[] = [
  { key: 'idle', label: 'Ready' },
  { key: 'validating-mnemonic', label: 'Validating phrase' },
  { key: 'querying-nostr', label: 'Querying Nostr' },
  { key: 'scanning-mints', label: 'Scanning mints' },
  { key: 'verifying-proofs', label: 'Verifying proofs' },
  { key: 'publishing', label: 'Publishing' },
  { key: 'updating-cache', label: 'Updating cache' },
  { key: 'done', label: 'Complete' },
  { key: 'error', label: 'Error' },
];

export function RecoverWalletDialog(props: RecoverWalletDialogProps) {
  const [mnemonic, setMnemonic] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);
  const [state, setState] = createSignal<RecoveryState>({ step: 'idle' });
  const [warnings, setWarnings] = createSignal<string[]>([]);

  const addWarning = (msg: string) => {
    setWarnings((prev) => [...prev, msg]);
  };

  const setProgress = (step: RecoveryStep, extras?: Partial<RecoveryState>) => {
    setState({ step, ...extras });
  };

  const handleRecover = async () => {
    const mnemonicTrimmed = mnemonic().trim();

    if (!mnemonicTrimmed) {
      setError('Please enter your recovery phrase');

      return;
    }

    setError(null);
    setWarnings([]);
    setProgress('validating-mnemonic');

    try {
      if (!validateMnemonic(mnemonicTrimmed, wordlist)) {
        setProgress('error');
        setError('Invalid recovery phrase. Please check and try again.');

        return;
      }

      const seed = await convertMnemonicToSeed(mnemonicTrimmed);
      setProgress('querying-nostr');

      const readRelays = getReadRelays(props.pubkey);
      const walletEvent = await queryWallet(readRelays, props.pubkey);

      if (!walletEvent) {
        setProgress('error');
        setError('No wallet found on Nostr. Are you sure this is the right account?');

        return;
      }

      const decryptFn = props.auth.nip44Decrypt;

      if (!decryptFn) {
        setProgress('error');
        setError('Decryption not available');

        return;
      }

      const walletContent = await decryptWalletContent(walletEvent, decryptFn, props.pubkey);
      const tokenEvents = await queryTokens(readRelays, props.pubkey);

      const nip60ProofsByMint = new Map<string, { proofs: Proof[]; eventId: string }>();

      for (const ev of tokenEvents) {
        const decrypted = await decryptTokenContent(ev, decryptFn, props.pubkey);

        if (decrypted) {
          nip60ProofsByMint.set(decrypted.mint, {
            proofs: decrypted.proofs,
            eventId: ev.id,
          });
        }
      }

      setProgress('scanning-mints', { currentMint: '', totalMints: walletContent.mints.length });

      const batchProofsByMint = new Map<string, Proof[]>();
      const recoveredCounters: Record<string, number> = {};

      for (let i = 0; i < walletContent.mints.length; i++) {
        const mintUrl = walletContent.mints[i];

        setProgress('scanning-mints', {
          currentMint: mintUrl,
          totalMints: walletContent.mints.length,
        });

        try {
          const wallet = new Wallet(mintUrl, { unit: 'sat', bip39seed: seed });
          await wallet.loadMint();

          const keysets = wallet.keyChain.getAllKeysetIds();
          const mintProofs: Proof[] = [];

          for (const keyset of keysets) {
            try {
              const result = await wallet.batchRestore(undefined, undefined, undefined, keyset);

              mintProofs.push(...result.proofs);

              if (result.lastCounterWithSignature != null) {
                recoveredCounters[keyset] = result.lastCounterWithSignature + 1;
              }
            } catch (err) {
              logError(`[Recovery] batchRestore failed for ${mintUrl} and keyset ${keyset}:`, err);
              addWarning(`Could not scan ${mintUrl} and keyset ${keyset}`);

              continue;
            }
          }

          batchProofsByMint.set(mintUrl, mintProofs);
        } catch (err) {
          logError(`[Recovery] batchRestore failed for ${mintUrl}:`, err);
          addWarning(`Could not scan ${mintUrl} — may be offline`);
        }
      }

      setProgress('verifying-proofs');

      const mergedByMint = new Map<string, Proof[]>();
      const allMints = new Set([...nip60ProofsByMint.keys(), ...batchProofsByMint.keys()]);

      for (const mintUrl of allMints) {
        setProgress('verifying-proofs', { currentMint: mintUrl });

        const nip60Proofs = nip60ProofsByMint.get(mintUrl)?.proofs ?? [];
        const batchProofs = batchProofsByMint.get(mintUrl) ?? [];

        const seen = new Set<string>();
        const merged: Proof[] = [];

        for (const proof of [...nip60Proofs, ...batchProofs]) {
          if (!seen.has(proof.secret)) {
            seen.add(proof.secret);
            merged.push(proof);
          }
        }

        mergedByMint.set(mintUrl, merged);
      }

      const cleanByMint = new Map<string, Proof[]>();

      for (const [mintUrl, proofs] of mergedByMint) {
        if (proofs.length === 0) {
          continue;
        }

        try {
          const wallet = new Wallet(mintUrl, { unit: 'sat', bip39seed: seed });
          await wallet.loadMint();

          const states = await wallet.checkProofsStates(proofs);

          const unspent: Proof[] = [];
          for (let i = 0; i < proofs.length; i++) {
            if (states[i]?.state === CheckStateEnum.UNSPENT) {
              unspent.push(proofs[i]);
            }
          }

          cleanByMint.set(mintUrl, unspent);
        } catch (err) {
          logError(`[Recovery] checkProofsStates failed for ${mintUrl}:`, err);
          addWarning(`Could not verify proofs for ${mintUrl}`);
          cleanByMint.set(mintUrl, mergedByMint.get(mintUrl) ?? []);
        }
      }

      setProgress('publishing');

      for (const [mintUrl, proofs] of cleanByMint) {
        if (proofs.length === 0) {
          continue;
        }

        const oldEventId = nip60ProofsByMint.get(mintUrl)?.eventId;

        const encrypted = await props.auth.nip44Encrypt(
          props.pubkey,
          JSON.stringify({ mint: mintUrl, proofs, del: oldEventId ? [oldEventId] : undefined }),
        );

        const template = buildTokenEventTemplate(encrypted);

        const { signedEvent } = await props.auth.signEvent({
          event: template,
          reason: t('Publish token event'),
        });

        const writeRelays = getReadRelays(props.pubkey);
        pool.publish(writeRelays, signedEvent);

        setTokenEventId(props.pubkey, mintUrl, signedEvent.id);

        if (oldEventId && props.auth.signEvent) {
          void (async () => {
            try {
              const deleteTemplate = {
                kind: 5,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                  ['e', oldEventId],
                  ['k', '7375'],
                ],
                content: 'replaced by recovered token event',
              };

              const { signedEvent: deleteEvent } = await props.auth.signEvent({
                event: deleteTemplate,
                reason: 'Delete old token event',
              });

              pool.publish(writeRelays, deleteEvent);
            } catch (err) {
              logError('[Recovery] Failed to publish deletion event:', err);
            }
          })();
        }
      }

      setProgress('updating-cache');

      for (const [keysetId, next] of Object.entries(recoveredCounters)) {
        setCounter(keysetId, next);
      }

      const { pendingProofsByMint, tokenEventIds } = readPendingAndEventIds(props.pubkey);

      writeWalletCache(
        props.pubkey,
        walletContent,
        cleanByMint,
        pendingProofsByMint,
        tokenEventIds,
      );

      await saveSeedToCache(props.pubkey, seed, props.auth.nip44Encrypt);

      const totalRecovered = Array.from(cleanByMint.values()).reduce(
        (sum, proofs) => sum + proofs.length,
        0,
      );

      setProgress('done', {
        recoveredCount: totalRecovered,
        warningMints: warnings(),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logError('[Recovery] Failed:', err);
      setProgress('error');
      setError(errorMessage);
    }
  };

  const currentStepIndex = () => STEPS.findIndex((s) => s.key === state().step);

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 class="mb-4 text-xl font-semibold text-slate-800">{t('Recover Wallet')}</h2>

        <Show when={state().step === 'idle'}>
          <p class="mb-4 text-sm text-slate-600">
            {t(
              'Enter your 12 or 24 word recovery phrase to restore your wallet. This will scan all your known mints for proofs that can be recovered.',
            )}
          </p>

          <textarea
            class="mb-4 w-full resize-none rounded-lg border border-slate-300 p-3 font-mono text-sm"
            rows={4}
            placeholder={t('Enter your recovery phrase...')}
            value={mnemonic()}
            onInput={(e) => setMnemonic(e.currentTarget.value)}
          />

          <Show when={error()}>
            <p class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error()}</p>
          </Show>

          <div class="flex justify-end gap-3">
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              onClick={() => {
                setMnemonic('');
                props.onCancel();
              }}
            >
              {t('Cancel')}
            </button>
            <button
              type="button"
              class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              onClick={handleRecover}
            >
              {t('Recover')}
            </button>
          </div>
        </Show>

        <Show when={state().step !== 'idle' && state().step !== 'done' && state().step !== 'error'}>
          <div class="space-y-4">
            <div class="flex justify-between text-sm text-slate-500">
              <For each={STEPS.slice(1, -1)}>
                {(step, idx) => (
                  <div
                    class={`flex flex-col items-center ${
                      idx() < currentStepIndex()
                        ? 'text-green-600'
                        : idx() === currentStepIndex()
                          ? 'text-blue-600'
                          : 'text-slate-300'
                    }`}
                  >
                    <div class="mb-1 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs">
                      {idx() < currentStepIndex() ? '✓' : idx() + 1}
                    </div>
                    <span class="text-xs">{step.label}</span>
                  </div>
                )}
              </For>
            </div>

            <Show when={state().step === 'scanning-mints'}>
              <p class="text-center text-sm text-slate-600">
                {t('Scanning mint')} {state().currentMint} ({state().totalMints} {t('total')})
              </p>
            </Show>

            <Show when={state().step === 'verifying-proofs'}>
              <p class="text-center text-sm text-slate-600">
                {t('Verifying proofs for')} {state().currentMint}
              </p>
            </Show>

            <Show when={state().step === 'error' && error()}>
              <p class="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error()}</p>
            </Show>

            <div class="flex justify-center">
              <div class="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          </div>
        </Show>

        <Show when={state().step === 'done'}>
          <div class="space-y-4">
            <div class="rounded-lg bg-green-50 p-4 text-center">
              <p class="text-lg font-semibold text-green-800">{t('Recovery Complete!')}</p>
              <p class="text-sm text-green-700">
                {t('Recovered')} {state().recoveredCount} {t('proofs')}
              </p>
            </div>

            <Show when={state().warningMints && state().warningMints!.length > 0}>
              <div class="rounded-lg bg-amber-50 p-3">
                <p class="mb-2 text-sm font-medium text-amber-800">{t('Warnings')}</p>
                <ul class="space-y-1 text-xs text-amber-700">
                  <For each={state().warningMints}>{(mint) => <li>{mint}</li>}</For>
                </ul>
              </div>
            </Show>

            <div class="flex justify-end">
              <button
                type="button"
                class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                onClick={() => {
                  setMnemonic('');
                  props.onCancel();
                }}
              >
                {t('Done')}
              </button>
            </div>
          </div>
        </Show>

        <Show when={state().step === 'error'}>
          <div class="flex justify-end gap-3">
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              onClick={() => {
                setState({ step: 'idle' });
                setError(null);
              }}
            >
              {t('Try Again')}
            </button>
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              onClick={() => {
                setMnemonic('');
                props.onCancel();
              }}
            >
              {t('Cancel')}
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}
