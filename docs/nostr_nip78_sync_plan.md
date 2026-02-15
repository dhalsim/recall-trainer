---
name: Nostr NIP-78 Sync
overview: Sync recall-trainer app state to Nostr relays using NIP-78 (kind 30078) as addressable app data. Requires Nostr auth; uses created_at to decide pull vs push; keeps a local backup before overwriting.
todos:
  - id: nip78-sync-meta
    content: Add sync metadata (lastSyncedEventCreatedAt) in localStorage, separate from app state
    status: pending
  - id: nip78-sync-lib
    content: Create src/lib/nostr/nip78-sync.ts — fetch latest 30078, build/sign/publish, merge logic
    status: pending
  - id: nip78-backup
    content: Before applying remote state, backup current state to recall-trainer-state-backup (or timestamped)
    status: pending
  - id: nip78-sync-ui
    content: Add Sync button/section in Settings; trigger pull/push from UI; show last sync time/error
    status: pending
  - id: nip78-relay
    content: Use relay from auth (Nostr Connect), NIP-65 user relays (nip65.ts), or user-set storage relay
    status: pending
  - id: nip65-module
    content: Use nip65.ts to fetch user relays from PROFILE_RELAYS; pool (singleton) and cache (separate from store) TBD
    status: pending
  - id: nip78-i18n
    content: Add i18n keys for sync UI (en, tr, ja)
    status: pending
isProject: false
---

# Nostr NIP-78 Sync (Kind 30078)

Sync app state to Nostr so the user can have the same vocabulary and settings across devices. [NIP-78](https://nips.nostr.com/78) specifies arbitrary custom app data using **addressable events** (kind `30078`). Relays treat replaceable events (kinds 30000–39999) as versioned by `kind` + `d` tag: publishing again with the same `d` replaces the previous event.

---

## 1. Event shape

| Field     | Value |
|----------|--------|
| `kind`   | `30078` |
| `d`      | `"recall-trainer-sync-data"` |
| `content`| Stringified JSON of the **sync payload** (see below). |
| `tags`   | Optional (e.g. app version, schema version). |
| `created_at` | Unix timestamp. Used to decide pull vs push. |

Only the author’s pubkey (from Nostr auth) is used; no other tags are required for addressing. **Nostr auth is required** for both fetching (optional: restrict to own events) and publishing (sign with user’s key).

---

## 2. Sync payload (whitelist)

Use a **whitelist approach**: the sync payload type **explicitly includes** only the properties that are allowed to be synced. Any future `AppState` property must be **explicitly added** to the payload type and to the serialization/apply logic; nothing is synced by default. This is the safest option and avoids accidentally syncing sensitive or device-local fields.

**Whitelist (current):**

| Property | Included | Notes |
|----------|----------|--------|
| `version` | ✅ | Schema version for migrations. |
| `mainLanguage` | ✅ | |
| `targetLanguage` | ✅ | |
| `languageSelectionComplete` | ✅ | |
| `screen` | ✅ | |
| `entries` | ✅ | Full vocabulary + review state. |
| `questionsPerSession` | ✅ | |
| `simulationMode` | ✅ | |
| `simulationDate` | ✅ | |
| `appLocale` | ❌ | Device-local UI preference; do not sync. |
| `authLoginState` | ❌ | Sensitive; never sync. |

Define a type `Nip78SyncPayload` with only the whitelisted keys (and the same value types as in `AppState`). When building the payload: copy only those keys from current state. When applying: merge payload into local state **only for whitelisted keys**, then run the same validation/migrations as in `loadState()` (version check, migration loop, merge with defaults), then `saveState(merged)`.

**Adding a new synced field later:** Add the property to `Nip78SyncPayload`, to the serialization step (copy from state), and to the apply step (write into state). If a new `AppState` field should stay device-local, do not add it to the payload.

---

## 3. Sync metadata (local only)

Store **sync metadata** separately from the main app state so it is not overwritten by migrations and is clearly “our sync cursor”:

- **Storage key:** e.g. `recall-trainer-sync-meta`.
- **Shape:** `{ lastSyncedEventCreatedAt: number }` (Unix timestamp of the event we last reconciled with — either the one we pushed or the one we pulled).

Do **not** put this in the NIP-78 payload; it is device-local. When we pull, set `lastSyncedEventCreatedAt = event.created_at`. When we push, set `lastSyncedEventCreatedAt = publishedEvent.created_at`.

---

## 4. Pull vs push (created_at)

1. **Require Nostr auth.** If not logged in, show “Sign in with Nostr to sync” and do nothing.
2. **Resolve relay.** Use relay from Nostr Connect auth, or a user-setting “storage relay” (e.g. same as in `NostrConnectAuth`).
3. **Fetch latest.** Query relay for `kind: 30078`, `#d: "recall-trainer-sync-data"`, author = user’s pubkey. Take the event with the largest `created_at` (or the only one).
4. **Decide:**
   - **No remote event** → **Push**: serialize current state (sync payload), build event, sign, publish, then set `lastSyncedEventCreatedAt = event.created_at`.
   - **Remote event exists:**
     - If `event.created_at > lastSyncedEventCreatedAt` → **Pull**: backup local state (see below), parse `event.content`, validate/migrate, `saveState(merged)`, set `lastSyncedEventCreatedAt = event.created_at`.
     - Else → **Push**: consider local the source of truth (or in sync); publish replace event (same kind + d), then set `lastSyncedEventCreatedAt = newEvent.created_at`.

So: **newer on relay → pull; otherwise → push.** Relays keep replaceable-event history; we only use the latest.

---

## 5. Backup before overwrite

Before **applying remote state** (pull path):

1. Read current state from localStorage (`recall-trainer-state`).
2. Write backup, e.g. `localStorage.setItem('recall-trainer-state-backup', currentStateJson)` or `recall-trainer-state-backup-<timestamp>` if you want multiple backups.
3. Then parse remote content, merge/migrate, and `saveState(merged)`.

Optionally: one backup slot is enough; overwrite it each time we pull. Or keep a timestamped key and cap the number (e.g. keep last 3). Plan can leave this as “single backup key” for simplicity.

---

## 6. Replaceable event (same kind + d)

For kind `30078`, relays that support replaceable events (NIP-33) will keep only the latest event per (pubkey, kind, d). So we **publish one event** with `kind: 30078`, `d: "recall-trainer-sync-data"`, and updated `content` + `created_at`. No need to delete the old one; the relay replaces it. Versions/history are handled by the relay.

---

## 7. nip78.ts — subscription for live updates

**File:** `src/lib/nostr/nip78.ts`

Use this module to **subscribe** to kind 30078 sync events so the app can react when a newer event arrives (e.g. from another device) without polling. It compares each event’s `created_at` with a cached value and only notifies when the event is newer.

**API:**

- **`subscribeKind30078SyncEvents(pool, relays, pubkey, getCachedCreatedAt, onUpdate)`**  
  - **pool** — Relay pool (e.g. `SimplePool` from nostr-tools).  
  - **relays** — List of relay URLs to subscribe to (e.g. from NIP-65 or auth).  
  - **pubkey** — Author pubkey (own sync data).  
  - **getCachedCreatedAt** — `() => number | null`. The `created_at` of the event we already have (e.g. from sync metadata). If the incoming event’s `created_at` is not greater than this, `onUpdate` is not called.  
  - **onUpdate** — `(event: EventItem) => void`. Called when a newer event is received (at most once per event id, deduped across relays).  
  - **Returns** — Unsubscribe function (call to close the subscription).

- **`EventItem`** — `Event & { relays: string[] }` (event plus the list of relays that delivered it).

- **Filter** — Subscribes to `kind: 30078`, `#d: ["recall-trainer-sync-data"]`, `authors: [pubkey]` (d-tag constant is internal in nip78.ts).

**Usage in nip78-sync / UI:**

1. When the user is logged in and sync is enabled, call `subscribeKind30078SyncEvents` with the app’s pool, the relays to use (e.g. NIP-65 read relays), the user’s pubkey, and `getCachedCreatedAt: () => getSyncMeta()?.lastSyncedEventCreatedAt ?? null`.  
2. In `onUpdate`, backup local state (same as pull path), apply `event.content` (parse, validate/migrate, save), then update sync metadata with `event.created_at`.  
3. Store the returned unsubscribe function and call it on logout or when disabling sync (or when the component unmounts).

This gives **live sync**: as soon as another device publishes a new 30078 event, the subscription fires and the app can pull and apply it (with backup) and update the cache, so no manual “Sync” is required for incoming changes.

---

## 8. Implementation outline

| Step | Action |
|------|--------|
| 1 | Add `src/lib/nostr/nip78-sync.ts`: `getSyncMeta()`, `setSyncMeta()`, fetch/build/sign/publish, pull/push. Use **nip78.ts** for one-off fetch and/or live subscription (see §7). |
| 2 | In sync module: before applying remote content, read current state, write to `recall-trainer-state-backup`, then apply and save. Same backup step when applying an event from **nip78.ts** `onUpdate`. |
| 3 | Settings (or dedicated screen): Sync button; call `syncWithRelay(…)`. Optionally start **nip78.ts** subscription for live updates (unsubscribe on logout/disable). Show last sync time, errors, Restore from backup. |
| 4 | Relay: use `authLoginState` when Nostr Connect; else NIP-65 via `nip65.ts` or user storage relay. Pass same pool and relay list to **nip78.ts** when using the subscription. Pool/cache TBD. |
| 5 | i18n: strings for “Sync with Nostr”, “Last synced”, “Sign in to sync”, “Restore from backup”, errors. |

---

## 9. Relay discovery (NIP-65)

**File:** `src/lib/nostr/nip65.ts`

Fetch the user's declared relays (NIP-65, kind `10002`) from a set of **hardcoded profile relays** (e.g. `purplepag.es`, `relay.nos.social`, `user.kindpag.es`, `relay.nostr.band`). The module exposes:

- `fetchNip65Relays(cache, pool, pubkey, sendOnce, onUpdate)` — fetches the latest kind-10002 event from the profile relays and returns `Nip65Relays` (read/write/flat lists).
- Types: `Nip65Relays`, `Nip65Pool` (injectable). Caching is built-in: localStorage key `nip65-relays-${pubkey}`.

**Pool and cache:** Prefer a **singleton relay pool** for the app. NIP-65 cache is built into `nip65.ts` (localStorage key `nip65-relays-${pubkey}`), separate from app state.

Sync can then prefer: (1) relay from Nostr Connect auth, (2) user's NIP-65 write relays for publishing and read relays for fetching, (3) user-configured storage relay.

---

## 10. Edge cases

- **Parse error on remote content:** Don’t overwrite local; show error; leave backup as-is.
- **Migration needed:** Run the same `migrateToLatest` (and merge with default) as in `loadState()` before saving.
- **Conflict:** We don’t merge two different states; we use “newer wins” by `created_at`. Optional future: show “Remote is newer / Local is newer” and let user choose.
- **Multiple devices:** Last writer wins; each device updates `lastSyncedEventCreatedAt` after push or pull so the next sync still compares correctly.

---

## 11. Files to add/change

| File | Change |
|------|--------|
| `src/lib/nostr/nip78-sync.ts` | New: sync meta, fetch, build, sign, pull/push, backup-before-apply. Can use nip78.ts for fetch/subscription. |
| `src/lib/nostr/nip78.ts` | **Exists.** Subscription to kind 30078 sync events; compare `created_at` with cache, call onUpdate only when newer. Use for live sync (see §7). |
| `src/lib/nostr/nip65.ts` | Fetch NIP-65 relays from PROFILE_RELAYS; built-in cache (localStorage `nip65-relays-${pubkey}`); pool injectable. |
| `src/store.ts` | No change to version/migrations; sync uses existing `loadState`/`saveState` shape. Optionally expose `getStateSnapshot()` / `applyStateSnapshot()` if you don’t want the sync module to touch localStorage directly. |
| Settings (or sync screen) | Button + relay input (if not from auth) + last sync time + error message. |
| i18n | New keys for sync and backup. |

This keeps the sync logic in one place, uses NIP-78 as specified, relies on `created_at` for pull vs push, and keeps a local backup before overwriting.
