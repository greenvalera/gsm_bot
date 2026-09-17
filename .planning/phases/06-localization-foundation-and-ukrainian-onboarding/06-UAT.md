---
status: testing
phase: 06-localization-foundation-and-ukrainian-onboarding
source: [06-VERIFICATION.md]
started: 2026-09-16T22:05:00Z
updated: 2026-09-17T15:40:00Z
---

# Phase 6 Native Telegram Acceptance

## Current Test

number: 1
name: Final human assessment of Ukrainian wording
expected: |
  Review the observed Ukrainian setup, settings and roster text for natural informal wording and understandable controls.
awaiting: user wording acceptance and disposition of the newly configured secondary test group

## Tests

### 1. Ukrainian wording and Telegram control legibility

expected: Setup, settings and roster copy is natural informal Ukrainian; approved vocabulary, corrective examples, bilingual language navigation and long policy buttons are readable and understandable. Assess the actual Telegram client; automated catalog and payload checks do not establish this result.
result: [pending]
evidence: 06-LIVE-TEST-2026-09-17.md
progress: All eight setup steps, review, saved summary, settings, duration correction/review, roster guidance/removal, language navigation and long policy labels observed in native Telegram. Review/control screenshot is legible. Final human wording acceptance remains pending.

### 2. Complete onboarding and language-switch continuity in the authorized test chat

expected: Choose Ukrainian before configuration; complete setup, edit settings and add/remove a roster member. Language changes confirm in the new language; selecting the same language has no extra visible confirmation. An older-language prompt or open settings/removal confirmation remains usable and produces current-language output. Use the project telegram-web-uat skill, preserve existing scoped waivers, and restore test fixtures as required.
result: pass
source: native-browser
evidence: 06-LIVE-TEST-2026-09-17.md
progress: Completed all recorded continuity subcases plus all eight Ukrainian onboarding steps, review/save and fresh persisted settings read. User provided Dnipro location through mobile Telegram. No reproduced Phase 6 product defect. Primary fixtures restored; secondary group's newly created configuration is disclosed below and awaits retention disposition.

## Summary

total: 2
passed: 1
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

None reported. These pending native checks are not implementation failures or automated passes.

## Continuation

Primary group restored: English, Europe/Kyiv, Wednesday 14:00, duration 120 minutes, daily 10:00–21:00, reminders 10:00/16:00, admins only, original A/B roster, no test rehearsal created. User-authorized GSM_bot_test_group_1 is now configured in Ukrainian: detected Europe/Athens, Wednesday 14:00, 120 minutes, daily 10:00–21:00, reminders 10:00/16:00, admins only. Its initially unconfigured state has not been restored; no database reset or deletion was attempted. Ask whether to retain this completed test configuration alongside final wording acceptance. Existing single local bot and preserved PostgreSQL remain running. Phase remains human_needed until acceptance.
