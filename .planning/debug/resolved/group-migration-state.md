---
status: resolved
trigger: "Виправ в сабагенті (G-04-2: group migration loses access to rehearsal state)"
created: 2026-09-11
updated: 2026-09-11
---

## Current Focus

bug_class: Bohrbug
next_action: None; G-04-2 is resolved with root-observed live acceptance. Other phase 4 UAT residuals remain open.
reasoning_checkpoint:
  hypothesis: Missing migration handling strands all chat-keyed state when Telegram assigns a supergroup ID.
  confirming_evidence: [No migrate_to/from route in create-bot or handlers, old configuration and rounds survive while new-ID commands request setup]
  falsification_test: Deliver a migration service update to the existing bot and check whether configuration moves to the new ID.
  fix_rationale: Move every chat-scoped record atomically and remember the identity transition; retire message-scoped capabilities rather than reusing IDs in another chat.
  blind_spots: Live historical messages cannot be remapped to new message IDs; browser acceptance follows automated verification.
  candidate_causes: [code - no migration route, data - configuration absent at new ID, environment - wrong database]
  and_gate: No; retained old state and commands from the new ID isolate the missing identity transition.
known_pattern_candidate: No knowledge-base.md exists; no prior match.
sbfl: Skipped; no per-test failing coverage spectrum available.

## Symptoms

expected: Settings, roster, history and the active rehearsal remain available when the same Telegram group upgrades to a supergroup.
actual: /plan_status and /settings request setup again; original data remains under the old chat ID.
errors: "This chat isn't set up for rehearsals yet" and "This chat is not configured yet".
timeline: Reproduced live on 2026-09-11 at 02:13–02:15 Europe/Kyiv, during an explicitly authorized temporary administrator-role test.
reproduction: Prepared basic group -> promote test member with selected rights -> Telegram upgrades to supergroup -> issue /plan_status and /settings.

## Evidence

- Source: .planning/phases/04-replanning-and-rehearsal-lifecycle/04-LIVE-TEST-2026-09-11.md
- Old Bot API chat ID: -5576109925. New Web peer ID: -4358185686; independently verify actual Bot API ID before recovery.
- Database retains original config and 1 DRAFT, 9 SUPERSEDED, 14 CANCELLED rounds. Active draft: cmtw5829z001701s4gvaqos6m, old anchor 358.
- Test member B was restored to ordinary member. No database reset or setup restart occurred.
- User explicitly requests the fix in a subagent. Existing individual P01–P14 approvals must remain preserved.
- Independently confirmed new Bot API ID -1004358185686 from persisted command cooldown timestamps; target contains only a benign cooldown row.
- Composite participant foreign keys share chat_id. Transfer stages exact participant snapshots inside the same transaction and restores them after both parents move; injected final-ledger failure rolls the whole transfer back.
- Confirmed availability recovery only loads standing tokens. Migration rotates the two answer capabilities and booking request once; duplicate migration never rotates again. Setup/settings drafts retain values; message-bound confirmations expire and are reopened through commands.
- 6 new PostgreSQL regression tests passed, including duplicate/concurrent/out-of-order delivery, target conflicts, snapshots, rollback, confirmed controls and fresh status anchoring. 104 targeted integration tests passed across five suites. 362 existing unit tests and 3 new transport tests passed; typecheck passed.
- Revert-and-reconfirm: temporarily removed migration middleware registration. Telegram integration test failed on a delayed old-chat command unexpectedly sending a reply; restoring registration made the same test pass. No live database was involved.
- Local Docker build and deployed migration preflight passed. With polling stopped, shared recovery transferred only -5576109925 to -1004358185686 at 2026-09-10T23:29:16.177Z. Post-read confirmed configuration revision 5, 2 memberships, 14 CANCELLED + 9 SUPERSEDED + the same DRAFT, with cleared anchors and draft revision 3. One rebuilt polling worker restarted; PostgreSQL healthy. No database reset or new setup occurred.
- Root live Chrome acceptance: at 02:29:51 /settings showed original Europe/Kyiv, Wednesday 14:00, 120 minutes, 10:00–21:00, reminders 10/16 and Admins only; at 02:29:55 /roster showed A/B; at 02:29:59 /plan_status rebuilt the original draft. Friday 11 opened valid 10:00–19:00 time slots with usual 14:00; fresh Cancel then Yes cancelled the recovered draft.
- Scoped implementation commit: e5dcc27 (19 files including generated Prisma client and recovery documentation). Unrelated dirty files and root-owned live report excluded.
- Final root acceptance: /plan_status at 02:30:35 showed no active plan. SQL confirmed 9 SUPERSEDED + 15 CANCELLED, zero active rounds and 2 memberships at the target ID. Exactly one bot runs and PostgreSQL remains healthy.

## Resolution

root_cause: The Telegram transport ignored group migration service messages while all domain reads were keyed by the incoming exact chat ID.
fix: Atomic chat identity transfer with durable idempotency ledger, conflict rejection, dual-chat serialization, stale-update tombstones, cleared old anchors and rotated standing capabilities. Shared explicit recovery entrypoint handles already-consumed service events.
oracle_type: specified
verification:
  target_test: { result: pass }
  mutation_check: { result: skipped, reason_if_skipped: Stryker is not configured }
  no_op_deletion: { result: pass, deletion_justified_by_rca: true }
  adjacent_tests: { result: pass, suites_run: [unit, chat-readiness.e2e, planning-recovery, planning-participant-integrity, planning-availability] }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true }
  guardrail_verdict: accepted
  live_recovery: pass - source state moved and counts preserved; root Chrome acceptance passed settings, roster, original draft and fresh controls/cancellation
files_changed: [prisma/schema.prisma, prisma/migrations/20260911090000_chat_migrations/migration.sql, src/generated/prisma, src/domain/chat/migration-service.ts, src/telegram/migration-handler.ts, src/app/create-bot.ts, src/app/recover-chat-migration.ts, tests/integration/chat-migration.test.ts, tests/unit/chat-migration.test.ts, tests/unit/update-path-logging.test.ts]

## Specialist Review

No matching `typescript-expert` skill is installed in the available catalog. No specialist invocation is claimed. TypeScript checking, PostgreSQL integration tests, manual diff review and the runtime container build provide the recorded implementation checks.

## Prevention

Why not caught: previous transport tests covered commands and callbacks but never Telegram migration service messages. Schema integrity protected relations within a chat but could not make missing identity-transition handling visible.

Recurrence guard: `tests/integration/chat-migration.test.ts` covers real grammY migration update routing through a migrated PostgreSQL database, including fresh card recovery, preserved snapshots and injected transaction rollback. `tests/unit/chat-migration.test.ts` verifies both event identities share serialization keys and text/private updates are not treated as migration events. Operator instructions are in `docs/chat-migration-recovery.md`.
