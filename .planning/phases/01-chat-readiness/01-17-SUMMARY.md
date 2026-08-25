---
phase: 01-chat-readiness
plan: 17
subsystem: telegram
tags: [grammy, telegram, authorization, routing, prisma, regression-testing]

# Dependency graph
requires:
  - phase: 01-16
    provides: The callback-boundary acknowledgement ordering; this plan reorders the sibling update boundary without touching it
provides:
  - A read-only route-ownership probe (`hasInFlightAction`) that runs before authorization on the two carrier routes
  - Silence for an ordinary non-administrator message — zero outbound calls, zero getChatMember, zero deleteMany
  - An explicit route model distinguishing always-protected routes from in-flight-only routes (`protectedWhen`)
  - The regression that could have caught F-7, plus its administrator control and the AC-4 ordering gate
affects: [01-18, 01-19, 01-20, availability-card, live-verification]

# Actuals (#2632)
actuals:
  tokens: 15957
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Carrier route vs protected action: establish route ownership with a read-only, own-rows-only probe BEFORE the authorization gate"
    - "Keep the denial path flowing through the service that owns the side effect, so ordering guarantees hold by construction rather than by handler discipline"

key-files:
  created:
    - tests/unit/update-route-ownership.test.ts
  modified:
    - src/telegram/handlers.ts
    - tests/integration/chat-readiness.e2e.test.ts
    - .planning/WINDOWS.md

key-decisions:
  - "An EXISTING draft row counts as an in-flight action regardless of its expiresAt. This binds G-01-14 missing[2]: the documented DRAFT_EXPIRED copy stays reachable, and the probe stays read-only (SetupService.requireActive deletes an expired row before reporting it, so it must never be used as the gate)."
  - "protectedRoute stays true on all nine routes — every route still crosses the same authorization boundary. The new protectedWhen member records the condition the flat flag was hiding, rather than replacing the flag."
  - "The probe reads the actor's own (chatId, actorUserId) rows only, via findUnique on the compound unique key, and writes nothing — which is what makes running it ahead of the role check safe (T-01-17-01)."

patterns-established:
  - "Route-ownership probe: two findUnique reads on the acting user's own compound key, short-circuiting on the first hit, returning a boolean to the router"
  - "Drive a carrier route BOTH ways in tests — with a prompt in flight and without — or the suite cannot distinguish 'authorizes before a protected action' from 'authorizes before any message'"

requirements-completed: [AUTH-02]

coverage:
  - id: D1
    description: "An ordinary non-administrator text message with no draft produces zero outbound messages, zero current-role lookups and zero draft deletions"
    requirement: "AUTH-02"
    verification:
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#says nothing to a non-administrator ordinary message with no draft"
        status: pass
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts#registers every Phase 1 route once and gates each protected route on the current administrator"
        status: pass
    human_judgment: false
  - id: D2
    description: "The administrator control: the same ordinary sentence from an administrator is still silent, so an unconditional-silence fix cannot pass"
    verification:
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#says nothing to an administrator ordinary message with no draft"
        status: pass
    human_judgment: false
  - id: D3
    description: "A non-administrator answering a live prompt is still refused with the verbatim COMMAND_DENIAL, after exactly one fresh role lookup, with both drafts deleted before the refusal (AC-4)"
    requirement: "AUTH-02"
    verification:
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#still denies a non-administrator answering a live prompt, with the draft already deleted"
        status: pass
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts#registers every Phase 1 route once and gates each protected route on the current administrator"
        status: pass
    human_judgment: false
  - id: D4
    description: "A non-administrator sharing a location with no draft of either kind produces zero outbound calls — the location carrier route behaves identically to the text one"
    verification:
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#says nothing to a non-administrator sharing a location with no draft"
        status: pass
    human_judgment: false
  - id: D5
    description: "An existing-but-expired draft row still counts as in-flight, so the wizard is still entered and the DRAFT_EXPIRED copy stays reachable"
    verification:
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#hands an administrator with an existing draft row to the wizard, keeping the expiry copy reachable"
        status: pass
    human_judgment: false
  - id: D6
    description: "The route table records the always-protected / in-flight-only distinction, and the route-inventory assertion checks both invariants"
    verification:
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts#registers every Phase 1 route once and gates each protected route on the current administrator"
        status: pass
    human_judgment: false
  - id: D7
    description: "The four command branches are byte-identical to their pre-change form"
    verification:
      - kind: other
        ref: "git diff c6be045 HEAD -- src/telegram/handlers.ts | grep 'bot.command' (no matches)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Broken window 5 (F-7) is closed"
    verification:
      - kind: other
        ref: "gsd-tools windows status — open_count 10 -> 9, entry 5 status fixed"
        status: pass
    human_judgment: false
  - id: D9
    description: "In a live Telegram group, an ordinary non-administrator message draws no reply, and a demoted actor answering a live prompt is still refused"
    verification: []
    human_judgment: true
    rationale: "F-7 was found on a live run and the automated proof is a fake Prisma plus a transport double, not Telegram. The live-demotion test (UAT test 14 / runbook step 5a-5d) was non-probative precisely because the refusal appeared with and without demotion; only a live re-run can confirm the refusal is now specific to a genuine protected attempt."

# Metrics
duration: 11 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 17: Update Route Ownership Summary

**A read-only own-rows probe ahead of the administrator gate on `message:text` and `message:location`, so an ordinary non-administrator message is answered with silence instead of a refusal — and a `protectedWhen` member that names the carrier-vs-action conflation the flat `protectedRoute: true` flag was hiding.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-25T08:43:30Z
- **Completed:** 2026-08-25T08:54:00Z
- **Tasks:** 2 (Task 1 ran RED → GREEN)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Closed **G-01-14 / F-7 / broken window 5**: the two update routes now establish route ownership before authorizing, so a non-administrator sending an ordinary sentence — which in a live group happens on every reply to any bot prompt, because privacy mode still delivers replies — gets no reply, no `getChatMember` call and no `deleteMany` round-trips (also removes T-01-17-04).
- Bound the open expired-draft question explicitly: an existing row counts as in-flight **regardless of expiry**, which keeps the documented `DRAFT_EXPIRED` copy reachable and keeps the probe read-only. `SetupService.requireActive` is deliberately NOT used as the gate because it deletes an expired row before reporting it.
- Preserved AC-4 by construction: the protected case still flows through `AuthorizationService.requireCurrentAdministrator`, which owns both draft deletions strictly before its throw. No role check was hand-rolled and no deletion was moved.
- Killed the escape cause. The e2e route-composition test only ever sent `"19:30"` — a plausible wizard answer — and asserted every update route must authorize and must deny, certifying the defect. Each carrier route is now driven **both** ways: once with a live draft (still authorizes, still denies, draft already gone) and once with none (total silence).
- Split the route model so the code says what it means: `protectedWhen: "always" | "in-flight"`, with the doc comment naming the conflation as the model error behind F-7.

## Task Commits

1. **Task 1 (RED): failing route-ownership regression** — `0f6c37d` (test)
2. **Task 1 (GREEN): route ownership before authorization + corrected e2e rows** — `1bce8f6` (feat)
3. **Task 2: split the route model, close window 5** — `f4f7395` (refactor)

No separate REFACTOR commit for Task 1: the GREEN implementation is already minimal (one helper, two short-circuit reads, two moved gate calls).

## Files Created/Modified

- `tests/unit/update-route-ownership.test.ts` — **created.** The regression ported from the diagnosis reproduction: all three cases (hypothesis, administrator control, AC-4 ordering) plus the location case and the expired-row case. Records `sent`, `deletions`, `reads` and a single ordered `order` trace so delete-before-deny is assertable directly rather than inferred.
- `src/telegram/handlers.ts` — `hasInFlightAction` helper; the gate moved after it on `message:location` and `message:text` only; `ChatReadinessProtection` type and `protectedWhen` on all nine routes; doc comments rewritten on `CHAT_READINESS_ROUTES` and `registerChatReadinessHandlers`.
- `tests/integration/chat-readiness.e2e.test.ts` — route loop split into `alwaysProtected` (four commands, assertions unchanged) and `carrierUpdates` (driven both ways); route-inventory assertion now checks both invariants.
- `.planning/WINDOWS.md` — window 5 marked fixed (`open_count` 10 → 9).

## Decisions Made

- **Expired rows count as in-flight (G-01-14 `missing[2]`).** The alternative — treating a lapsed draft as an ordinary message — would silently swallow the `DRAFT_EXPIRED` copy the Copywriting Contract requires. The probe therefore tests row existence, not liveness, and the wizard keeps deciding what a lapsed row means. Pinned by the fifth unit case, which uses a row already 60 s past `expiresAt`.
- **`protectedRoute: true` stays on every route.** The plan called for a discriminating member, not a replacement: all nine routes genuinely cross the same boundary. Removing the flag would have swapped one imprecise model for another.
- **The probe short-circuits.** If the setup-draft read hits, the settings-draft read is skipped. An ordinary message pays two indexed `findUnique` reads; an in-flight one often pays a single read.
- **`registerRosterHandlers` untouched.** It registers no update route (confirmed in the diagnosis), so it cannot emit a denial for an ordinary message.

## Deviations from Plan

None — plan executed exactly as written.

The plan's `<action>` for Task 1 also required rewriting the `registerChatReadinessHandlers` doc comment implicitly (it asserted the old, now-false ordering: "authorizes first and only then decides ... which surface owns the turn"). That was updated inside the same commit as a direct consequence of the specified change, not as a separate deviation.

**Total deviations:** 0.
**Impact on plan:** None. `src/telegram/handlers.ts` is the only source file changed.

## Verification Results

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npx vitest run --project unit tests/unit/update-route-ownership.test.ts` | PASS — 5 tests, all behavior-block cases |
| `npm test` (full unit project) | PASS — 11 files, 57 tests (baseline was 10 / 52) |
| `npx vitest run --project integration tests/integration/chat-readiness.e2e.test.ts` | PASS — 9 tests |
| `npx vitest run --project integration --no-file-parallelism` (whole project) | 30 passed, 2 failed — byte-identical to the fork-point baseline (broken windows 2 and 3) |
| `npm run format:check` | PASS |
| `git diff c6be045 HEAD -- src/telegram/handlers.ts \| grep bot.command` | No matches — the four command registrations are byte-identical |
| `windows status` | `open_count` 10 → 9; entry 5 `fixed` |

### Task 1 acceptance criteria

| Criterion | Result |
|---|---|
| Ordinary non-administrator text with no draft → empty outbound call list | PASS |
| Same message from an administrator → empty outbound call list | PASS |
| Non-administrator with a draft row → verbatim denial, both deletions recorded before it | PASS — `deletions` holds both markers and `order` places them before `api:sendMessage` |
| Probe issues only `findUnique` reads on the acting user's own chat/actor pair, no write | PASS — `reads` asserted exactly `[setupDraft, settingsEditDraft]`, both keyed `chatId_actorUserId` for the actor |
| The four command branches are byte-identical | PASS |

### RED evidence

Before the fix, the two ordinary-message cases failed for exactly the right reason — the received value was the verbatim `COMMAND_DENIAL` sendMessage, matching the diagnosis reproduction's CASE 1. The other three cases (administrator control, AC-4 ordering, expired-row) passed at RED and still pass, so the fix is narrow.

## Issues Encountered

- **The worktree had no dependencies.** `node_modules` and `src/generated` are gitignored and absent in a fresh worktree, so nothing could be verified initially. Resolved exactly as plan 01-16 did: symlinked the main checkout's `node_modules` and ran `prisma generate` with a placeholder `DATABASE_URL`. Both paths are gitignored, no tracked file was affected, and no package was installed, added or upgraded — threat T-01-17-SC holds, the lockfile is untouched.
- **`gsd-tools.cjs` is not present inside the worktree.** `.claude/gsd-core/` is untracked in the main repo, so the plan's literal `node .claude/gsd-core/bin/gsd-tools.cjs windows fixed 5` fails with MODULE_NOT_FOUND. Ran the same command against the main checkout's absolute path; it resolved `.planning/WINDOWS.md` from cwd and correctly wrote the worktree copy.
- **Broken windows 2 and 3 remain open by design** — pre-existing `chat-configuration.test.ts` failures, outside this plan's scope. Their failure signatures were captured before and after the change and are unchanged.
- **Full-project integration runs must be serial.** Confirmed again: `--no-file-parallelism` is clean; parallel runs produce spurious Testcontainers `P1001` errors. Pre-existing harness characteristic, not a regression.

## Known Stubs

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **F-7 is closed and the live-demotion test is probative again.** Because an ordinary message no longer draws a refusal, a refusal now means something: the live runbook's demotion step (UAT test 14 / step 5a-5d) can finally distinguish "authorization was re-checked" from "the bot refuses everything".
- **Owed to the orchestrator:** the usual post-merge `STATE.md` / `ROADMAP.md` progress writes. This plan requires no STATE.md decision-bullet replacement — its decisions are recorded here and are additive, not superseding.
- `AUTH-02` is also declared by plan 01-16; it already reads `Complete` in `REQUIREMENTS.md`, so no requirements write was needed.
- A live Telegram run is still the only proof of D9. Worth pairing with the 01-19 (F-2) live pass rather than spending a separate session.

## Self-Check: PASSED

- `tests/unit/update-route-ownership.test.ts` present on disk; all three modified files present; SUMMARY.md present.
- All three task commits present on `worktree-agent-af5d5e434cbcc7dbc`: `0f6c37d`, `1bce8f6`, `f4f7395`.
- No file deletions in any commit (`git diff --diff-filter=D` empty across the range).
- Working tree otherwise clean; `node_modules` and `src/generated` are gitignored.

---
*Phase: 01-chat-readiness*
*Completed: 2026-08-25*
