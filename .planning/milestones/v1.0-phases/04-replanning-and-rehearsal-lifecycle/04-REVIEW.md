---
phase: 04-replanning-and-rehearsal-lifecycle
reviewed: 2026-09-09T07:55:57Z
depth: standard
files_reviewed: 35
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
  - tests/integration/planning-lifecycle-review.test.ts
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
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
resolved_findings: [CR-01, CR-02]
correction_commit: 8823a3b
---

# Phase 4: Code Review Report

**Reviewed:** 2026-09-09T07:55:57Z
**Depth:** standard
**Files in review scope:** 35
**Status:** clean for CR-01/CR-02 after targeted re-review

## Narrative Findings (AI reviewer)

### Summary

The original review scope is the Phase 04 summary files plus the production, test, migration, and generated-client diff from `4af715b^`, including the final Plan 05 working-tree changes. Targeted re-review of committed correction `8823a3b` and its regression tests closes both findings. There are no remaining findings in that correction scope. The original findings are retained below as resolved history; their line numbers refer to the original reviewed snapshot.

No structural pre-pass was supplied. The separate UI and security audits remain distinct evidence. The documented single polling process, best-effort Telegram delivery, shared control visibility, and day-level today-selectable rule are accepted constraints rather than findings. Full suites were not rerun by this reviewer; the executor owns final full-suite evidence.

## Resolved Critical Issues

### CR-01: Declining a lifecycle confirmation can remove the only answer buttons

**Classification:** BLOCKER
**Status:** RESOLVED in `8823a3b`.
**File:** `C:/dev/gsm_bot/src/telegram/planning-handlers.ts:3252` and `C:/dev/gsm_bot/src/telegram/planning-handlers.ts:3671`
**Related code:** `renderStep` at lines 1257–1266; `announcementBody` at lines 1184–1201; `claimAnnouncement` in `C:/dev/gsm_bot/src/domain/planning/planning-service.ts:2641`.

**Issue:** Both `kept` branches render the current control-bearing message without specifying whether it is the availability anchor or an announcement. `renderStep` infers an announcement from a retained `readyAnnouncedAt` and a ready/blocked outcome, even when `announcementMessageId` is null. It therefore paints an announcement over the availability anchor and discards both answer controls. Availability remains mutable in the database, but participants can no longer change their answers from that card.

**Reproduction:** Confirm a round with two participants. The first answers unavailable, posting the blocked announcement. That person changes to available while the second is still pending: the round becomes collecting and clears `announcementMessageId`, retaining the cooldown timestamp. The second answers available within the cooldown: no new announcement is posted. Open Cancel or Change and then choose Keep. The control-bearing message is now the availability anchor, but the Keep redraw replaces it with the ready announcement.

**Executed evidence:** A read-only Node stdin harness imported the real `dispatchPlanningCallback` using Node's TypeScript transformation hook, with a mocked `kept` service result. The fixture had `status: CONFIRMED`, `announcementMessageId: null`, non-null `readyAnnouncedAt`, an available participant, both answer tokens, and a booking token. Both `cancel-keep` and `change-keep` emitted `editMessageText` to their anchor with `Ready to book` text and a keyboard containing only `Mark as booked`. The fixture disabled lifecycle token minting to isolate the renderer; adding lifecycle controls does not restore the missing answers. No source or test files were modified for this reproduction.

**Fix:** Pass an explicit availability card selection to `renderStep` whenever the selected message is the availability anchor with no announcement. Apply the same rule to both Keep branches. Add regression coverage for the full blocked → collecting → ready-inside-cooldown sequence and assert that both answer controls remain on the anchor after each decline; also cover the blocked outcome with a null announcement pointer.

**Closure evidence:** Both Keep branches now pass `availability` when `announcementMessageId` is null, and `announcement` otherwise. This matches `controlBearingMessageId` and leaves the DRAFT rendering branch unchanged. The committed integration regression drives actual answer callbacks through blocked → collecting → ready/blocked inside cooldown, checks the null pointer and retained claim, and verifies both answer labels after each of Cancel Keep and Change Keep. The executor reports all four parameterized tests passing; this reviewer checked their assertions and committed implementation without repeating the run.

### CR-02: Superseded draft controls still return advice to start a competing plan

**Classification:** BLOCKER
**Status:** RESOLVED in `8823a3b`.
**File:** `C:/dev/gsm_bot/src/domain/planning/planning-service.ts:2036` and `C:/dev/gsm_bot/src/telegram/planning-handlers.ts:4773`
**Related code:** Equivalent draft status gates in `selectTime`, `back`, and `confirm`; their dispatcher stale branches. The same missing terminal classification affects cancelled drafts.

**Issue:** Phase 04 permits Change on a draft, but the retained unconsumed day/time/back/confirm tokens only see the old generic non-DRAFT rejection. Unlike answer, booking, and lifecycle callbacks, these routes never distinguish `SUPERSEDED` from ordinary stale state. The resulting alert recommends `/plan`, even though the successor is already the current draft. This violates D-09's distinct advice for a superseded round's buttons and gives the user a recovery instruction unrelated to the actual replacement.

**Reproduction:** Save an unconsumed day token from a DAY draft. Apply Change to that draft, creating its same-week successor. Before the saved token expires, deliver its callback (for example from a client whose keyboard has not yet refreshed). `selectDay` loads the old row and returns `stale` because its status is no longer DRAFT. The dispatcher emits `CALLBACK_STALE`, rather than `PLANNING_REPLANNED_TEXT`. The old and successor rows remain unchanged, so this is a refusal/recovery correctness defect rather than an unauthorized mutation.

**Fix:** Propagate explicit superseded and cancelled results through the draft transition unions and dispatchers, or add a shared validated terminal-round gate covering all planning target actions. Preserve consumed-token replay semantics and chat binding. Add router-level coverage for an unexpired saved draft token after Change and after Cancel; assert the distinct terminal alert, `/plan_status` advice for supersession, and no successor mutation.

**Closure evidence:** All four domain transition unions and status gates now distinguish superseded and cancelled rounds. The new checks occur after callback kind/chat/expiry validation, consumed-token rejection, and action-target parsing, and require the loaded round's chat to match before returning terminal information. They return without mutation; the existing active-draft ownership and guarded-write paths remain intact. Every associated dispatcher calls the shared terminal-answer helper. The committed integration cases cover all four targets after both terminal transitions, assert exact terminal text, unchanged round rows, unconsumed refused tokens, and retained consumed-token precedence. RED evidence was committed in `e5ae03d`; correction and formatted regressions are committed in `8823a3b`.

## Review limits and handoff

This follow-up examined only the committed CR-01/CR-02 correction and regression file, avoiding concurrent UI recovery and acknowledgement edits in the working tree. No new authorization or stale-state regression was found in that correction diff. This clean status does not close the separate UI audit or claim a fresh full-phase test run.

The UI audit independently identified delayed success acknowledgements and lifecycle commands whose confirmations remain buried or silently fail to edit. Those items are intentionally left in that audit rather than duplicated here. The outdated irreversible-booking copy was corrected by the orchestrator in `e9a0577` during review and is not counted as an open finding. Plan 05's final summary and complete test run were still owned by its executor at the time this report was written.

_Reviewer: gsd-code-reviewer_

## Plan 04-06 targeted re-review — 2026-09-09

Reviewed inline using the GSD code-review workflow, at standard depth, against `f586b80..336b7f4`. This is not an independent subagent review. Scope is the gap correction in `planning-handlers.ts`, `planning-renderers.ts` and the four touched unit/integration test files. Prior review findings and their closure evidence above are retained.

No new critical, warning or informational findings were identified in this correction. The caller audit covers seven `clearSupersededCard` call sites: five relocation/failed-tracking callers use neutral retirement, and the two `deliverSuccessor` callers retain terminal supersession. Lifecycle confirmation uses `editRoundMessage` separately with the same neutral renderer.

Retirement follows a successful pointer move; failed pointer writes retire only the untracked new copy, leaving the original reachable. The separate availability anchor is not the previous lifecycle surface when an announcement exists. Status announcement promotion preserves its existing availability redraw and answer tokens. No authorization, status transition, callback acknowledgement, claim release or cooldown mutation changed. Terminal cancellation rendering and `deliverSuccessor` remain explicit.

The new renderer derives its only dynamic label from validated civil date and numeric time formatting, with no raw participant label interpolation. Tests cover malformed HTML-like dates, message-history contradictions after answer changes and terminal transitions, resume/status retirement, failed tracking, and the established cooldown/answer-control regressions. The first full suite exposed an old assertion requiring active readiness text on an untracked announcement; `336b7f4` replaces that assertion with the new recovery contract, and all 39 availability tests pass.

Remote edit failure remains best effort under the existing logging policy. Existing untracked pre-fix messages cannot be recovered by this patch; the live report explicitly distinguishes them from fresh post-fix attempts. These are stated scope limits, not a claim of guaranteed delivery.
