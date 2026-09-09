---
phase: 04-replanning-and-rehearsal-lifecycle
reviewed: 2026-09-09T07:50:56Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - prisma/migrate-deploy.mjs
  - prisma/migrations/20260908215724_cancellation/migration.sql
  - prisma/schema.prisma
  - src/domain/planning/planning-service.ts
  - src/domain/planning/target-week.ts
  - src/generated/prisma/enums.ts
  - src/generated/prisma/internal/class.ts
  - src/generated/prisma/internal/prismaNamespace.ts
  - src/generated/prisma/internal/prismaNamespaceBrowser.ts
  - src/generated/prisma/models/PlanningRound.ts
  - src/shared/callback-schema.ts
  - src/telegram/handlers.ts
  - src/telegram/keyboards.ts
  - src/telegram/planning-handlers.ts
  - src/telegram/planning-renderers.ts
  - tests/helpers/postgres.ts
  - tests/integration/migration-preflight.test.ts
  - tests/integration/planning-availability.test.ts
  - tests/integration/planning-booking.test.ts
  - tests/integration/planning-cancel-telegram.test.ts
  - tests/integration/planning-cancel.test.ts
  - tests/integration/planning-change-telegram.test.ts
  - tests/integration/planning-confirm.test.ts
  - tests/integration/planning-participant-integrity.test.ts
  - tests/integration/planning-recovery.test.ts
  - tests/integration/planning-replan-telegram.test.ts
  - tests/integration/planning-replan.test.ts
  - tests/integration/planning-round.test.ts
  - tests/unit/planning-availability-card.test.ts
  - tests/unit/planning-day-card.test.ts
  - tests/unit/planning-keyboards.test.ts
  - tests/unit/planning-logging.test.ts
  - tests/unit/target-week.test.ts
  - tests/unit/update-route-ownership.test.ts
findings:
  critical: 2
  warning: 0
  info: 0
  total: 2
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-09-09T07:50:56Z
**Depth:** standard
**Files in review scope:** 34
**Status:** issues_found

## Narrative Findings (AI reviewer)

### Summary

The review scope is the Phase 04 summary files plus the production, test, migration, and generated-client diff from `4af715b^`, including the final Plan 05 working-tree changes. Review concentrated on changed behavior and its surrounding call paths. The findings below concern a reachable loss of answer controls and incomplete terminal refusal routing. They are findings against the reviewed snapshot, before the orchestrator's follow-up fixes.

No structural pre-pass was supplied. The separate UI and security audits remain distinct evidence. The documented single polling process, best-effort Telegram delivery, shared control visibility, and day-level today-selectable rule are accepted constraints rather than findings. Full suites were not rerun by this reviewer; the executor owns final full-suite evidence.

## Critical Issues

### CR-01: Declining a lifecycle confirmation can remove the only answer buttons

**Classification:** BLOCKER
**File:** `C:/dev/gsm_bot/src/telegram/planning-handlers.ts:3252` and `C:/dev/gsm_bot/src/telegram/planning-handlers.ts:3671`
**Related code:** `renderStep` at lines 1257–1266; `announcementBody` at lines 1184–1201; `claimAnnouncement` in `C:/dev/gsm_bot/src/domain/planning/planning-service.ts:2641`.

**Issue:** Both `kept` branches render the current control-bearing message without specifying whether it is the availability anchor or an announcement. `renderStep` infers an announcement from a retained `readyAnnouncedAt` and a ready/blocked outcome, even when `announcementMessageId` is null. It therefore paints an announcement over the availability anchor and discards both answer controls. Availability remains mutable in the database, but participants can no longer change their answers from that card.

**Reproduction:** Confirm a round with two participants. The first answers unavailable, posting the blocked announcement. That person changes to available while the second is still pending: the round becomes collecting and clears `announcementMessageId`, retaining the cooldown timestamp. The second answers available within the cooldown: no new announcement is posted. Open Cancel or Change and then choose Keep. The control-bearing message is now the availability anchor, but the Keep redraw replaces it with the ready announcement.

**Executed evidence:** A read-only Node stdin harness imported the real `dispatchPlanningCallback` using Node's TypeScript transformation hook, with a mocked `kept` service result. The fixture had `status: CONFIRMED`, `announcementMessageId: null`, non-null `readyAnnouncedAt`, an available participant, both answer tokens, and a booking token. Both `cancel-keep` and `change-keep` emitted `editMessageText` to their anchor with `Ready to book` text and a keyboard containing only `Mark as booked`. The fixture disabled lifecycle token minting to isolate the renderer; adding lifecycle controls does not restore the missing answers. No source or test files were modified for this reproduction.

**Fix:** Pass an explicit availability card selection to `renderStep` whenever the selected message is the availability anchor with no announcement. Apply the same rule to both Keep branches. Add regression coverage for the full blocked → collecting → ready-inside-cooldown sequence and assert that both answer controls remain on the anchor after each decline; also cover the blocked outcome with a null announcement pointer.

### CR-02: Superseded draft controls still return advice to start a competing plan

**Classification:** BLOCKER
**File:** `C:/dev/gsm_bot/src/domain/planning/planning-service.ts:2036` and `C:/dev/gsm_bot/src/telegram/planning-handlers.ts:4773`
**Related code:** Equivalent draft status gates in `selectTime`, `back`, and `confirm`; their dispatcher stale branches. The same missing terminal classification affects cancelled drafts.

**Issue:** Phase 04 permits Change on a draft, but the retained unconsumed day/time/back/confirm tokens only see the old generic non-DRAFT rejection. Unlike answer, booking, and lifecycle callbacks, these routes never distinguish `SUPERSEDED` from ordinary stale state. The resulting alert recommends `/plan`, even though the successor is already the current draft. This violates D-09's distinct advice for a superseded round's buttons and gives the user a recovery instruction unrelated to the actual replacement.

**Reproduction:** Save an unconsumed day token from a DAY draft. Apply Change to that draft, creating its same-week successor. Before the saved token expires, deliver its callback (for example from a client whose keyboard has not yet refreshed). `selectDay` loads the old row and returns `stale` because its status is no longer DRAFT. The dispatcher emits `CALLBACK_STALE`, rather than `PLANNING_REPLANNED_TEXT`. The old and successor rows remain unchanged, so this is a refusal/recovery correctness defect rather than an unauthorized mutation.

**Fix:** Propagate explicit superseded and cancelled results through the draft transition unions and dispatchers, or add a shared validated terminal-round gate covering all planning target actions. Preserve consumed-token replay semantics and chat binding. Add router-level coverage for an unexpired saved draft token after Change and after Cancel; assert the distinct terminal alert, `/plan_status` advice for supersession, and no successor mutation.

## Review limits and handoff

The UI audit independently identified delayed success acknowledgements and lifecycle commands whose confirmations remain buried or silently fail to edit. Those items are intentionally left in that audit rather than duplicated here. The outdated irreversible-booking copy was corrected by the orchestrator in `e9a0577` during review and is not counted as an open finding. Plan 05's final summary and complete test run were still owned by its executor at the time this report was written.

_Reviewer: gsd-code-reviewer_
