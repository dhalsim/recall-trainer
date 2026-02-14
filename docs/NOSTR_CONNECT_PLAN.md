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

## 11. Password Signer (NIP-49) — Planned Provider

A second Nostr Connect–compatible provider that keeps the secret key **encrypted with a user password** using [NIP-49 (Private Key Encryption)](https://nips.nostr.com/49). No remote signer; signing happens locally after unlock.

### 11.1 Spec and dependencies

- **Spec**: [NIP-49](https://nips.nostr.com/49) — password-based encryption of a 32-byte secret key using scrypt + XChaCha20-Poly1305; output is a bech32 `ncryptsec` string.
- **nostr-tools**: `import { encrypt, decrypt } from 'nostr-tools/nip49'`
  - `encrypt(sec: Uint8Array, password: string, logn?: number, ksb?: 0x00|0x01|0x02): Ncryptsec`
  - `decrypt(ncryptsec: string, password: string): Uint8Array`
- **Reference implementation**: [applesauce password-signer](https://github.com/hzrd149/applesauce/blob/de4a6208c13f384bcede351b558a0de3cd499647/packages/signers/src/signers/password-signer.ts), [applesauce keys helpers](https://github.com/hzrd149/applesauce/blob/de4a6208c13f384bcede351b558a0de3cd499647/packages/core/src/helpers/keys.ts).

### 11.2 Provider design

- **Method**: Add `'password_signer'` to `NostrProviderMethod` in `types.ts`.
- **Data**: New type e.g. `PasswordSignerData = { ncryptsec: string }`. Only the ncryptsec is persisted (e.g. in `authLoginState.data`); the raw key is never stored.
- **PasswordSignerProvider** — exposed via a **factory function** (closure-based, not a class with `this.key`):
  - Internal `key: Uint8Array | null` lives in closure scope, never on an object property.
  - `unlock(password)`: `decrypt(ncryptsec, password)` → set closure `key`; on failure throw.
  - `lock()`: `key.fill(0); key = null` — zero every byte before dropping the reference.
  - `getPublicKey()`: require unlocked; return `getPublicKey(key)` from `nostr-tools`.
  - `signEvent(params)`: require unlocked; `finalizeEvent(params.event, key)` → build result → **auto-lock immediately** (`key.fill(0); key = null`) → return `{ signedEvent, provider }`. Each sign is a one-shot unlock.
  - `hasCapability`: `signEvent` and `getPublicKey` true; `getRelays` false.
  - `isReady()`: return `true` (public key is always available from ncryptsec after first unlock caches the pubkey hex; signing requires re-unlock).
- **Public key caching**: On first successful unlock, derive and cache the pubkey hex string (not sensitive). `getPublicKey()` returns the cached pubkey without needing the key in memory.
- **Creation flows**:
  - **New key**: generate `generateSecretKey()`, then `encrypt(secret, password)` → store ncryptsec, then unlock with same password.
  - **Import ncryptsec**: user pastes ncryptsec; store it; unlock with password when needed.

### 11.3 Key security mitigations

Layered defence for keeping the secret key safe in a browser environment:

#### 11.3.1 `Uint8Array` only, `.fill(0)` on lock

- The raw key is **always** a `Uint8Array`, never a hex string (strings are immutable and can't be wiped).
- On every lock (explicit or auto), zero every byte with `.fill(0)` before setting the reference to `null`.
- This is best-effort (JS GC may have intermediate copies) but eliminates the primary reference.

#### 11.3.2 Auto-lock after each sign

- After `signEvent()` completes, the provider **immediately** zeros and drops the key.
- The key lives in memory only for the duration of the sign call (milliseconds).
- The next `signEvent()` requires the user to re-enter the password (or the context can cache it for the session — see 11.3.4).
- Read-only operations (`getPublicKey`, fetching events) do **not** require the key and work without unlocking.

#### 11.3.3 Closure-based key storage (not `this`)

- The provider is a **factory function** (`createPasswordSigner(ncryptsec)`), not a class.
- The `key` variable is captured in closure scope — it is not an enumerable property, not visible in `console.log(provider)`, `JSON.stringify`, `Object.keys`, or DevTools property inspection.
- Does not prevent heap dumps, but blocks casual inspection and accidental serialization.

#### 11.3.4 Web Worker isolation (future enhancement)

- Move `finalizeEvent` + key management into a dedicated Web Worker.
- Main thread sends `{ cmd: 'unlock', password }` / `{ cmd: 'sign', event }` / `{ cmd: 'lock' }` via `postMessage`.
- Worker holds the key; main thread **never** sees the raw bytes.
- XSS on the main thread and browser extensions cannot read the Worker's memory scope.
- Trade-off: added complexity (async messaging, Vite worker bundling). Worth doing if the app evolves into a serious signing wallet.

#### 11.3.5 CSP headers

Add a Content-Security-Policy via Vite's `vite.config.ts` dev server headers and the production HTML `<meta>` tag:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss: https:; img-src 'self' data: blob:
```

- No inline scripts, no `eval`, no third-party JS — dramatically reduces XSS attack surface.
- `connect-src` allows WebSocket (relay) and HTTPS (API) connections.
- Works on localhost during development (CSP is origin-agnostic).

#### 11.3.6 What to never do

- **Never** store the raw key in localStorage, SolidJS store, or any persisted/reactive state — only the `ncryptsec`.
- **Never** pass the key through `createSignal` / `createStore` (reactive wrappers may clone/serialize).
- **Never** include the key in `console.error`, error messages, or telemetry payloads.
- **Never** convert the key to a hex string (use `Uint8Array` end-to-end).

### 11.4 Store and context

- **Store**: `authLoginState` supports `method: 'password_signer'` and `data: PasswordSignerData` (ncryptsec only). Persist in same blob; no plain key in storage.
- **Context**: When `method === 'password_signer'`, create provider from stored ncryptsec via factory function. Provider is always "logged in" (pubkey available), but signing requires password entry each time (auto-lock). Context can optionally prompt for password on `signEvent` calls.

### 11.5 UI

- **Settings / Auth**: Add a "Password Signer" or "Sign in with password" option (tab or flow).
  - **Unlock**: If stored ncryptsec exists, show password field → unlock → set provider in context.
  - **Setup**: "Create new key" (generate key, ask password twice, encrypt, save ncryptsec) or "Import ncryptsec" (paste, then set password for future unlocks or just store ncryptsec and use existing password).
- **Sign prompt**: When a sign is requested and key is locked (always, due to auto-lock), show a small password prompt modal/inline. On submit → unlock → sign → auto-lock → return result.
- **Security**: Never show or log the raw key; clear key from memory on lock/logout.

### 11.6 File layout (additive)

```
src/lib/nostr/
  ...
  PasswordSignerProvider.ts   # createPasswordSigner() factory, PasswordSigner type
  types.ts                    # + PasswordSignerData, + 'password_signer' in NostrProviderMethod
```

### 11.7 Passkey Signer (WebAuthn PRF + NIP-49) — Planned Provider

Use a **passkey** (biometric / security key) as a password replacement for NIP-49 decryption, via the WebAuthn [PRF extension](https://w3c.github.io/webauthn/#prf-extension) (`hmac-secret`).

#### 11.7.1 How it works

The PRF extension lets the relying party supply an arbitrary salt during both registration and authentication. The authenticator returns a **deterministic HMAC** derived from its internal secret + the salt. This output is stable across assertions for the same credential + salt, so it can be used as a symmetric key (or a password for scrypt).

**Registration (one-time setup):**

1. User clicks "Set up Passkey".
2. App generates a Nostr keypair (`generateSecretKey()` → secret + pubkey).
3. App calls `navigator.credentials.create()` with the PRF extension enabled:
   ```ts
   const credential = await navigator.credentials.create({
     publicKey: {
       // ...standard fields (rp, user, challenge, pubKeyCredParams)...
       extensions: {
         prf: {
           eval: { first: salt }, // salt = e.g. UTF-8 of "recall-trainer-nostr-key-v1"
         },
       },
     },
   });
   ```
4. Extract PRF output from `credential.getClientExtensionResults().prf.results.first` → 32 bytes.
5. Use these bytes as the `password` argument to `nip49.encrypt(secret, prfBytes)` → `ncryptsec`.
6. Store `ncryptsec` + `credentialId` (base64url) in `authLoginState.data`. Zero and drop the raw secret.
7. The Nostr keypair is now bound to this passkey.

**Signing (each time):**

1. App needs to sign → calls `navigator.credentials.get()` with PRF extension and the stored `credentialId`:
   ```ts
   const assertion = await navigator.credentials.get({
     publicKey: {
       allowCredentials: [{ id: credentialId, type: 'public-key' }],
       extensions: {
         prf: {
           eval: { first: salt }, // same salt as registration
         },
       },
     },
   });
   ```
2. User taps biometric / security key.
3. Extract PRF output → same 32 bytes as registration.
4. `nip49.decrypt(ncryptsec, prfBytes)` → raw secret key.
5. `finalizeEvent(event, key)` → signed event.
6. `key.fill(0); key = null` — auto-lock immediately.

The user never types a password. Touch ID / Face ID / security key tap replaces it entirely.

#### 11.7.2 Provider design

- **Method**: `'passkey_signer'` added to `NostrProviderMethod`.
- **Data**: `PasskeySignerData = { ncryptsec: string; credentialId: string; salt: string }`. Persisted in store.
- **Factory**: `createPasskeySigner(data: PasskeySignerData)` — closure-based, same pattern as password signer.
  - `unlock()`: calls `navigator.credentials.get()` with PRF → decrypt ncryptsec → set closure key. No password parameter needed.
  - `lock()`: `key.fill(0); key = null`.
  - `signEvent(params)`: unlock → sign → auto-lock → return result.
  - `getPublicKey()`: cached pubkey hex (derived on first unlock), always available.
  - `isReady()`: `true` (pubkey cached); signing triggers passkey prompt.
- **Relationship to Password Signer**: Passkey signer is a **peer** provider, not a subclass. Both store an ncryptsec; they differ only in how the decryption password is obtained (user-typed vs. PRF-derived). Internally they can share the sign + auto-lock + closure logic via a common helper (e.g. `createLocalSigner(ncryptsec, unlockFn)`).

#### 11.7.3 Browser support and fallback

| Browser         | PRF support         |
| --------------- | ------------------- |
| Chrome 116+     | Yes                 |
| Safari 18+      | Yes (macOS + iOS)   |
| Firefox         | Not yet             |
| Mobile Chrome   | Yes (Android 14+)   |
| Mobile Safari   | Yes (iOS 18+)       |

- **Feature detection**: Check `PublicKeyCredential` exists and, after a dummy `create()`, inspect `getClientExtensionResults().prf` for support.
- **Fallback**: If PRF is not available, hide the passkey option in UI and show only the password signer. Both produce the same ncryptsec format, so a key created with a password can later be "upgraded" to passkey (re-encrypt with PRF-derived bytes) and vice versa.

#### 11.7.4 Security notes

- PRF output is **deterministic per credential + salt** — if the credential is deleted from the authenticator, the ncryptsec becomes unrecoverable. The app should warn users to keep a password-based backup (or export the ncryptsec with a known password).
- The salt should be a fixed, app-specific string (e.g. `"recall-trainer-nostr-key-v1"`). Using a random salt per registration is fine but then the salt must be persisted alongside the credentialId.
- All security mitigations from §11.3 apply: closure key, `.fill(0)` auto-lock, CSP, never serialize the raw key.

#### 11.7.5 UX flow

- **Setup**: Settings → "Set up Passkey" → browser passkey creation prompt (biometric) → key generated + encrypted → done.
- **Sign**: Any action requiring signature → browser passkey assertion prompt (biometric tap) → sign → auto-lock. No typing, no modals.
- **Fallback prompt**: If passkey assertion fails or is cancelled, offer "Enter password instead" (requires the ncryptsec to also have a known password — dual-encryption or shared ncryptsec with password backup).

#### 11.7.6 File layout (additive)

```
src/lib/nostr/
  ...
  PasskeySignerProvider.ts    # createPasskeySigner() factory
  localSignerCore.ts          # shared closure + auto-lock logic (used by both password and passkey signers)
  types.ts                    # + PasskeySignerData, + 'passkey_signer' in NostrProviderMethod
```

### 11.8 Android Signer — NIP-55 Web Flow

Support [NIP-55](https://github.com/nostr-protocol/nips/blob/master/55.md#usage-for-web-applications) as an alternative to the QR / copy-paste Nostr Connect flow. On Android devices with a signer app installed (e.g. [Amber](https://github.com/greenart7c3/Amber)), the user taps a button and is redirected to the signer via the `nostrsigner:` URI scheme. The signer returns results via a **callback URL** or by **copying to clipboard**.

#### 11.8.1 How it works (web application flow)

NIP-55's web flow uses navigation (`window.location.href` or `<a href>`) to the `nostrsigner:` scheme. The signer app handles the intent, the user approves, and the result comes back via one of two mechanisms:

1. **Callback URL**: The app passes `callbackUrl=https://example.com/nostr-callback?event=` in the intent URL. The signer navigates to that URL with the result appended as a query parameter. The app reads it on page load.
2. **Clipboard fallback**: If no callback URL is provided, the signer copies the result to the clipboard. The app shows a "Paste result" field.

**Login (`get_public_key`):**

```
nostrsigner:?compressionType=none&returnType=signature&type=get_public_key&callbackUrl=https://app.example.com/nostr-callback?event=
```

Signer redirects back to: `https://app.example.com/nostr-callback?event=<hex_pubkey>`

**Signing (`sign_event`):**

```
nostrsigner:<encodedEventJson>?compressionType=none&returnType=signature&type=sign_event&callbackUrl=https://app.example.com/nostr-callback?event=
```

Signer redirects back to: `https://app.example.com/nostr-callback?event=<signature>`

With `returnType=event`, signer returns the full signed event JSON (optionally gzip-compressed with `compressionType=gzip`, prefixed with `Signer1`).

#### 11.8.2 Callback URL challenges

| Environment          | Callback works? | Notes |
| -------------------- | --------------- | ----- |
| Deployed HTTPS       | Yes             | Standard flow; signer navigates back to the origin. |
| localhost (dev)      | Unlikely        | Android signer can't navigate to `http://localhost:5173`. The device's browser would try to open it, but localhost refers to the phone itself, not the dev machine. |
| Installed PWA        | Depends         | If the PWA scope matches the callback URL and Android routes the URL to the PWA (via verified web app links / `assetlinks.json`), it may work. Otherwise the URL opens in the browser, not the PWA. Needs `"scope"` and `"start_url"` in `manifest.json` to match. |
| Clipboard fallback   | Always          | Works everywhere but requires user to manually paste. |

**Recommendation**: Use callback URL as the primary mechanism for deployed HTTPS origins. For localhost / PWA where callbacks are unreliable, fall back to **clipboard mode**: after redirecting to the signer, show a "Paste result from signer" input field when the user returns to the app.

#### 11.8.3 Provider design

- **Method**: `'nip55'` added to `NostrProviderMethod`.
- **Data**: `Nip55SignerData = { pubkey: string }`. Stored after initial `get_public_key`.
- **Nip55Provider** implements `NostrProvider`:
  - `getPublicKey()`: returns stored pubkey (no intent needed after login).
  - `signEvent(params)`: navigates to `nostrsigner:<event>?...&callbackUrl=...` → **returns a Promise** that resolves when the user comes back and the result is captured.
  - `hasCapability`: `signEvent` and `getPublicKey` true; `getRelays` false.
  - `isReady()`: `true` if pubkey is set.
  - `dispose()`: no-op.

**The async challenge**: Unlike other providers, `signEvent` causes a full page navigation away from the app. The Promise can't survive that. Two approaches:

1. **Pending-request persistence**: Before navigating, store `{ requestId, event, timestamp }` in localStorage. On page load, check for a callback query param. If found, match it to the pending request, resolve the operation, and clean up. The calling code needs to handle the fact that the result arrives on a fresh page load (e.g. the context re-initializes from persisted state and completes the pending sign).
2. **Popup / iframe** (fragile): Open the `nostrsigner:` URL in a popup or hidden iframe. This may not work reliably on Android since the OS intercepts the scheme at the navigation level.

**Recommendation**: Use approach 1 (pending-request persistence). Add a `/nostr-callback` route (or check for `?event=` on any route) that captures the result and resumes the flow.

#### 11.8.4 Callback route

Add a lightweight route or startup check:

```ts
// In App.tsx or router setup — on every page load:
function checkNip55Callback() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get('event');
  if (!result) return;

  const pending = localStorage.getItem('nip55_pending_request');
  if (!pending) return;

  const { requestId, type } = JSON.parse(pending);
  // Store the result so the context can pick it up
  localStorage.setItem('nip55_result', JSON.stringify({ requestId, type, result }));
  localStorage.removeItem('nip55_pending_request');

  // Clean the URL
  const url = new URL(window.location.href);
  url.searchParams.delete('event');
  window.history.replaceState({}, '', url.toString());
}
```

The auth context checks for `nip55_result` on init and completes the pending operation.

#### 11.8.5 Platform detection and UI

- **Show only on Android**: Detect via `navigator.userAgent` containing `Android`. Hide the option entirely on iOS/desktop where `nostrsigner:` has no handler.
- **UI in NostrConnectAuth**: Add an "Open Android Signer" button (or a tab alongside the QR code). When tapped:
  1. Generate the `nostrsigner:` URL for `get_public_key` (login) or `sign_event`.
  2. Store the pending request in localStorage.
  3. Navigate via `window.location.href = url`.
- **Clipboard fallback UI**: If callback URL is unreliable (e.g. PWA detected), show a text input after the user returns: "Paste the result from your signer app". Parse and proceed.

#### 11.8.6 Encryption support (optional, future)

NIP-55 also supports `nip04_encrypt`, `nip04_decrypt`, `nip44_encrypt`, `nip44_decrypt` via the same intent pattern. These could be added later if the app needs encryption (e.g. for DMs or NIP-46 tunneling). Out of scope for initial implementation — focus on `get_public_key` and `sign_event`.

#### 11.8.7 File layout (additive)

```
src/lib/nostr/
  ...
  Nip55Provider.ts            # Nip55Provider class, buildNip55Uri(), pending-request helpers
  types.ts                    # + Nip55SignerData, + 'nip55' in NostrProviderMethod
src/components/
  NostrConnectAuth.tsx        # + "Open Android Signer" button (conditional on Android)
```

---

## 12. Future Extensions (out of scope for initial task)

- **NIP-07**: New provider class + “Extension” tab or button; context chooses provider by method.
- **nsec / NIP-46**: Same pattern: new provider, new UI tab or flow, same `NostrProvider` interface and store `authLoginState.method`.
- **Modal**: When an action requires auth, call `requestLogin(intent)` from context; open a modal that renders the same NostrConnectAuth (or tabs for multiple methods) and resolve the promise on success/cancel.

---

## 13. What we do not copy from bitcoin-son-dakika

- React components (AuthModal, LoginForm, Nip07Auth, SignupForm).
- Full React NostrAuthContext (logic is reimplemented in Solid).
- Generic `cache.ts` (persist only via `store.ts`).
- App-specific strings (bitcoinsondakika.com, Turkish-only copy); we use i18n and “Recall Trainer”.
