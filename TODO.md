# TODO — Recall Trainer

Check AGENTS.md for the requirements.

## Phase 1 — Core Application

### Project Setup

- [x] Add TailwindCSS v4 (`@tailwindcss/vite`, `tailwindcss`) and configure in `vite.config.ts`.
- [x] Add custom theme in `tailwind.config.ts` (Tailwind v4 uses `@theme` in `src/index.css`)
- [x] Configure VitePWA (`vite-plugin-pwa`) — installable, fullscreen, offline, app icon & manifest
- [x] Add ESLint config per AGENTS.md
- [x] Add Prettier config per AGENTS.md
- [x] Run `npm install` and verify build

### State & i18n

- [x] Create `src/store.ts` — global state with LocalStorage persistence
- [x] Add `SETTINGS_VERSION` constant for migration/reset on version mismatch
- [x] Create `src/i18n/` — i18n-js setup with `english.json` and `turkish.json`
- [x] Enforce translation key rule: full English sentences, keys = values in `english.json`

### Screens & Flow

- [x] **Language Selection** — select main (native) and target (learning) language
  - Supported pairs: English ↔ Japanese, Turkish ↔ Japanese
- [x] **Mode Selection** — two options after language selection
  - "Enter words I struggle with"
  - "Take a test"
- [x] **Word Entry Mode** — vocabulary pairs (source + target)
  - Default: two-column layout (source | target side by side)
  - Validate input format in UI
  - Persist via store/LocalStorage
- [ ] **Word Entry Mode — Paste option** — allow pasting notes (one per line: source | target)
- [x] **Test Mode** — full quiz flow
  - Split list into Source→Target and Target→Source
  - 5 questions per round (or whatever left in the list)
  - Correct → remove from list; incorrect → keep
  - Alternate direction between rounds; reverse order when switching
  - Round summary: show incorrect answers + correct answers with explanation placeholder
  - Track correct/incorrect counts

### Learning Logic

- [ ] Configurable "correct answers before removal" (optional)
- [ ] Deterministic, state-driven quiz logic
- [ ] Routing between screens (e.g. `@solidjs/router`)

### UI / UX

- [ ] Mobile-first layout
- [ ] Consistent spacing and color scheme
- [ ] Clear visual hierarchy
- [ ] Accessible form inputs
- [ ] Inline validation feedback

---

## Test flow redesign (current priority)

**Problem:** With one entry, after answering Source→Target correctly the app can go back to the "Start test?" screen instead of continuing to Target→Source. Desired flow: fixed batch, S→T then T→S, immediate feedback per answer, repeat until no incorrect, then final summary.

### Plan

1. **Fix “back to step 2” bug**
   - Ensure after a round we always transition to the next round (T→S) or to finished, never to idle, when there are still entries to practice in the other direction.
   - Option: persist “test in progress” (batch + direction + index) in store so test state survives any re-render/unmount; or audit all transitions so we never set `phase` to `idle` during a session.

2. **New test flow (parameterized batch, immediate feedback)**
   - **Batch size:** Take up to N entries for the test (N default 5; later make it a user setting in store/settings).
   - **Step 1:** User clicks “Take a test”.
   - **Step 2:** Algorithm picks up to N entries that need practice (either direction); this is the **fixed batch** for the whole session.
   - **Step 3:** Ask each entry in the batch **Source → Target**. After **each** answer:
     - Show immediately whether the answer is correct or not.
     - If incorrect: show the correct answer; update entry (recordAnswer).
     - Then go to next question or to step 4.
   - **Step 4:** Ask the same batch **Target → Source** (same per-answer feedback).
   - **Step 5:** “Continue with step 3 until we finish all incorrect” = among the batch, keep only entries that are still incorrect in either direction; do another round of S→T for those, then T→S for those; repeat until every entry in the batch is correct in both directions (or we hit a max rounds cap to avoid infinite loop).
   - **Step 6:** Show **final summary**: total correct / incorrect for the session, then “Go back” button.

3. **Store structure (optional refactor — see `store.ts` VocabEntryV2 / SourceOrTarget)**
   - **Idea:** `VocabEntry` has `source` and `target` as objects: `{ text: string, correct: boolean, errorCount: number }`. So each “side” has its own correctness and error count (source = S→T stats, target = T→S stats). Symmetric and clear.
   - **Recommendation:** Implement the new test flow first with the **current** store shape (`correctSourceToTarget`, `correctTargetToSource`, single `errorCount`). Once the flow is stable, consider migrating to the per-side structure as **SETTINGS_VERSION 3** (new type, migration from v2, update WordEntry + TestMode to use `entry.source.text` / `entry.target.text` and the two correct/errorCount fields). This keeps one big change at a time.

### Concrete TODO items

- [x] **Fix return-to-idle:** Prevent test from showing “Start test?” again mid-session (audit phase transitions; optionally persist test session in store).
- [ ] **Parameterized batch size:** Add a constant or store setting `questionsPerSession` (default 5); use it when building the batch for “Take a test”.
- [ ] **Immediate feedback:** After each answer, show a short “Correct” / “Incorrect — correct answer: X” screen (or inline), then auto-advance or “Next” to the next question.
- [ ] **Fixed batch for session:** When user clicks “Take a test”, select up to N entries once; run all S→T questions for that batch, then all T→S for that batch; then re-filter to “still incorrect in either direction” and repeat S→T and T→S until batch is fully correct or max rounds.
- [ ] **Final summary:** After session ends, show total correct/incorrect and “Go back” (already partially there; ensure it matches the new flow).
- [ ] **(Optional later)** Store refactor to per-side `source`/`target` objects (SETTINGS_VERSION 3, migration, update UI).

### Batch progress UX (current flow)

- [x] **Batch and word counts:** At test start, show total batches and total words (e.g. "5 batches, 24 total words"). During the test, show which batch the user is in (e.g. "Answering batch #2" / "Batch 2 of 5").
- [x] **Words left:** Show how many words remain to practice (e.g. "18 left") so progress is clear as correct answers remove items.
- [x] **Next Batch button:** After each round summary, show "Next Batch" (instead of "Next round") to continue to the next batch.

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
