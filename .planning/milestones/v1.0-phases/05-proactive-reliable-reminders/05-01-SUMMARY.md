---
phase: 05-proactive-reliable-reminders
plan: "01"
subsystem: database
tags: [pg-boss, approval, migration]
requires: []
provides: [Exact dependency and durable schema approval]
affects: [05-02]
key-files:
  created: [.planning/phases/05-proactive-reliable-reminders/05-01-SUMMARY.md]
  modified: []
key-decisions:
  - "User explicitly approved pg-boss 12.27.0 and the proposed durable schema after review."
requirements-completed: [RELI-02, RELI-03]
metrics:
  tasks: 2
completed: 2026-09-13
status: complete
---

# Phase 05 Plan 01: Dependency and Schema Review

The user replied `approve` to the explicit request covering both the exact queue dependency and the durable schema proposal.

## Review evidence

The execution-time official registry read at https://registry.npmjs.org/pg-boss confirmed version 12.27.0, Node >=22.12.0, repository https://github.com/timgit/pg-boss, creation 2016-03-18T21:37:26.499Z and pin publication 2026-08-03T16:33:23.003Z. There was no deprecation or postinstall script. Latest remained 12.31.0, published 2026-09-10T16:28:09.106Z. No drift from the researched publication evidence was found. The historical 1,263,047 weekly download figure was not remeasured. The research SUS: too-new result concerned the latest release, not the proposed older pin; it was presented without relabeling it as an OK verdict.

## Approved schema

- ChatReminderState keyed by chatId: generation, effectiveFrom, quietWeekStart, quietUntil, lastPlanningAttemptAt.
- ReminderOccurrence opaque id and unique chatId/kind/scope/generation/civilDate/minute: dueAt, disposition, attemptId, reservedAt, finishedAt, messageId, reason, retryAt, previousSpacingAt.
- PlanningRound: firstAvailabilityPublishedAt, availabilityAnchorAcknowledgedAt, reminderGraceRestartAt, lastReminderAttemptAt.
- timestamptz instants, date civil dates, bigint Telegram identities, ChatConfiguration and nullable exact-round foreign keys, disposition/due index.
- quietUntil preserves a no-earlier-than boundary across timezone changes; RESERVED is never replayed after process loss; separate provisioned pgboss schema. Later changes to stored identities require migration.

DST, navigation, legacy publication and timezone-week edge policies remain documented implementation assumptions, not new user decisions.

## Task Commits

Both review-only tasks are recorded in this summary commit. No package installation or application migration occurred in Plan 01.

## Verification

`query verify.plan-structure .../05-02-PLAN.md` passed with two tasks and no errors. Its local one-way-door warning is satisfied by this prerequisite schema approval.

## Deviations

Registry evidence was fetched with PowerShell Invoke-RestMethod because node/npm were not initially on PATH. Bundled runtime paths were resolved. The init query incorrectly included 05-PLAN-CHECK.md; it is a review artifact and is excluded from the ten executable plans.

## Self-Check: PASSED

Both explicit decisions are recorded; dependent installation and migration are authorized. This prerequisite does not itself prove phase-wide RELI-02/03 behavior.
