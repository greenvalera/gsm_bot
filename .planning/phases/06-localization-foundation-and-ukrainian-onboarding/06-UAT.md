---
status: testing
phase: 06-localization-foundation-and-ukrainian-onboarding
source: [06-VERIFICATION.md]
started: 2026-09-16T22:05:00Z
updated: 2026-09-16T23:05:00Z
---

# Phase 6 Native Telegram Acceptance

## Current Test

number: 2
name: Continue native Ukrainian onboarding after location handoff
expected: |
  In GSM_bot_test_group_1, reply to the bot's Step 1 of 8 prompt with a public Kyiv location from mobile Telegram as actor A, then continue the Ukrainian wizard through review and save.
awaiting: user location reply; Telegram Web K has no location attachment control

## Tests

### 1. Ukrainian wording and Telegram control legibility

expected: Setup, settings and roster copy is natural informal Ukrainian; approved vocabulary, corrective examples, bilingual language navigation and long policy buttons are readable and understandable. Assess the actual Telegram client; automated catalog and payload checks do not establish this result.
result: [pending]
evidence: 06-LIVE-TEST-2026-09-17.md
progress: Native Ukrainian settings, duration correction/review, roster removal copy, language navigation and initial setup prompt observed. All three policy labels are fully readable in the actual desktop client. Remaining setup steps and final human wording acceptance are pending.

### 2. Complete onboarding and language-switch continuity in the authorized test chat

expected: Choose Ukrainian before configuration; complete setup, edit settings and add/remove a roster member. Language changes confirm in the new language; selecting the same language has no extra visible confirmation. An older-language prompt or open settings/removal confirmation remains usable and produces current-language output. Use the project telegram-web-uat skill, preserve existing scoped waivers, and restore test fixtures as required.
result: [pending]
evidence: 06-LIVE-TEST-2026-09-17.md
progress: Passed subcases include default English, both-direction settings language navigation, same-language silence, old-language text input, open settings/removal confirmations across a switch, settings save/restoration, roster remove/add/restoration, unconfigured language-only settings, and Ukrainian choice before configuration with native confirmation toast. Remaining onboarding is waiting at location step 1 of 8; no product defect inferred.

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

None reported. These pending native checks are not implementation failures or automated passes.

## Continuation

Primary group restored: English, Europe/Kyiv, Wednesday 14:00, duration 120 minutes, daily 10:00–21:00, reminders 10:00/16:00, admins only, original A/B roster, no test rehearsal created. The user explicitly authorized GSM_bot_test_group_1 for onboarding. That group remains unconfigured with Ukrainian selected and actor A's setup draft at timezone input. Preserve this intentional continuation fixture; do not reset the database or repeat completed subcases. The existing single local bot now runs the Phase 6 build and PostgreSQL history is preserved.
