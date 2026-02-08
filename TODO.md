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
- [ ] **Word Entry Mode** — vocabulary pairs (one per line, source + target)
  - Validate input format in UI
  - Persist via store/LocalStorage
- [ ] **Test Mode** — full quiz flow
  - Split list into Source→Target and Target→Source
  - 5 questions per round
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

## Phase 2 — AI Features (Later)

- [ ] AI module in `src/ai/` for Routstr integration
- [ ] Automatic translation on word entry ("Translate with AI")
- [ ] Mistake explanation & chat-based help
- [ ] Contextual suggestions (related vocab, examples, grammar)
- [ ] Custom user prompts (stored locally)
- [ ] Per-conversation spending cap
- [ ] Live cost tracking in UI
- [ ] Wallet / payment model (Cashu eCash via Routstr)
