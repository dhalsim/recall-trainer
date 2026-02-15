# TODO — Recall Trainer

Check AGENTS.md for the requirements.

## Phase 1 — Core Application

- [x] **Word Entry — Paste option:** Allow pasting notes (one per line: source | target).
- [x] **Word Entry — Expandable row:** Add a ">" button per entry row. When expanded, show a details row with a table: columns **Direction** | **Next review** | **Level** | **Errors**; two data rows (Source→Target, Target→Source). Format next review as "Due in X days" (or "Due today" / "Due tomorrow"). Remove the entry-level Error count column from the main table.
- [x] Routing between screens (e.g. `@solidjs/router`).
- [x] Mobile-first layout, consistent spacing, accessible form inputs, inline validation.
- [x] **Nostr Connect (full provider abstraction)**  
  Reference implementation: `bitcoin-son-dakika` → `/Users/baris/Projects/bitcoin-son-dakika/src/lib/providers/NostrConnectProvider.ts`
  - [x] Add dependencies: `nostr-tools`, `qrcode`
  - [x] Add Nostr utils: `src/utils/nostr.ts` (`createKeyPair`, `generateRandomHexString`, `assertUnreachable`)
  - [x] Add provider types: `src/lib/nostr/types.ts` (NostrProvider, SignEventParams, NostrConnectData, etc.)
  - [x] Add NostrConnect provider: `src/lib/nostr/NostrConnectProvider.ts` (class, `generateNostrConnectUri`, `decryptContent`)
  - [x] Extend store: auth slice in `store.ts` (e.g. `authLoginState`) with persistence and migrations if needed
  - [x] Add Solid auth context: `src/contexts/NostrAuthContext.tsx` (loginWithNostrConnect, logout, getPublicKey, signEvent)
  - [x] Add Solid UI: `src/components/NostrConnectAuth.tsx` (QR, relay input, copy, success → context)
  - [x] Add i18n keys for Nostr Connect strings (en, tr, ja)
  - [x] Wire entry point: e.g. Settings or dedicated screen that shows NostrConnectAuth

- [ ] **Password Signer (NIP-49) — Nostr Connect Provider**
  - New provider that stores the secret key encrypted with a user password (NIP-49 / ncryptsec).
  - Use `nostr-tools/nip49` (`encrypt`, `decrypt`) for key encryption/decryption.
  - Implement `NostrProvider` (e.g. `src/lib/nostr/PasswordSignerProvider.ts`): `getPublicKey`, `signEvent` via `finalizeEvent` with unlocked key; support unlock/lock with password.
  - Persist only ncryptsec (never plain key); unlock in session or on demand.
  - Add provider method type (e.g. `'password_signer'`) and auth state shape in store; extend Nostr Auth context and Settings UI (e.g. “Sign in with password” tab or flow).
  - Reference: [NIP-49](https://nips.nostr.com/49), [applesauce password-signer](https://github.com/hzrd149/applesauce/blob/de4a6208c13f384bcede351b558a0de3cd499647/packages/signers/src/signers/password-signer.ts), [applesauce keys helpers](https://github.com/hzrd149/applesauce/blob/de4a6208c13f384bcede351b558a0de3cd499647/packages/core/src/helpers/keys.ts).

- [ ] **Passkey Signer (WebAuthn PRF + NIP-49) — Nostr Connect Provider**
  - Replace the password in the NIP-49 flow with a passkey-derived secret via the WebAuthn PRF extension.
  - User taps biometric / security key → PRF outputs deterministic bytes → used as scrypt password to decrypt ncryptsec → sign → auto-lock.
  - Builds on top of the Password Signer: same ncryptsec storage, same auto-lock, same closure-based key isolation.
  - Fallback to manual password entry on browsers without PRF support (Firefox, older Safari).
  - New provider method `'passkey_signer'` in types; new factory `createPasskeySigner()` in `src/lib/nostr/PasskeySignerProvider.ts`.
  - See `docs/NOSTR_CONNECT_PLAN.md` §11.7 for full design.

- [x] **Android Signer (NIP-55 web flow) — NostrConnect alternative**
  - Add `nostrsigner:` URI scheme support as an alternative connection method for Android users with a signer app (e.g. Amber).
  - Instead of QR / copy connection string, the user taps "Open Android Signer" → redirected via `nostrsigner:` intent → signer app returns result via callback URL or clipboard.
  - Login: `get_public_key` via intent → receive pubkey via callback URL query param → store pubkey, set provider.
  - Signing: `sign_event` via intent → signer returns signature/event via callback → parse and return.
  - Callback URL considerations: works on deployed HTTPS origins; localhost and PWA need investigation (may need clipboard fallback).
  - Show this option only on Android (user-agent detection); add to NostrConnectAuth UI as a tab/button alongside QR.
  - New provider method `'nip55'`; see `docs/NOSTR_CONNECT_PLAN.md` §11.8 for full design.

- [x] **Due-count on main screen:** Show how many due entries/directions we have in the bucket on the main (mode selection) screen. Use `getDueSourceToTarget(entries)` and `getDueTargetToSource(entries)` from the store. Suggested placement: inside or next to the "Take a test" button in `ModeSelection.tsx` (e.g. "Take a test (12 due)" or per-direction counts).

- [ ] **Nostr NIP-78 sync (kind 30078)** — Sync app state to Nostr relay as addressable app data
  - Use event kind `30078`, `d` tag `"recall-trainer-sync-data"`, `content` = stringified JSON of app state (or sync payload). Nostr auth required (`signEvent`, `getPublicKey`).
  - Sync logic: fetch latest event for kind 30078 + d; compare `created_at` with local sync metadata; either **pull** (fetch and update localStorage from relay, with backup before overwrite) or **push** (publish replace event with same kind + d). Relays keep versions for replaceable events (30000–39999).
  - Keep a backup in localStorage before applying remote data (e.g. `recall-trainer-state-backup` or timestamped) so user can recover if needed.
  - See `docs/nostr_nip78_sync_plan.md` for full design.

---

## Phase 2 — AI Features (Later)

- [ ] AI module in `src/ai/` for Routstr integration
- [ ] Automatic translation on word entry ("Translate with AI")
- [ ] Mistake explanation & chat-based help
- [ ] Contextual suggestions (related vocab, examples, grammar)
- [ ] Custom user prompts (stored locally)
- [ ] Per-conversation spending cap
- [ ] Live cost tracking in UI
- [ ] Wallet / payment model (Cashu eCash via Routstr)
