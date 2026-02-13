# TODO — Recall Trainer

Check AGENTS.md for the requirements.

## Phase 1 — Core Application

- [ ] **Word Entry — Paste option:** Allow pasting notes (one per line: source | target).
- [ ] **Word Entry — Expandable row:** Add a ">" button per entry row. When expanded, show a details row with a table: columns **Direction** | **Next review** | **Level** | **Errors**; two data rows (Source→Target, Target→Source). Format next review as "Due in X days" (or "Due today" / "Due tomorrow"). Remove the entry-level Error count column from the main table.
- [ ] Configurable "correct answers before removal" (optional).
- [ ] Routing between screens (e.g. `@solidjs/router`).
- [ ] Mobile-first layout, consistent spacing, accessible form inputs, inline validation.

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
