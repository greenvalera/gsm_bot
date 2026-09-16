---
status: testing
phase: 06-localization-foundation-and-ukrainian-onboarding
source: [06-VERIFICATION.md]
started: 2026-09-16T22:05:00Z
updated: 2026-09-16T22:05:00Z
---

# Phase 6 Native Telegram Acceptance

## Current Test

number: 1
name: Ukrainian wording and Telegram control legibility
expected: |
  Setup, settings and roster copy is natural informal Ukrainian. Approved vocabulary, corrective examples, bilingual language navigation and long policy buttons are readable and understandable in Telegram.
awaiting: user response

## Tests

### 1. Ukrainian wording and Telegram control legibility

expected: Setup, settings and roster copy is natural informal Ukrainian; approved vocabulary, corrective examples, bilingual language navigation and long policy buttons are readable and understandable. Assess the actual Telegram client; automated catalog and payload checks do not establish this result.
result: [pending]

### 2. Complete onboarding and language-switch continuity in the authorized test chat

expected: Choose Ukrainian before configuration; complete setup, edit settings and add/remove a roster member. Language changes confirm in the new language; selecting the same language has no extra visible confirmation. An older-language prompt or open settings/removal confirmation remains usable and produces current-language output. Use the project telegram-web-uat skill, preserve existing scoped waivers, and restore test fixtures as required.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

None reported. These pending native checks are not implementation failures or automated passes.
