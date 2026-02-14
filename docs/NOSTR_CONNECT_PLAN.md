# Nostr Connect — Technical Plan

Full provider abstraction so we can add NIP-07, nsec, or NIP-46 later without reworking the app.

**Reference implementation (Nostr Connect provider):**  
`/Users/baris/Projects/bitcoin-son-dakika/src/lib/providers/NostrConnectProvider.ts` — class `NostrConnectProvider`, `NostrConnectData`, `generateNostrConnectUri`, `decryptContent`, kind 24133 request/response over relay.

---

## 1. Dependencies

| Package      | Version (example) | Purpose                                      |
| ------------ | ----------------- | -------------------------------------------- |
| `nostr-tools` | ^2.15.0          | Relay, nip04/nip44, finalizeEvent, key utils |
| `qrcode`     | ^1.5.4           | QR code SVG for Nostr Connect URI           |

- Use `qrcode/lib/browser.js` and `toString as toSvgString` for the QR component.

---

## 2. File Layout

```
src/
  utils/
    nostr.ts              # createKeyPair, generateRandomHexString, assertUnreachable
  lib/
    nostr/
      types.ts            # NostrProvider, NostrConnectData, SignEventParams, etc.
      NostrConnectProvider.ts  # class + generateNostrConnectUri + decryptContent
  contexts/
    NostrAuthContext.tsx  # Solid context: provider, loginWithNostrConnect, logout, getPublicKey, signEvent
  components/
    NostrConnectAuth.tsx  # Solid UI: QR, relay URL, refresh, copy, subscribe → onSuccess call context
  store.ts               # auth slice (authLoginState) + load/save
  i18n/
    english.json         # + Nostr Connect keys
    turkish.json
    japanese.json
docs/
  NOSTR_CONNECT_PLAN.md  # this file
```

---

## 3. Types (`src/lib/nostr/types.ts`)

Define once, use from provider and context:

- **NostrProviderMethod**: `'nip07' | 'nip46' | 'nsec' | 'nostrconnect' | 'none'`
- **ProviderCapability**: `'getRelays' | 'signEvent' | 'getPublicKey'`
- **NostrProvider**: interface with `method`, `isReady()`, `getPublicKey`, `signEvent`, `hasCapability(cap)`, optional `getRelays`, `dispose`
- **SignEventParams**: `{ event: EventTemplate; options?: { reason?: string } }`
- **SignEventResult**: `{ signedEvent: NostrEvent; provider: NostrProvider }`
- **GetPublicKey**: `(params?: { options?: { reason?: string } }) => Promise<string | null>`
- **SignEvent**: `(params: SignEventParams) => Promise<SignEventResult>`
- **NostrConnectData**:  
  `relay`, `uri`, `ephemeralSecret`, `ephemeralPubkey`, `timestamp`, `connectionSecret`, `remoteSignerPubkey: string | null`
- **LoginResult**: `{ success: true; provider: NostrProvider } | { success: false; provider: null }`
- **AuthIntent**: `'log_in' | 'read_pubkey' | 'sign_event'` (for future modal/UX)

Reference: bitcoin-son-dakika `NostrAuthContext.tsx` (type exports only) and full path above: `NostrConnectProvider.ts` (NostrConnectData shape, signEvent flow, nip04/nip44 decrypt).

---

## 4. Utils (`src/utils/nostr.ts`)

- **createKeyPair()**: `generateSecretKey()` + `getPublicKey(secret)` from `nostr-tools`; return `{ secret, pubkey }`.
- **generateRandomHexString(length: number)**: `crypto.getRandomValues` → hex string of given length.
- **assertUnreachable(value: never): never**: throw for exhaustive checks.

No React/Solid; pure TS.

---

## 5. NostrConnect Provider (`src/lib/nostr/NostrConnectProvider.ts`)

- **NostrConnectData**: re-export or import from `./types`.
- **NostrConnectProvider** class implementing **NostrProvider**:
  - `method: 'nostrconnect'`
  - `isReady()` → `true`
  - `getPublicKey()` → `data.remoteSignerPubkey`
  - `signEvent(params)`: encrypt with nip44 (conversation key from ephemeral + remote pubkey), build kind 24133, publish to relay, subscribe for response, decrypt, match `id`, return `{ signedEvent, provider }` or reject.
  - `hasCapability(cap)` → `true` for `signEvent` and `getPublicKey`, `false` for `getRelays`.
  - `dispose()` no-op.
- **generateNostrConnectUri(relay: string)**: create keypair via utils, random connection secret, build `nostrconnect://<ephemeralPubkey>?relay=...&secret=...&perms=sign_event,get_public_key&name=Recall%20Trainer&url=...`, return `{ uri, ephemeralData: NostrConnectData }`.
- **decryptContent(content, pubkey, ephemeralSecretBytes)**: try nip04 (if `?iv=`) else nip44; return decrypted string or null.

Imports: `nostr-tools` (Relay, finalizeEvent, nip04, nip44, getConversationKey, bytesToHex, hexToBytes), types from `./types`, utils from `@/utils/nostr` or relative. App name in URI: e.g. `"Recall Trainer"` or `window.location.origin`.

---

## 6. Store (`store.ts`)

- **Auth slice** (additive, optional):
  - `authLoginState: { method: NostrProviderMethod; loggedIn: boolean; data?: NostrConnectData } | null`
  - Default: `null`.
- **Actions**: e.g. `setAuthLoginState(state)` / `clearAuthLoginState()`.
- **Persistence**: include `authLoginState` in the same single persisted blob and version number as the rest of the app. On load, restore; if we add a new optional key and use default+spread, no migration step is required for this additive field. If we ever change the shape (e.g. multiple methods with different payloads), add a migration step and bump version per `.cursor/rules/state-migrations.mdc`.

---

## 7. Nostr Auth Context (`src/contexts/NostrAuthContext.tsx`)

- **Solid context** providing:
  - `provider: NostrProvider | null`
  - `isLoggedIn: boolean`
  - `isInitialized: boolean`
  - `loginWithNostrConnect(data: NostrConnectData): Promise<LoginResult>`
  - `logout(): void`
  - `getPublicKey(params?): Promise<string | null>`
  - `signEvent(params): Promise<SignEventResult>`
  - Optional later: `requestLogin(intent, options)`, `showLoginModal(...)` when we add a modal.
- **State**: derived from store (auth slice). On init, if `authLoginState?.loggedIn` and `method === 'nostrconnect'`, set provider to `createNostrConnectProvider(authLoginState.data)`.
- **loginWithNostrConnect**: create provider, call `setAuthLoginState({ method: 'nostrconnect', loggedIn: true, data })`, persist, set provider in context.
- **logout**: clear provider, `clearAuthLoginState()`, persist.
- **getPublicKey / signEvent**: delegate to current provider or return null / throw.

Use Solid's `createContext` and a provider component that reads/writes the store and exposes the above API.

---

## 8. NostrConnectAuth UI (`src/components/NostrConnectAuth.tsx`)

- **Solid component**. Props: e.g. `onSuccess: (result: LoginResult) => void`, `onError: (error: string) => void`.
- **State (signals)**: `generatedUri`, `qrSvg`, `isQrLoading`, `relay` (default `'wss://relay.nsec.app'`), `isWaitingForConnection`, `showRelayInput`, `currentSubscription` (relay sub for cleanup).
- **Flow**:
  1. On mount (or when relay is set): `generateNostrConnectUri(relay)` → set URI, generate QR SVG via `qrcode` → set `qrSvg`, set `isWaitingForConnection`, then start relay subscription (kind 24133, `#p` = ephemeral pubkey).
  2. On event: decrypt with `decryptContent`, parse JSON, compare `responseSecret` to `ephemeralData.connectionSecret`, set `ephemeralData.remoteSignerPubkey = evt.pubkey`, call `loginWithNostrConnect(ephemeralData)` from context, on success call `onSuccess(result)` and close subscription.
  3. Copy URI: `navigator.clipboard.writeText(generatedUri)`; show short “Copied” feedback (inline or small toast).
  4. Relay change: update `relay` signal, clear QR, close current sub; “Refresh” button regenerates URI and restarts subscription.
- **Cleanup**: on unmount close `currentSubscription`.
- **UI**: plain HTML + Tailwind (no shadcn). Buttons: Settings (toggle relay input), Refresh, optional Help (collapsible or small panel). All strings from i18n.

---

## 9. i18n

Add keys used only by Nostr Connect, e.g.:

- Connection status: “Waiting for connection…”, “Scan the QR code or click to copy”
- Buttons: “Settings”, “Hide settings”, “Refresh”, “Help”
- Labels: “Relay URL”
- Help panel: title + short steps (download app, scan QR, optional relay note)
- Errors: “Encryption format not recognized”, “Invalid response format”, “Connection secret mismatch”, “Login failed”
- Success: “Connected” / “Connected with Nostr Connect”
- Copy feedback: “Copied”

Same keys in `english.json`, `turkish.json`, `japanese.json` (values translated).

---

## 10. Entry Point

- **Option A**: Add a “Nostr” or “Sign in” section in **Settings** (e.g. in `SettingsDialog.tsx`): when expanded, render `NostrConnectAuth`; on success close or show “Logged in with Nostr Connect”.
- **Option B**: Dedicated route/screen (e.g. `/nostr` or `/settings/nostr`) that only shows `NostrConnectAuth`.

Recommendation: start with Settings so we don’t add a new route; we can add a route later if needed.

---

## 11. Future Extensions (out of scope for initial task)

- **NIP-07**: New provider class + “Extension” tab or button; context chooses provider by method.
- **nsec / NIP-46**: Same pattern: new provider, new UI tab or flow, same `NostrProvider` interface and store `authLoginState.method`.
- **Modal**: When an action requires auth, call `requestLogin(intent)` from context; open a modal that renders the same NostrConnectAuth (or tabs for multiple methods) and resolve the promise on success/cancel.

---

## 12. What we do not copy from bitcoin-son-dakika

- React components (AuthModal, LoginForm, Nip07Auth, SignupForm).
- Full React NostrAuthContext (logic is reimplemented in Solid).
- Generic `cache.ts` (persist only via `store.ts`).
- App-specific strings (bitcoinsondakika.com, Turkish-only copy); we use i18n and “Recall Trainer”.
