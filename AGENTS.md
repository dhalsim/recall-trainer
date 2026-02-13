## 📌 MASTER PROMPT (English)

You are a senior frontend engineer. Build a small but well-architected language learning web application using **SolidJS + TypeScript + TailwindCSS v4**.

This app is a **vocabulary recall trainer** focused on active recall and error-based repetition. It must be production-quality, clean, and easy to extend.

---

## 🌍 App Flow

1. **Language Selection**
   * User selects:
     * Main (native) language
     * Target (learning) language
   * For now, only these pairs are supported:
     * English ↔ Japanese
     * Turkish ↔ Japanese

2. **Mode Selection**
   After language selection, show two options:
   * “Enter words I struggle with”
   * “Take a test”

3. **Word Entry Mode**
   * User enters vocabulary pairs (one per line)
   * Each entry contains:
     * Source language
     * Target language
   * Validate input format in the UI
   * Store entries in global state with LocalStorage persistence

4. **Test Mode**
   * Split the list into two internal lists:
     * Source → Target
     * Target → Source
   * Quiz logic:
     * Ask 5 questions per round
     * If user answers correctly → remove item from that list
     * If incorrect → keep it
   * After finishing Source → Target:
     * Switch direction
     * Ask questions **from the end of the list** (reverse order)
   * Continue until both lists are empty
   * After each round:
     * Show incorrect answers
     * Show the correct answers with a short explanation placeholder
   * Keep track the number of correct and incorrect answers of the questions.
---

## 🧠 Core Learning Rules

* Correct answers are removed immediately (or after a certain number of correct answers, which can be configured by user)
* Incorrect answers stay in the list
* Direction alternates between rounds
* Reverse-order questioning is required to reduce short-term memorization
* This logic must be deterministic and state-driven

---

## 🧩 Technical Requirements

### Framework & Tooling

* SolidJS
* TypeScript (strict mode enabled)
* TailwindCSS **v4 classes only**
* Vite + VitePWA
* Mobile-first responsive design

### State Management

* Global app state in `store.ts`
* Persist state using LocalStorage
* **Versioning and migrations:** use a schema version (e.g. `SETTINGS_VERSION` in `store.ts`). When loading, if stored version is older, run client-side migrations then persist; if missing or newer, fall back to default state. For the exact migration pattern (one step per version, loop until current, keep all migration functions), see **`.cursor/rules/state-migrations.mdc`**.
* All state access must be type-safe

### i18n
* Use **i18n-js**
* Provide locale files (e.g. `english.json`, `turkish.json`) under `src/i18n/`
* For translation key format (full English sentences, keys = values in `english.json`), see **`.cursor/rules/i18n.mdc`**

---

## 🎨 UI / UX

* Mobile-first
* Consistent spacing and color scheme
* Custom theme defined in `tailwind.config.ts`
* Clear visual hierarchy
* Accessible form inputs
* Validation feedback shown inline

---

## 🛠 Code Quality Rules

* Use early returns on error conditions
* Validate user input inside UI components
* Log errors to `console.error` with context
* Use strict null checks (`--strictNullChecks`)
* Avoid unnecessary re-renders
* Prefer small, focused components

---

## 📦 PWA Requirements

* Installable
* Fullscreen mode
* Offline-capable
* App icon and manifest included

---

## 🧹 Prettier Configuration

```json
{
  "$schema": "https://json.schemastore.org/prettierrc",
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

---

## 🧹 ESLint Configuration

```ts
import eslint from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-plugin-prettier';
import solid from 'eslint-plugin-solid';
import tseslint from 'typescript-eslint';

const solidRecommendedRules =
  solid.configs?.['flat/typescript']?.rules ??
  solid.configs?.['typescript']?.rules ??
  solid.configs?.['recommended']?.rules ??
  {};

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'public/**', 'deps/**', 'node_modules/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      import: importPlugin,
      prettier,
      solid,
    },
    settings: {
      'import/resolver': {
        typescript: true,
      },
    },
    rules: {
      ...solidRecommendedRules,
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      curly: ['error', 'all'],
      'prettier/prettier': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: false,
          fixStyle: 'separate-type-imports',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
```

---

## ✅ Final Expectations

* Clean project structure
* Clear separation of logic, UI, and state
* Ready to extend with AI explanations later
* No mockups needed, but UX must feel intentional
* Output production-ready code

---

## Phase 2 — AI Features (Powered by Routstr)

### Overview

AI features are **optional, paid, and usage-based**, powered by **Routstr** as a payment-aware AI proxy.

The application **does not require subscriptions**.
AI usage is billed **per request**, backed by **Cashu eCash tokens**, using a **pay-as-you-go** model.

All AI functionality must be:
* Explicitly user-initiated
* Cost-transparent
* Hard-limited by user-defined spending caps

---

## AI Capabilities (Phase 2)

### 1. Automatic Translation on Word Entry

* When the user enters a word or sentence, AI can:
  * Detect language
  * Generate translation
  * Optionally add example usage
* Triggered explicitly by user (e.g. “Translate with AI”)

---

### 2. Mistake Explanation & Chat-Based Help

* Explain why an answer is wrong
* Compare correct vs incorrect forms
* Allow follow-up questions in a mini chat thread
* Each explanation is an **AI call**

---

### 3. Contextual Suggestions

* Suggest:
  * Related vocabulary
  * Example sentences
  * Similar grammar patterns
* Based on:
  * User’s mistakes
  * Current study topic
* Suggestions are optional and paid

---

### 4. Custom User Prompts

* Users can define personal AI prompts, e.g.:
  * “Explain grammar like I’m a beginner”
  * “Use Turkish explanations”
* Prompts are stored locally
* Each AI call selects the relevant prompt template, like translations and general chat discussions would have different prompts.

---

## AI Provider Integration (Routstr)

### API Compatibility

* Routstr is treated as a **drop-in OpenAI replacement**
* Uses OpenAI-compatible endpoints:
  * `chat.completions`
* All AI calls go through a dedicated AI service module

---

## Model Selection Strategy

### Default (Recommended)

* The application **automatically selects the best model per task**
  * Example:
    * Translation → cheaper / faster model
    * Grammar explanation → higher reasoning model
* This minimizes cost for the user

---

### Optional: User Model Selection

* Advanced users may override model selection
* UI allows:
  * Viewing available models
  * Selecting a preferred model per feature or globally
* UI must clearly show:
  * Relative cost indicators (cheap / medium / expensive)
  * Warning when selecting higher-cost models

---

## Spending Control & Cost Transparency

### Per-Conversation Spending Cap

* Users must be able to set:
  * A **maximum amount per AI conversation/session**
* AI calls **must stop automatically** when the cap is reached
* No silent over-spending allowed

---

### Live Cost Tracking

* UI must display:
  * Total cost spent in current conversation
  * Remaining available balance
* Cost updates **after each AI response**
* Visual indicator (progress bar or numeric display)

---

### Safety Rules

* If balance or conversation limit is insufficient:
  * AI call is blocked
  * User sees a clear message explaining why
* No partial calls

---

## Wallet & Payment Model

* AI usage is backed by:
  * Cashu eCash tokens
  * Routed through Routstr
* App does **not** manage Bitcoin logic directly
* Wallet logic must be isolated from core app logic

---

## Technical Constraints

* AI logic must live in a dedicated module (e.g. `src/ai/`)
* All AI calls must:
  * Validate balance and limits before request
  * Return early on error
  * Log errors with contextual metadata
* No AI calls during app startup
* No background AI calls without user intent

---

## UX & Trust Principles

* AI usage is always optional
* Cost is always visible
* User stays in control:
  * Model
  * Limits
  * When AI is used
* No “magic” AI actions without consent

---

## Non-Goals (Explicitly Out of Scope for Phase 2)

* Auto-triggered AI without user action
* Subscriptions
* Credit card payments
* Background AI analysis
