# Study Sets Proposal (Nostr-based)

## Product Goal

A Study Set is a themed study-item bundle created by an author and discoverable by users. Users can filter by language pair, tags, and level, then import free sets.

Each Study Set is represented as an **addressable event** (`30000 <= kind < 40000`) with a unique `d` tag per set.

---

## Core Data Model

### StudySet

- `id`: string (derived from event address)
- `name`: string
- `author`: pubkey
- `mainLanguage`: string
- `targetLanguage`: string
- `tags`: string[] (e.g. `sports`, `food`)
- `description`: string
- `level`: number (1-10)
- `numberOfItems`: number
- `content?`: StudyItem[] (optional in public event)
- `createdAt`: number
- `updatedAt`: number

### StudyItem

- `id`: string
- `type?`: `'vocab' | 'phrase' | 'qa' | 'cloze'` (optional, default: `vocab`)
- `description?`: string
- `hints?`: string (markdown)
- `source`: string
- `target`: string
- `acceptedAnswers?`: string[]

---

## Nostr Event Design (Recommended)

### Kind model

Study Sets use **addressable events** (`30000 <= kind < 40000`) so each set has its own `d` tag.

### Public set metadata event

- Kind: app-specific addressable kind (example: `39001`)
- Address key: `d` tag, e.g. `studyset:<slug-or-uuid>`
- Content: JSON metadata
- For free sets: may include full `content` directly

Suggested tags:

- `["d", "studyset:<id>"]`
- `["title", "<name>"]`
- `["main_lang", "<code>"]`
- `["target_lang", "<code>"]`
- `["level", "<1-10>"]`
- `["t", "sports"]` (repeatable)

---

## Reviews

Use NIP-22 comments (`kind:1111`) linked to the Study Set root event:

- Root scope tags (`A`/`E` + `K`)
- Parent scope tags (`a`/`e` + `k`)
- Author tags (`P` and `p`) when applicable
- Optional rating tag, e.g. `["rating", "1-5"]`

This supports top-level reviews and replies in threads.

Suggested review payload fields:

- `content`: string (review text)
- `rating?`: number (optional, e.g. 1-5)

---

## Weaknesses in Current Idea

1. **Review abuse risk**  
   NIP-22 comments can be spammed/sybil-attacked without moderation or weighting.

2. **Content quality consistency**  
   Free community sets may vary in quality; curation/moderation policies are needed.

---

## Recommended Alternatives / Improvements

1. **Define a strict app-level JSON schema**  
   Include `schemaVersion`, `setVersion`, `checksum`, and validation rules.

2. **Add authenticity checks in client**  
   Always verify the set event author when importing and updating sets.

---

## Suggested Minimal v1 Scope

- Public discoverable metadata sets (addressable kind + tags + level + language pair)
- Free sets: import directly from event content
- NIP-22 reviews on root set event

---

## Future Ideas (Out of Current Plan)

These are intentionally **not** part of the current plan/schema.

### Paid / Locked Sets (Later Phase)

- Optional fields for future schema: `locked`, `priceSats`, `paymentMethods`
- Support payment paths:
  - Lightning zap ([NIP-57](https://nips.nostr.com/57))
  - Nutzap ([NIP-61](https://nips.nostr.com/61))
  - Out-of-band payment (non-Nostr)
- Manual fulfillment first: author verifies payment and sends set content privately
- Possible private delivery mechanism: NIP-17 DM with JSON payload ([NIP-17](https://nips.nostr.com/17))

### Possible v2/v3 Improvements

- Entitlement records + re-delivery support across devices
- Optional automation of payment verification and content delivery
- Paid-set update policy (free updates vs paid major upgrades)
- Seller reputation and anti-spam weighting for reviews

---

## My Opinion

This feature is strong and fits your product very well: it adds discoverability, social distribution, and monetization without blocking the core trainer loop.

The biggest architectural decision is **not** naming; it is choosing a robust event model. If you switch to addressable events now and define clear JSON schemas + versioning + entitlement semantics, you avoid most painful migrations later.

For “specialized kind for private delivery”: yes, you can design app-specific semantics, but for compatibility and simpler implementation, shipping the payload in NIP-17 kind-14 encrypted DM content is the most practical v1 path.

---

## References

- [NIP-17 Private Direct Messages](https://nips.nostr.com/17)
- [NIP-22 Comments](https://nips.nostr.com/22)
- [NIP-57 Lightning Zaps](https://nips.nostr.com/57)
- [NIP-61 Nutzaps](https://nips.nostr.com/61)
