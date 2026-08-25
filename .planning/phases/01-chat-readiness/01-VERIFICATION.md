---
phase: 01-chat-readiness
verified: 2026-08-26T03:00:00Z
status: gaps_found
score: 2/4 must-haves verified
behavior_unverified: 2
overrides_applied: 0
gaps:
  - truth: "A user who no longer has the required current permission cannot perform a protected configuration, roster, or planning-policy action."
    status: partial
    reason: "The denial half is proven, but the SAME method destroys durable state on evidence it never observed. CR-01, confirmed by direct inspection: `requireCurrentAdministrator` collapses `getChatMember threw` into `role = 'unknown'` via an empty `catch {}`, then hard-deletes BOTH of the actor's drafts before denying. A 429/5xx/socket-reset during a live wizard wipes a still-current administrator's 30 minutes of input and tells them, falsely, that they are not an administrator. The empty catch also makes it undiagnosable — this is the exact F-4 defect class in the one place it costs durable data."
    artifacts:
      - path: "src/domain/auth/authorization-service.ts"
        issue: "Lines 34-53: `catch {}` swallows the lookup failure; the deleteMany pair at :46-52 then runs on the unobserved-role path. No logger is injected into this service at all."
      - path: "tests/unit/authorization.test.ts"
        issue: "Lines 31-45 assert only that a throwing gateway denies. No test asserts ZERO deleteMany calls on that path, so the destructive behavior is unguarded in both directions."
    missing:
      - "Separate the decision from the cleanup: a THROWN lookup denies without writing; only a POSITIVELY OBSERVED non-administrator role deletes drafts."
      - "Bind and log the swallowed exception (warn level, `err` key) so a failing membership refresh is visible."
      - "Extend tests/unit/authorization.test.ts to assert zero deleteMany calls when the gateway throws."
  - truth: "A chat administrator can choose whether administrators, previous-poll participants, or anyone may start planning."
    status: partial
    reason: "The capability is present and persists correctly at the service level, but the ONLY automated gate that drives the choice end to end through the composed bot is RED, and has been red since 2026-08-21. Broken windows 2 and 3 were explicitly 'deferred to the phase regression gate' — this IS that gate, and they arrive at it unresolved. I re-ran the suite myself: 31 passed / 2 failed, both in tests/integration/chat-configuration.test.ts, both on the planning-access path."
    artifacts:
      - path: "tests/integration/chat-configuration.test.ts"
        issue: "Line 186 (window 2): reads inline_keyboard[0][0] expecting the planning-access button; settingsDashboardKeyboard renders 'Edit time zone' first. I confirmed the stale-expectation diagnosis independently — this is a test defect, not a product defect, but it leaves the composed-bot policy flow with no passing gate."
      - path: "tests/integration/chat-configuration.test.ts"
        issue: "Line 302 (window 3): expects selectPlanningAccessPolicy to throw 'Unsupported planning access policy' for an invalid value; the service resolves undefined instead (settings-service.ts:250-258, via `if (candidate === undefined) return undefined`). Never dispositioned — either the test or the contract is wrong and nobody has decided which."
    missing:
      - "Disposition windows 2 and 3: correct the stale keyboard-index expectation, and decide whether invalid-policy rejection throws or fails soft — then make the suite green."
      - "A green composed-bot gate that changes the policy to a NON-default value (the e2e completeSetup only ever selects ADMINS_ONLY, which equals the default, so a policy write that silently no-ops would pass it)."
  - truth: "The phase's own live-Telegram verification gate has passed."
    status: failed
    reason: "Plan 01-14's SUMMARY carries `status: halted`, not complete. Its deliverable D5 (live private-group confirmation) records `verification: []` and the rationale 'EXECUTED AND NOT APPROVED'. 01-LIVE-VERIFICATION-RUNBOOK.md line 5 still reads the 2026-08-24 verdict verbatim. Nine findings F-1..F-9 were closed IN CODE by plans 01-16..01-22 — I verified each fix by direct read and by behavioral spot-check — but no live re-run has scored them. 01-UAT.md still stands at 5 `issue` / 1 `pending` / 3 `skipped`, and plan 01-22 deliberately reset test 6 to `pending` rather than flip it to pass, for exactly this reason."
    artifacts:
      - path: ".planning/phases/01-chat-readiness/01-14-SUMMARY.md"
        issue: "status: halted; D5 unsatisfied; yet requirements-completed lists all nine phase requirement IDs as complete."
      - path: ".planning/phases/01-chat-readiness/01-UAT.md"
        issue: "status: diagnosed, updated 2026-08-24. Tests 3, 8, 14, 17, 18, 19 = issue; test 6 = pending; tests 12, 13, 16 = skipped. None re-scored against the repaired build."
      - path: ".planning/REQUIREMENTS.md"
        issue: "The traceability table already marks CONF-01/02/03/05, ROST-01/02/03, AUTH-01/02 as 'Complete' — flipped ahead of any passing verification."
    missing:
      - "Execute the live Telegram re-run against the repaired build and record the verdict in 01-LIVE-VERIFICATION-RUNBOOK.md."
      - "Re-score 01-UAT.md tests 3, 6, 8, 14, 17, 18 (and run the three skipped: 12, 13, 16) from the live re-run."
      - "Replace 01-14-SUMMARY.md's `status: halted` only once D5 actually returns approved."
deferred:
  - truth: "The configured planning-access policy is enforced when a user starts planning"
    addressed_in: "Phase 2"
    evidence: "Phase 2 requirement PLAN-01 and Success Criterion 1: 'An authorized user can start planning...'. `canStartPlanning` / `PlanningAccessService` are currently referenced only by tests/unit/planning-access.test.ts (WR-10), which is correct for this phase — Phase 1's contract is that an administrator can CHOOSE the policy, not that it is enforced."
behavior_unverified_items:
  - truth: "A chat administrator can initialize the bot with an IANA time zone and configure the default rehearsal day, start time, duration, time boundaries, and availability-reminder times."
    test: "In a real Telegram group with a real bot, run /setup end to end: share a location, pick a zone, walk all eight steps, save. Then re-run /setup on the now-configured chat."
    expected: "Each callback-driven step REPLACES the previous card in place (no growing stack of live keyboards); steps 3/5/6 each name the value being asked for; the step-8 policy labels are not truncated; a conflicting schedule is rejected with the boundary copy and nothing is saved. On the second /setup, the header must not claim 'This chat is not configured yet.'"
    why_human: "Telegram client rendering, in-place card replacement and label truncation are exactly what a transport double cannot show. The e2e proves the durable transitions against real PostgreSQL; it cannot prove what the client draws. F-1/F-2/F-5/F-6/F-9 were found only by a human looking at a phone, and their fixes have never been looked at."
  - truth: "A chat administrator can choose whether administrators, previous-poll participants, or anyone may start planning."
    test: "From /settings, tap 'Edit planning access', choose 'Previous participants' (a NON-default value), confirm the review card, save. Restart the bot and re-open /settings."
    expected: "The review card reads Current: Admins only / New: Previous participants; after save the dashboard and the database both show PREVIOUS_PARTICIPANTS with revision incremented; the value survives the restart."
    why_human: "No passing automated gate drives this through the composed bot — the one that did is red (window 2). The passing integration test calls SettingsService directly, and the e2e only ever selects the default value."
human_verification:
  - test: "Live Telegram re-run of 01-LIVE-VERIFICATION-RUNBOOK.md steps 1-6 against the repaired build"
    expected: "Verdict `approved`; UAT tests 3, 6, 8, 14, 17, 18 flip from issue/pending to pass; the three skipped tests (12 decline-removal, 13 repeat-tap-after-removal, 16 pagination beyond 20 members) are actually run."
    why_human: "This is plan 01-14 Task 2's blocking checkpoint. It returned NOT APPROVED on 2026-08-24 and has never been re-executed. Automated suites are transport doubles."
  - test: "Live demotion timing (runbook step 5): demote the acting administrator in the Telegram UI, then immediately tap a protected button and send a protected command"
    expected: "Both are denied with the verbatim copy on the NEXT action; the demoted actor's setup and settings drafts are gone; the committed configuration revision is unchanged; restoring admin rights does not resurrect the draft."
    why_human: "Depends on real getChatMember propagation timing. F-7 (the bot answering every ordinary non-admin message with the denial text) was found here; window 5 is marked fixed in code but the fix has never been observed live."
  - test: "Setup wizard card replacement for the six TEXT-input steps"
    expected: "Known residual: the six text-driven steps still append rather than edit (F-2b, deferred as backlog item N-6 by owner decision 2026-08-24). Confirm the residual is acceptable in the live client."
    why_human: "An explicit owner-accepted deviation whose user impact was judged from a single live run; worth re-confirming now that the callback-driven half edits in place."
---

# Phase 1: Chat Readiness Verification Report

**Phase Goal:** Administrators can prepare a persistent, access-controlled chat for rehearsal coordination.
**Verified:** 2026-08-26T03:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criteria) | Status | Evidence |
|---|---|---|---|
| 1 | A chat administrator can initialize the bot with an IANA time zone and configure the default rehearsal day, start time, duration, time boundaries, and availability-reminder times. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Durable half PROVEN: `chat-readiness.e2e.test.ts:820` drives /setup through all 8 steps against real PostgreSQL via Testcontainers and asserts the persisted row (`Europe/Kyiv`, weekday 3, 1170, 120, 600, 1320, reminders `[600,960]`). I ran it — passes. Client-rendering half UNPROVEN: the only live run scored tests 3, 8, 18 as `issue` and has never been re-run. Plus WR-07 (confirmed at `setup-handlers.ts:443`): re-running /setup on a configured chat unconditionally says "This chat is not configured yet." |
| 2 | A chat administrator can add identifiable Telegram users to the band roster, remove them, and view the current roster. | ✓ VERIFIED | `chat-readiness.e2e.test.ts:914-968`: /roster_add by reply → exact confirmation, /roster → rendered page, tap Remove → named confirmation → "Roster updated", then a THIRD Prisma client + bot reads the empty roster. Backed by `roster-repository.test.ts` (6 integration tests, all passing) and `roster-rendering.test.ts` (15 unit tests incl. Unicode ordering, pagination, escaping, ID non-exposure). Live UAT 9/10/11/15 passed on 2026-08-24. |
| 3 | A chat administrator can choose whether administrators, previous-poll participants, or anyone may start planning. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Present + wired: `SettingsField.PLANNING_ACCESS_POLICY` bound to a dashboard row (`keyboards.ts:109-112`), setup step 8 renders 3 full-width rows (spot-checked live: `[["Admins only"],["Previous participants"],["Anyone in chat"]]`), service persists ADMINS_ONLY→ANYONE_IN_CHAT with revision bump (`chat-configuration.test.ts:216`, passing). NOT exercised: the composed-bot path — its only test (`:81`) is RED (window 2), and `completeSetup` only ever picks the default value. |
| 4 | A user who no longer has the required current permission cannot perform a protected configuration, roster, or planning-policy action. | ✓ VERIFIED | `CHAT_READINESS_ROUTES` enumerates all 9 routes and the e2e asserts `every(route => route.protectedRoute)` plus that exactly the two carrier routes are conditionally protected. Demotion denial proven at 7 independent sites: `authorization.test.ts` (all 5 non-admin roles + lookup failure), `walking-skeleton.test.ts:151/:166/:218`, `roster-rendering.test.ts:552/:563`, `roster-repository.test.ts:149`, `chat-configuration.test.ts:390/:687`, `chat-readiness.e2e.test.ts:601`. All pass. **Caveat:** the literal truth holds, but CR-01 breaks a sibling invariant on the same method — see Gaps. |

**Score:** 2/4 truths verified (2 present, behavior-unverified)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|---|---|---|
| 1 | The configured planning-access policy is enforced when a user starts planning (`canStartPlanning` is currently orphaned — imported only by its own test) | Phase 2 | Phase 2 requirements include PLAN-01; SC1: "An authorized user can start planning…". Phase 1's contract is the CHOICE, not the enforcement. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/app/main.ts` | Composition root, real getChatMember gateway, logger | ✓ VERIFIED | Builds `membershipGateway` from `bot.api.getChatMember`, threads `logger` into `createBot`, graceful shutdown wired. |
| `src/app/create-bot.ts` | Wires sequentialize + all services before handlers | ✓ VERIFIED | `sequentialize` by `chat:<id>` installed ahead of `registerChatReadinessHandlers`; all 6 services constructed. |
| `src/domain/auth/authorization-service.ts` | Fresh role lookup per protected action | ⚠️ Present but DEFECTIVE | Denial correct; destructive on unobserved role (CR-01, BLOCKER). |
| `src/domain/auth/planning-access-service.ts` | Policy evaluator | ⚠️ ORPHANED | No reference in `src/`. Deferred to Phase 2 (accepted). |
| `src/domain/chat/setup-service.ts` | 8-step draft state machine, atomic promotion | ✓ VERIFIED | 479 lines; transactional `completeSetup` with revision guard + callback consumption. |
| `src/domain/chat/settings-service.ts` | Committed read + per-field edit/review/save | ✓ VERIFIED | All 8 `SettingsField` members handled in both `configurationWithReplacement` and `fieldProperty`. |
| `src/domain/chat/schedule-validator.ts` | Floor + ceiling containment | ✓ VERIFIED | F-6 floor check present at `:64-66`. Spot-checked: 09:00 in a 10:00-22:00 window → `outside-boundaries`; exactly 10:00 → `valid`. |
| `src/domain/roster/roster-service.ts` | Add-by-reply, list, initiator-bound removal | ✓ VERIFIED | 391 lines, transactional, soft-deactivation. |
| `src/telegram/keyboards.ts` | Every SettingsField bound; policy one-per-row | ✓ VERIFIED | Spot-checked: 8 dashboard rows, `unbound: []`; `SETUP_POLICY_BUTTONS` = 3 rows (F-5 and F-9 both closed). |
| `src/telegram/renderers.ts` | Wizard copy naming each value | ✓ VERIFIED | Steps 3/5/6 read "Send the default rehearsal start time / daily start boundary / daily end boundary" (F-1 closed). |
| `src/telegram/setup-handlers.ts` | In-place card replacement on callback paths | ✓ VERIFIED | `editWithStep` at `:332-350` mirrors `showPrompt`; `replyWithStep` retained only for text steps with the N-6 residual documented in situ (F-2a closed, F-2b owner-deferred). |
| `src/telegram/callbacks.ts` | One answer per callback, alert-bearing | ✓ VERIFIED | `answerCallbackQuery({ show_alert: true })` on every denial/stale branch; e2e asserts `duplicateAnswers() === []` across three harnesses (F-3 closed). |
| `src/shared/logger.ts` | Allow-list redaction | ✓ VERIFIED | 6 passing unit tests incl. coordinate, token, draft-payload and non-Error-throw cases. |
| `prisma/schema.prisma` + 6 migrations | Durable config, drafts, callbacks, roster | ✓ VERIFIED | All SC1 fields + roster tables present with compound uniques; migrations applied by CI and by Testcontainers. |
| `.github/workflows/ci.yml` | Deterministic gate | ⚠️ Present but currently RED | Job would fail at "Integration tests" on windows 2/3. Acknowledged in 01-14's key-decisions ("CI is expected to report red"). |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `main.ts` | `create-bot.ts` | `logger` + `membershipGateway` passed into `createBot` | ✓ WIRED | F-4 root cause (1) closed. |
| `create-bot.ts` | `handlers.ts` | `registerChatReadinessHandlers(bot, services)` | ✓ WIRED | Single registration point. |
| `handlers.ts` | `authorization-service.ts` | `authorize()` → `requireCurrentAdministrator` | ✓ WIRED | 4 commands authorize at the top; 2 carrier routes authorize after `hasInFlightAction` (F-7 ordering fix). |
| `callbacks.ts` | `authorization-service.ts` | `deps.authorization.requireCurrentAdministrator` at `:239` | ✓ WIRED | Before token parse and action read. |
| `settings-handlers.ts` | PostgreSQL | `deps.settings.getCommitted` → `prisma.chatConfiguration.findUnique` | ✓ WIRED | No static fallback. |
| `setup-handlers.ts` | `settings-handlers.ts` | `editWithStep` mirrors `showPrompt` on the same `CallbackContext` | ✓ WIRED | Verified by `verify.key-links` and by read. |
| `planning-access-service.ts` | any handler | — | ✗ NOT_WIRED | Deferred to Phase 2 (accepted, see Deferred Items). |

Automated key-link check across gap-closure plans 01-16…01-22: 14/14 verified. Plan 01-13 reported 2/3 — the third is an `EISDIR` tooling artifact from pointing a pattern check at the `prisma/migrations` directory, not a real break.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `settings-handlers.ts` dashboard | `committed.configuration` | `prisma.chatConfiguration.findUnique` | Yes | ✓ FLOWING |
| `renderers.ts` review card | `draft` fields | `prisma.setupDraft` | Yes | ✓ FLOWING |
| `roster-handlers.ts` page | `members` | `roster.listActive` → `prisma.chatMembership.findMany` | Yes | ✓ FLOWING |
| `setup-handlers.ts` zone candidates | `candidates` | `GeoTzTimezoneResolver` (geo-tz boundary data, CI-smoke-tested in the image) | Yes | ✓ FLOWING |
| Restart persistence | all of the above | fresh `PrismaClient` + fresh `Bot` in the e2e | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Typecheck | `npm run build` (tsc --noEmit) | clean, no output | ✓ PASS |
| Unit suite (one full run) | `npm test` | 13 files / 73 tests passed | ✓ PASS |
| Integration suite (one full run) | `npx vitest run --project integration --no-file-parallelism` | 31 passed / **2 failed** (both `chat-configuration.test.ts`) | ✗ FAIL |
| Schedule floor invariant (F-6) | `validateSchedule({start:540, dur:60, window:600-1320})` | `{valid:false, reason:"outside-boundaries"}` | ✓ PASS |
| Schedule floor is inclusive | `validateSchedule({start:600, ...})` | `{valid:true}` | ✓ PASS |
| Every settings field reachable (F-5) | `settingsDashboardKeyboard` vs `SettingsField` enum | 8 rows, `unbound: []` | ✓ PASS |
| Policy row layout (F-9) | `SETUP_POLICY_BUTTONS` | 3 rows, one label each, no truncation | ✓ PASS |
| Format gate on tracked files | `prettier --check` cross-referenced with `git ls-files` | 38 warnings, **zero** on tracked files (all are untracked `.codex/`, `.agents/`, `.claude/` runtime files) | ✓ PASS |
| Live Telegram flow | — | never re-run since the 2026-08-24 NOT APPROVED verdict | ? SKIP → human |

Spot-check files were created in `tests/unit/` transiently and removed; `git status` confirms `src/` and `tests/` are clean.

### Probe Execution

No probes declared or discovered (`scripts/*/tests/probe-*.sh` does not exist; no PLAN or SUMMARY references probes). Step 7c: N/A.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|---|---|---|---|---|
| CONF-01 | 01-01…01-05, 01-07…01-09, 01-13, 01-14, 01-15, 01-16, 01-19, 01-21, 01-22 | Initialize with an IANA time zone | ✓ SATISFIED | Location → geo-tz candidates → explicit `Use <zone>` tap → persisted; e2e asserts `Europe/Kyiv` on the committed row. Bot never auto-picks. |
| CONF-02 | 01-06…01-09, 01-13, 01-14, 01-18, 01-20, 01-22 | Default rehearsal weekday and start time | ✓ SATISFIED | `defaultWeekday: 3`, `defaultStartMinute: 1170` persisted in the e2e; weekday keyboard 4+3 rows unit-tested. |
| CONF-03 | 01-06…01-09, 01-13, 01-14, 01-18, 01-20, 01-22 | Duration and daily boundaries | ✓ SATISFIED | `durationMinutes: 120`, `dailyStartMinute: 600`, `dailyEndMinute: 1320` persisted. F-5 (daily-end unreachable) and F-6 (missing floor) both closed and spot-checked. Repair migration `20260824000000_repair_schedule_window_floor` covers already-committed incoherent rows. |
| CONF-05 | 01-06…01-09, 01-13, 01-14, 01-22 | Availability-reminder times, default 10:00/16:00 | ✓ SATISFIED | `useDefaultReminders` writes `[600, 960]`; two-value entry path with range guard; e2e asserts the persisted array. |
| ROST-01 | 01-10, 01-13, 01-14, 01-22 | Add identifiable users to the roster | ✓ SATISFIED | Reply-anchored `/roster_add`; idempotent upsert + reactivation, both unit- and integration-tested; e2e confirmation copy exact. |
| ROST-02 | 01-11, 01-12, 01-13, 01-14, 01-16, 01-22 | Remove users | ✓ SATISFIED | Initiator-bound named confirmation, single consumption, soft-deactivation; 5 unit + 2 integration tests; e2e removal survives restart. |
| ROST-03 | 01-10…01-14, 01-20, 01-22 | View the current roster | ✓ SATISFIED | Pagination at 20, deterministic Unicode ordering, markup escaping, ID non-exposure, in-flight and failed-read projections — 15 passing unit tests. Empty-state copy matches the contract (F-8 was misfiled and correctly waived). |
| AUTH-01 | 01-06…01-09, 01-13, 01-14, 01-19, 01-22 | Choose the planning-start policy | ⚠️ PARTIAL | Choice is collectable at setup and editable at settings, and persists with a revision bump. But the only composed-bot gate for it is RED, and the evaluator that consumes the stored value is unwired (deferred to Phase 2). |
| AUTH-02 | 01-02…01-14, 01-16, 01-17, 01-21, 01-22 | Revalidate current permission before every protected action | ⚠️ PARTIAL | Revalidation itself is proven at all 9 routes. CR-01 is an open BLOCKER on the same method: transient lookup failure destroys the actor's drafts and is unlogged. |

**Orphaned requirements:** none. All 9 phase requirement IDs from ROADMAP.md appear in at least one PLAN's `requirements` frontmatter.

**Note:** `.planning/REQUIREMENTS.md` already marks all 9 as `Complete` in its traceability table. That flip preceded any passing verification and is not supported by this report.

### Test Quality Audit

| Area | Active | Skipped | Circular | Assertion Level | Verdict |
|---|---|---|---|---|---|
| `tests/unit/*` (13 files) | 73 | 0 | none | Value + Behavioral | ✓ Strong |
| `tests/integration/*` (5 files) | 33 | 0 | none | Behavioral (real PostgreSQL via Testcontainers) | ⚠️ 2 failing |
| `chat-readiness.e2e.test.ts` | 9 | 0 | none | Behavioral, composed bot + real DB + restart | ✓ Strong |

- **Disabled tests on requirements:** 0 — no `.skip`, `.todo`, `xit`, or `.only` anywhere in `tests/`.
- **Circular patterns detected:** 0 — no fixture-generating script imports a system-under-test.
- **Failing tests on requirements:** 2, both on AUTH-01 → contributes to `gaps_found`.
- **Notable strength:** `update-path-logging.test.ts` asserts the positive existential (≥12 error-binding catch clauses) BEFORE the absence claim (zero unbound catches), which is exactly the anti-vacuity ordering that F-4 exposed as missing. I re-ran it; it passes. `src/telegram/` has zero bare `catch {}` clauses.
- **Residual:** 15 bare `catch {}` remain outside `src/telegram/` (domain + shared layers). Plan 01-22 scoped itself to `src/telegram`, which is defensible, but `authorization-service.ts:37` is one of them and is precisely CR-01.

### Decision Coverage

All trackable CONTEXT.md decisions are honored by shipped artifacts — 14/14 honored, 0 not honored. Non-blocking gate; no action required.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/domain/auth/authorization-service.ts` | 34-53 | Empty `catch {}` followed by destructive `deleteMany` on the unobserved-role path | 🛑 BLOCKER | CR-01 — silent, unrecoverable data loss for a still-current administrator on any transient Telegram failure. |
| `tests/integration/chat-configuration.test.ts` | 186, 302 | Two failing assertions encoding open broken windows 2 and 3 | 🛑 BLOCKER | The AUTH-01 composed-bot gate is red at the very gate the windows were deferred to. |
| `src/telegram/setup-handlers.ts` | 443-449 | Unconditional "This chat is not configured yet." | ⚠️ Warning | WR-07 — the one message shown when re-running setup on a configured chat is false, and contradicts `renderSettingsProjection`'s correct use of the same claim. |
| `src/domain/auth/planning-access-service.ts` | 39-43 | Export referenced only by its own test | ⚠️ Warning | WR-10 — `planning_access_policy` is write-only until Phase 2. Accepted as deferred. |
| `src/domain/chat/setup-service.ts`, `prisma/schema.prisma` | 190-199, 16-18/58-59 | `candidateTimezone` written only as a duplicate of `timezone`; single-member `SetupStep` enum never transitioned | ⚠️ Warning | WR-10 — persisted columns that read as a two-phase confirm that does not exist. |
| `src/telegram/roster-handlers.ts` | 274-288 | `try` spans both the durable read and the terminal `emit` | ⚠️ Warning | WR-08 — a Telegram delivery failure is logged as a projection failure, then retried on the same broken channel, producing two log lines with two classifications for one fault. |
| `src/domain/chat/settings-service.ts` and 4 others | various | 15 bare `catch {}` outside `src/telegram/` | ⚠️ Warning | WR-06 — storage failures collapse to `{ kind: "failed" }` with no trace. Same defect class as F-4, one layer down. |
| `.planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md` | whole file | Written in Ukrainian | ⚠️ Warning | Violates the CLAUDE.md constraint "All project and planning documentation must be written in English." |
| ROADMAP Phase 1 | — | `Mode: mvp` but the goal is not a User Story | ⚠️ Warning | MVP-mode verification requires `As a …, I want to …, so that ….`; `user-story.validate` returns `valid: false` on all three slots. I verified against the four explicit Success Criteria instead — they are specific and testable — but the mode/goal mismatch should be reconciled (`/gsd mvp-phase 01`) or the mode dropped. |

No `TBD`, `FIXME` or `XXX` debt markers anywhere in `src/`, `tests/` or `prisma/`.

### Human Verification Required

#### 1. Live Telegram re-run (the phase's own blocking gate)

**Test:** Execute `01-LIVE-VERIFICATION-RUNBOOK.md` steps 1-6 against the repaired build in a real private group with a real bot.
**Expected:** Verdict `approved`. UAT tests 3, 6, 8, 14, 17, 18 flip from issue/pending to pass; the three skipped tests (12, 13, 16) are actually run.
**Why human:** This is plan 01-14 Task 2's checkpoint. It ran once, on 2026-08-24, and returned NOT APPROVED with nine findings. Every fix is in the tree and I verified each by reading the code; none has been seen by a Telegram client.

#### 2. Setup wizard in-place card replacement and copy (F-1, F-2, F-5, F-6, F-9)

**Test:** Run /setup through all eight steps on a phone, then re-run /setup on the now-configured chat.
**Expected:** Callback-driven steps replace their card; steps 3/5/6 name the value asked for; step 8 shows three untruncated full-width policy buttons; a rehearsal starting before the daily window opens is rejected; the second /setup does not claim the chat is unconfigured (currently it does — WR-07).
**Why human:** Client rendering and label truncation are invisible to a transport double.

#### 3. Live demotion timing (F-7)

**Test:** Demote the acting administrator in the Telegram UI, then immediately tap a protected button and send a protected command. Then restore admin rights.
**Expected:** Both denied on the next action with the verbatim copy; drafts gone; configuration revision unchanged; restoring rights does not resurrect the draft; ordinary non-admin chat messages get NO reply.
**Why human:** Depends on real `getChatMember` propagation.

#### 4. Non-default planning-access policy end to end

**Test:** From /settings, change planning access to "Previous participants", save, restart the bot, re-open /settings.
**Expected:** Review card shows Current/New correctly; the dashboard and database both show `PREVIOUS_PARTICIPANTS` with revision incremented; it survives the restart.
**Why human:** No passing automated gate drives this through the composed bot with a non-default value.

#### 5. F-2b residual (owner-accepted)

**Test:** Observe the six text-input wizard steps in the live client.
**Expected:** They still append rather than edit (deferred as backlog N-6 by owner decision 2026-08-24). Confirm the residual is still acceptable.
**Why human:** An explicit accepted deviation whose impact was judged from a single run.

### Gaps Summary

The gap-closure wave did real work. I verified every one of the nine live findings against the code myself rather than against the summaries: F-1 (renderers name each value), F-2a (`editWithStep` mirrors `showPrompt`), F-3 (`show_alert` on every stale/denial branch), F-4 (logger threaded from `main.ts`, zero bare catches in `src/telegram/`, anti-vacuity ordering in the gate), F-5 (`DAILY_END_MINUTE` bound, `unbound: []`), F-6 (floor check, spot-checked inclusive), F-7 (carrier-route ordering with `hasInFlightAction` before the role check), F-8 (correctly waived as misfiled), F-9 (three single-button rows). Typecheck is clean, 73 unit tests pass, and the e2e proves setup → restart → settings edit → roster add/list/remove → restart against real PostgreSQL through the composed bot. Success Criteria 2 and 4 are genuinely met.

Three things stop this being a passing phase.

**First, the phase's central gate has never passed.** Plan 01-14's SUMMARY says `status: halted` and its D5 deliverable records `verification: []` with the rationale "EXECUTED AND NOT APPROVED". The runbook still carries the 2026-08-24 negative verdict on line 5. 01-UAT.md still stands at 5 `issue` / 1 `pending` / 3 `skipped`. Plan 01-22 was scrupulous about this — it reset UAT test 6 to `pending` rather than flip it to pass, writing down that "marking it passed would repeat the exact error the plan exists to correct." That discipline should not be undone here. A phase whose live-verification gate returned NOT APPROVED and was never re-run is not verified, however green its unit tests are. Meanwhile `01-14-SUMMARY.md` lists all nine requirement IDs under `requirements-completed` and `REQUIREMENTS.md` already marks them `Complete` — both claims run ahead of the evidence.

**Second, CR-01 is a live data-loss defect on the authorization path.** `requireCurrentAdministrator` treats "Telegram did not answer" and "this user is not an administrator" as the same fact, then hard-deletes both of the actor's drafts before denying. A 429 during a live wizard costs a genuine administrator thirty minutes of input and tells them something false. The empty `catch {}` means nobody finds out. `tests/unit/authorization.test.ts` asserts only that a throwing gateway denies — it never asserts that nothing was deleted — so the destructive path is unguarded in both directions. This is the F-4 defect class in the one place where it costs durable data, and it sits in the service that Success Criterion 4 depends on.

**Third, two broken windows arrived at the gate they were deferred to and were not opened.** Windows 2 and 3 were filed on 2026-08-21 with the note "deferred to the phase regression gate." This is that gate. I ran the integration suite myself: 31 pass, 2 fail, both in `chat-configuration.test.ts`, both on the planning-access path. Window 2 is genuinely a stale test expectation — I confirmed the dashboard renders "Edit time zone" at index 0 — but the effect is that the only composed-bot test of AUTH-01 is red, and the e2e's `completeSetup` only ever selects `ADMINS_ONLY`, which equals the default, so a silently no-op policy write would pass everything that is green. Window 3 is a real undecided contract question: `selectPlanningAccessPolicy` fails soft where the test expects a throw, and nobody has ruled on which is correct. CI is knowingly red as a result.

None of the three is large. All three are the kind of thing that gets absorbed into a "complete" phase and then costs a milestone later.

---

_Verified: 2026-08-26T03:00:00Z_
_Verifier: Claude (gsd-verifier)_
