---
status: resolved
trigger: Native Phase 7 UAT loses the organizer line after keeping a collecting rehearsal.
created: 2026-09-18T15:20:00Z
updated: 2026-09-18T15:20:00Z
---

## Symptoms

Expected: Returning from change/cancel confirmation preserves the organizer attribution.
Actual: `Організатор: Валерій Погорєлов` disappears while the same slot and 1/2 answers remain.
Reproduction: Confirm a rehearsal, answer as A, open change/cancel, choose Keep.

## Current Focus

hypothesis: Both kept-result branches construct availability without its optional owner.
test: Add composed bilingual coverage for both keep routes, then supply the persisted organizer identity.
expecting: Owner line restored without changing round, participant answers, or slot.
next_action: Continue Phase 7 UAT; no remaining work for this defect.

## Evidence

- Native change-keep and cancel-keep both removed the line from the same collecting card.
- Both handler branches call `availabilityStepProjection(result.round, result.participants)` without the third owner argument.
- The regular service projection and answer/confirmation rendering already supply owner identity.

## Resolution

root_cause: Two lifecycle return paths omitted optional organizer identity from presentation.
fix: Resolve the round author's identity through the existing shared resolver and pass it with the transaction's participant snapshot.
verification: Four composed bilingual cases failed on the missing owner before correction. All 53 integration tests in localized-lifecycle, planning-cancel-telegram and planning-change-telegram passed after correction. Native cancel-keep and change-keep both preserve organizer and 1/2 answers on the original slot. Typecheck and runtime build passed.
