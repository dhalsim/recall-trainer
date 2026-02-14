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
