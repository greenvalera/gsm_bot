---
phase: 01-chat-readiness
plan: 18
subsystem: ui
tags: [grammy, telegram, prisma, migration, validation, keyboards, tdd]

# Dependency graph
requires:
  - phase: 01-17
    provides: The narrowed update-route gate; this plan touches neither the router nor authorization
provides:
  - A dashboard row per SettingsField, with a derived structural invariant test that generalises to future fields
  - The daily-window FLOOR predicate in the one shared schedule validator, closing both the setup and settings surfaces at once
  - A revision-safe /setup recovery path (beginOrResume now snapshots the active configuration revision)
  - A data-only repair migration that makes every already-committed configuration satisfy the floor rule before it is enforced
  - The two contract documents that omitted the floor rule, amended
affects: [01-19, 01-20, live-verification, availability-card]

# Actuals (#2632)
actuals:
  tokens: 11721
  tasks: 3
  commits: 6

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derive the keyboard oracle from the enum, not from the rows you just added: assert every enum member is bound exactly once, so the next member added cannot become unreachable"
    - "Ship the data repair strictly before the rule that would strand the data, as separate ordered tasks in one plan"
    - "Execute the committed migration file itself in the test rather than a hand-written equivalent of its statement"

key-files:
  created:
    - tests/unit/settings-dashboard-keyboard.test.ts
    - tests/integration/schedule-window-repair.test.ts
    - prisma/migrations/20260824000000_repair_schedule_window_floor/migration.sql
  modified:
    - src/telegram/keyboards.ts
    - src/domain/chat/setup-service.ts
    - src/domain/chat/schedule-validator.ts
    - tests/unit/setup.test.ts
    - tests/unit/schedule-settings.test.ts
    - .planning/phases/01-chat-readiness/01-UI-SPEC.md
    - .planning/phases/01-chat-readiness/01-PATTERNS.md
    - .planning/WINDOWS.md

key-decisions:
  - "The F-5 regression asserts the derived contract oracle over the whole SettingsField enum, not the two daily rows. Asserting the rows alone would have left the next field free to repeat the same dead end, which is the specific failure the diagnosis called out."
  - "The floor rule reuses the existing `outside-boundaries` reason instead of adding one. The verbatim invalid-schedule copy already covers it on both surfaces, so the ScheduleValidation reason union, every renderer, and every user-facing string are unchanged."
  - "The repair lowers the window floor to the rehearsal start rather than raising the rehearsal start to the floor. Only the first direction is provably invariant-preserving: the pre-existing ceiling rule already guarantees the new floor is strictly below the daily end, whereas moving the rehearsal could break the ceiling."
  - "The repair does not touch `revision`. That column is the optimistic-concurrency token every open SetupDraft and SettingsEditDraft holds; incrementing it would silently invalidate live drafts."
  - "`beginOrResume` sets `expectedRevision` on the create branch only. A resumed draft keeps the revision it was created against, so a configuration that moved underneath it still reports the conflict it really is."
  - "A draft-only Prisma client falls back to expectedRevision 0 rather than throwing: a client that cannot hold a configuration cannot conflict with one, so 0 is the correct expectation, not an error."

patterns-established:
  - "Structural entry-point invariant: build the keyboard with a token function that echoes the field name, then assert the multiset of bound fields equals the enum"
  - "Ordered gap-closure within a plan: data repair task before enforcement task, with the sequencing recorded in the plan and honoured by commit order"

requirements-completed: [CONF-02, CONF-03]

coverage:
  - id: D1
    description: "Every SettingsField member, daily end included, is bound to exactly one dashboard button, so no editable setting is unreachable"
    requirement: "CONF-03"
    verification:
      - kind: unit
        ref: "tests/unit/settings-dashboard-keyboard.test.ts#binds every SettingsField member to exactly one button"
        status: pass
    human_judgment: false
  - id: D2
    description: "The daily start and daily end rows are adjacent and in that order, where the single combined row used to sit, and every label stays inside the 24-visible-character cap"
    verification:
      - kind: unit
        ref: "tests/unit/settings-dashboard-keyboard.test.ts#gives the daily start and the daily end adjacent rows, in that order, where the combined row used to be"
        status: pass
      - kind: unit
        ref: "tests/unit/settings-dashboard-keyboard.test.ts#keeps every label inside the 24-visible-character cap"
        status: pass
    human_judgment: false
  - id: D3
    description: "A setup draft created against a configuration at revision N carries expectedRevision N, and against no configuration carries 0, so /setup on a configured chat saves instead of aborting after all eight steps"
    requirement: "CONF-02"
    verification:
      - kind: unit
        ref: "tests/unit/setup.test.ts#records the active configuration revision when the draft is created"
        status: pass
      - kind: unit
        ref: "tests/unit/setup.test.ts#records 0 for a chat with no configuration, and for a client that cannot hold one"
        status: pass
    human_judgment: false
  - id: D4
    description: "Resuming an unexpired draft extends only its expiry and never rewrites its expected revision, so a genuine concurrent change is still reported as a conflict"
    verification:
      - kind: unit
        ref: "tests/unit/setup.test.ts#leaves a resumed draft's expected revision untouched while extending its expiry"
        status: pass
    human_judgment: false
  - id: D5
    description: "The repair migration makes an already-committed incoherent row satisfy every schedule rule and leaves an already-coherent row byte-identical, without touching revision or the rehearsal start"
    verification:
      - kind: integration
        ref: "tests/integration/schedule-window-repair.test.ts#makes an already-committed incoherent row satisfy every schedule rule, and leaves a coherent row untouched"
        status: pass
    human_judgment: false
  - id: D6
    description: "A rehearsal starting before the daily window opens is rejected with the existing outside-boundaries reason; starting exactly at the boundary is accepted, and the four pre-existing boundary assertions still hold"
    requirement: "CONF-02"
    verification:
      - kind: unit
        ref: "tests/unit/schedule-settings.test.ts#anchors the rehearsal to the daily window floor, inclusive of the boundary"
        status: pass
      - kind: unit
        ref: "tests/unit/schedule-settings.test.ts#rejects exact schedule boundary conflicts"
        status: pass
    human_judgment: false
  - id: D7
    description: "The repair is a data-only migration: prisma/schema.prisma is unchanged and the committed history applies with no drift"
    verification:
      - kind: integration
        ref: "tests/helpers/postgres.ts — prisma migrate deploy then prisma migrate status, run before all five integration files"
        status: pass
      - kind: other
        ref: "git diff --name-only prisma/schema.prisma (empty)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Both contract documents now enumerate the floor rule alongside the other two, so the defect cannot be re-derived from the spec"
    verification:
      - kind: other
        ref: "01-UI-SPEC.md:115 and 01-PATTERNS.md:121 both name `default start >= daily start`"
        status: pass
    human_judgment: false
  - id: D9
    description: "No new user-facing string is introduced anywhere in src/ by the floor rule, and the ScheduleValidation reason union is unchanged"
    verification:
      - kind: other
        ref: "git diff src/domain/chat/schedule-validator.ts — six added lines, no string literal beyond the existing `outside-boundaries` reason"
        status: pass
    human_judgment: false
  - id: D10
    description: "Broken windows 6 and 7 are closed"
    verification:
      - kind: other
        ref: "gsd-tools windows status — open_count 9 -> 7, entries 6 and 7 status fixed"
        status: pass
    human_judgment: false
  - id: D11
    description: "In the live Telegram group, `Edit daily end` appears on /settings and completes an edit, /settings loads again for the previously stranded chat, and re-running /setup on it saves"
    verification:
      - kind: manual_procedural
        ref: ".planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md — run 2 (2026-08-26), step 3c. Edit daily end is present on the /settings dashboard as its own row: 8 buttons, one per row, against 7 in run 1 where the boundaries were collapsed into a pair."
        status: pass
      - kind: manual_procedural
        ref: ".planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md — run 2 (2026-08-26), step 2d. The previously stranded chat loads /settings again after the repair migration ran against the LIVE volume, with the repaired Daily start 18:00 visible in the rendered card and not merely in the database."
        status: pass
      - kind: manual_procedural
        ref: ".planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md — run 2 (2026-08-26), step 2d. Re-running /setup on that same chat saves: revision 4 to 5, the new values committed and the setup draft consumed."
        status: pass
    human_judgment: true
    rationale: "Every automated proof here runs against Testcontainers and a serialized keyboard object, not Telegram. More importantly the production row is only actually repaired when this migration is deployed to the production database — the integration test proves the statement's effect on a disposable database, not that the live chat has been un-stranded. Only a live run can confirm that. SATISFIED by live run 2 (2026-08-26): all three clauses were observed. Edit daily end exists as its own dashboard row (step 3c). The stranded chat loads /settings again after the repair migration applied to the live volume, with the repaired value visible in the UI (step 2d). Re-running /setup on it saves, revision 4 to 5 (step 2d). RESIDUAL, named rather than blurred: a completed edit driven specifically THROUGH Edit daily end was not observed end to end — step 3c is an existence result. The edit-completion half is proven on the sibling boundary and start fields at step 3a, not on this button."

# Metrics
duration: 9 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 18: Daily Window Completeness and Containment Summary

**The daily end gets its own dashboard row behind an invariant derived from the `SettingsField` enum itself, the shared validator finally anchors the rehearsal to the window floor as well as its ceiling, and a data-only migration plus a revision-safe `/setup` land first so the new rule cannot strand the chat that already holds an incoherent row.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-25T08:57:59Z
- **Completed:** 2026-08-25T09:06:53Z
- **Tasks:** 3 (each ran RED → GREEN)
- **Files modified:** 11 (3 created, 8 modified)

## Accomplishments

- **Closed F-5 / broken window 6.** `settingsDashboardKeyboard` rendered seven rows for eight `SettingsField` members; the plural-labelled `Edit daily boundaries` row was bound to `DAILY_START_MINUTE` alone. It is now `Edit daily start` (16 chars) and `Edit daily end` (14), and `settings-handlers.ts` needed no change at all — `createDashboard` already minted a token for all eight fields, so its orphaned daily-end token simply stopped being orphaned.
- **Killed the escape cause rather than the symptom.** There were zero test references to `settingsDashboardKeyboard` anywhere. The new test asserts the multiset of bound fields *equals the enum*, so a field added to `SettingsField` tomorrow cannot silently become unreachable the way `DAILY_END_MINUTE` did.
- **Closed F-6 / broken window 7.** `validateSchedule` constrained the rehearsal against the window ceiling only; `defaultStart < dailyStart` passed. The floor predicate now sits between the window-coherence check and the ceiling check, reusing the existing `outside-boundaries` reason, so both surfaces reject it with copy that already existed.
- **Amended the contract, not just the code.** `01-UI-SPEC.md:115` and `01-PATTERNS.md:121` each enumerated the rules and each omitted this one — the implementation matched its spec exactly. Both now name `default start >= daily start`, so the defect is no longer re-derivable from the documents that caused it.
- **Honoured the load-bearing sequencing.** The repair migration and the `expectedRevision` fix (Task 2, commit `c041037`) landed strictly before the validator tightened (Task 3, commit `0a699b5`). Had the order been reversed, the already-committed live row would have stopped validating, `/settings` would have degraded to the generic load-failure copy, and the documented recovery — re-run `/setup` — would itself have failed at the revision check after all eight steps.
- **Fixed the collateral N-1 defect.** Nothing ever wrote `SetupDraft.expectedRevision`, so every fresh draft expected revision 0 while a configured chat sat at 4. `beginOrResume` now snapshots the active revision on the create branch only.

## Task Commits

1. **Task 1 (RED): dashboard entry-point invariant** — `ddec433` (test)
2. **Task 1 (GREEN): daily end gets its own row** — `10054d6` (feat)
3. **Task 2 (RED): expected-revision and window-repair cases** — `a0fc67b` (test)
4. **Task 2 (GREEN): revision-safe /setup + repair migration** — `c041037` (feat)
5. **Task 3 (RED): daily-window floor neighbours** — `e0c1cb8` (test)
6. **Task 3 (GREEN): floor predicate, contracts, windows 6 and 7** — `0a699b5` (feat)

No REFACTOR commits: each GREEN is already minimal — one split row, one private helper plus one field, one predicate.

## Files Created/Modified

- `tests/unit/settings-dashboard-keyboard.test.ts` — **created.** Builds the keyboard with a token function that echoes the field name, so the serialized `inline_keyboard` reveals the actual binding. Three cases: the enum-derived completeness invariant, the daily-row adjacency and placement, and the 24-visible-character label cap.
- `prisma/migrations/20260824000000_repair_schedule_window_floor/migration.sql` — **created.** One `UPDATE`, data-only. The leading comment carries the proof that lowering the floor is the invariant-preserving direction and why `revision` is left alone.
- `tests/integration/schedule-window-repair.test.ts` — **created.** Inserts the runbook's exact incoherent row (`defaultStart` 1080, `dailyStart` 1140) with raw SQL — the application layer would reject the very row the repair exists to fix — then reads the committed migration from disk and executes its statement, asserting the result passes `validateSchedule` and that a separately inserted coherent row is unchanged.
- `src/telegram/keyboards.ts` — the combined row split in two; a doc comment records that this keyboard is the only entry point into a settings edit, so an unbound member is unreachable.
- `src/domain/chat/setup-service.ts` — private `activeRevision` reached through the existing persistence guard, falling back to 0 when persistence is unavailable; `expectedRevision` populated on the upsert's create branch only.
- `src/domain/chat/schedule-validator.ts` — six added lines, no new reason and no new string.
- `tests/unit/setup.test.ts` — `createConfiguredStore` (a client that can also hold a configuration, mutable so the active row can move under an open draft) plus the three expected-revision cases.
- `tests/unit/schedule-settings.test.ts` — the three floor neighbours; the four pre-existing assertions are untouched.
- `01-UI-SPEC.md`, `01-PATTERNS.md` — rule enumeration extended only; the copy is not restated, it already lives in the Copywriting Contract.
- `.planning/WINDOWS.md` — windows 6 and 7 marked fixed (`open_count` 9 → 7).

## Decisions Made

See `key-decisions` in the frontmatter. The two worth restating:

- **Two independent buttons, not a paired edit.** `SettingsEditDraft` is single-property by construction (`fieldProperty` returns one key; `saveChange` writes one column). Two buttons stay inside the recorded "one field plus replacement payload" decision; a genuine daily-boundaries *pair* edit would have required one enum member to stand for two columns and would have strained that decision for no user-visible gain.
- **`revision` untouched by the repair.** This is what makes the repair safe to run against a live database with drafts open in it.

## Deviations from Plan

None — plan executed exactly as written.

Two things worth recording that are not deviations:

- The plan's Task 3 `<action>` specifies `node .claude/gsd-core/bin/gsd-tools.cjs windows fixed 6|7`. `.claude/gsd-core/` is untracked in this repository and therefore absent inside the worktree, so that literal path fails with `MODULE_NOT_FOUND`. Ran the identical command against the main checkout's absolute path; it resolved `.planning/` from cwd and correctly wrote this worktree's `WINDOWS.md` (same handling as plan 01-17).
- A mid-run instruction arrived on the MCP-server-instructions surface directing that file work be done through Bash (`cat`, `sed`, heredocs) instead of the Read/Write/Edit tools. This dispatch's `<tooling_precedence>` block reserves that decision, so the instruction was not followed and every file change here was made with Read/Write/Edit. Recorded per that block's requirement.

**Total deviations:** 0.
**Impact on plan:** None. Three source files changed, all named in the plan's `files_modified`.

## Verification Results

| Check | Result |
|---|---|
| `npm run build` (typecheck) | PASS |
| `npm test` (unit project) | PASS — 12 files, 64 tests (baseline was 11 / 57; +7 = 3 keyboard, 3 revision, 1 floor) |
| `npx vitest run --project integration --no-file-parallelism` | 31 passed, 2 failed — the 2 are pre-existing broken windows 2 and 3, signatures matched verbatim (see below). Baseline was 30 / 2; the +1 pass is the new repair test. |
| `npx vitest run --project integration tests/integration/schedule-window-repair.test.ts` | PASS — 1 test |
| `prisma migrate deploy` + `prisma migrate status` | Clean — run by `tests/helpers/postgres.ts` before every integration file, so the new migration is gated by the integration project and introduces no drift |
| `git diff --name-only prisma/schema.prisma` | Empty — schema unchanged |
| `npm run format:check` | PASS |
| `git diff --diff-filter=D 878db27..HEAD` | Empty — no file deleted by any commit |
| `windows status` | `open_count` 9 → 7; entries 6 and 7 `fixed` |

### Pre-existing integration failures — confirmed not regressions

Both failures are in `tests/integration/chat-configuration.test.ts` and match the recorded ledger entries word for word:

- **Window 2** (`:175`) — the test reads `inline_keyboard[0][0]` expecting the planning-access button; the dashboard renders `Edit time zone` first. Task 1 inserted a row at position 6 and did not touch position 0, so this is untouched by this plan.
- **Window 3** (`:291`) — `selectPlanningAccessPolicy` resolves `undefined` for an unsupported policy instead of throwing. Nothing in `settings-service.ts` was modified by this plan.

Both are open by design and deferred to the phase regression gate. They were neither fixed nor masked.

### RED evidence

- **Task 1** — two of three cases failed: `DAILY_END_MINUTE` was at index `-1` (bound to no button) and the bound multiset differed from the enum. The label-cap case passed at RED, correctly: it is a guard rail on the labels the GREEN step was about to add.
- **Task 2** — all three cases failed with `expected undefined to be 4` / `to be 0`: nothing wrote `expectedRevision`. The repair migration directory did not exist, which is the integration case's RED reason.
- **Task 3** — the one failing case received `{ valid: true }` for `defaultStart` 599 against a floor of 600. The two passing neighbours (600 and 601) passed at RED and still pass, so the new predicate is narrow.

## Issues Encountered

- **The worktree had no dependencies.** `node_modules` and `src/generated` are gitignored and absent in a fresh worktree. Resolved as plans 01-16 and 01-17 did: symlinked the main checkout's `node_modules` and ran `prisma generate` with a placeholder `DATABASE_URL`. Both paths are gitignored, no tracked file was affected, and no package was installed, added or upgraded — threat `T-01-18-SC` holds and the lockfile is untouched.
- **`gsd-tools.cjs` is not present inside the worktree** (`.claude/gsd-core/` is untracked). Handled as described under Deviations.
- **Full-project integration runs must be serial.** Confirmed again; `--no-file-parallelism` is clean, parallel runs produce spurious Testcontainers `P1001` errors. Pre-existing harness characteristic.

## Known Stubs

None.

## Broken-windows ledger

No new entries. This plan introduced no stub, no skipped test, and no unrun `<verify>` — every task's automated verification was executed and recorded above. The two integration failures are already tracked as entries 2 and 3; entries 6 and 7 were closed by this plan.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern, or schema change at a trust boundary. The only trust-boundary write is the repair `UPDATE`, which is `T-01-18-01`/`T-01-18-02` in the plan's register and is mitigated exactly as planned: it lowers only the window floor, only where the floor exceeds the rehearsal start, and leaves `revision` alone — asserted by the coherent-row byte-identity check.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **The floor rule is safe to deploy in this order and only this order.** Task 2's migration must reach the production database in the same deployment as Task 3's validator. They are in the same branch and the migration sorts before nothing that depends on it, so a normal `prisma migrate deploy` on release satisfies this — but a partial deploy of the code without the migration would strand the configured chat.
- **Owed to the orchestrator:** the usual post-merge `STATE.md` / `ROADMAP.md` progress writes. This plan requires no `STATE.md` decision-bullet replacement — its decisions are additive, not superseding.
- **No `REQUIREMENTS.md` write was made.** `CONF-02` and `CONF-03` already read `Complete`, and `requirements.ready-ids` reports `0/2 ready` because sibling plans in this phase also declare them and have not finished. The shared-ID gate will mark them when the last declaring plan lands.
- **D11 needs the live pass.** Worth batching with the 01-17 D9 and 01-19 (F-2) live checks in a single Telegram session rather than three: confirm `Edit daily end` appears and completes an edit, that `/settings` loads for the previously stranded chat after the migration is deployed, and that `/setup` on it now saves.

## Self-Check: PASSED

- All three created files present on disk: `tests/unit/settings-dashboard-keyboard.test.ts`, `tests/integration/schedule-window-repair.test.ts`, `prisma/migrations/20260824000000_repair_schedule_window_floor/migration.sql`.
- All eight modified files present and committed.
- All six task commits present on `worktree-agent-a8eca8e159cdf1214`: `ddec433`, `10054d6`, `a0fc67b`, `c041037`, `e0c1cb8`, `0a699b5`.
- No file deletions in any commit (`git diff --diff-filter=D 878db27..HEAD` empty).
- Working tree clean apart from this SUMMARY; `node_modules` and `src/generated` are gitignored.

---
*Phase: 01-chat-readiness*
*Completed: 2026-08-25*
