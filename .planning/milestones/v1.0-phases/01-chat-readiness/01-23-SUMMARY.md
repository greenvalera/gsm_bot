---
phase: 01-chat-readiness
plan: 23
subsystem: api
tags: [telegram, grammy, prisma, routing, expiry, copywriting]

# Dependency graph
requires:
  - phase: 01-22
    provides: Bounded per-surface catch-site tables and the classified handler logging the expiry path reuses
  - phase: 01-17
    provides: Carrier-route ownership probe (hasInFlightAction) that claims an update on a lapsed draft
  - phase: quick/260826-e62
    provides: Fail-closed, non-destructive AuthorizationService behaviour on an unanswerable membership lookup
provides:
  - Tri-state settings-draft classification (missing / expired / active) replacing a two-way null
  - Actor/chat/id/expiry-bound deletion of a lapsed settings-edit draft
  - A settings-specific expiry sentence emitted on both carrier routes
  - Composed-route regressions covering all three lookup outcomes on message:text and message:location
  - A distinct Expired settings edit row in the Copywriting Contract
affects: [settings surface, setup wizard, carrier-route dispatch, live verification run 3]

# Actuals (#2632)
actuals:
  tokens: 7200
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discriminated lookup result over a collapsed null when two distinct states need different outcomes"
    - "Read-only classification on a carrier route; durable cleanup only after the fresh administrator check"
    - "One bound deleteMany predicate that is structurally incapable of removing a live row"
    - "Per-surface expiry copy with no generic fallback between surfaces"

key-files:
  created: []
  modified:
    - src/telegram/settings-handlers.ts
    - src/domain/chat/settings-service.ts
    - src/telegram/handlers.ts
    - tests/unit/update-route-ownership.test.ts
    - .planning/phases/01-chat-readiness/01-UI-SPEC.md

key-decisions:
  - "An expired settings-edit draft is a named routing outcome, not a null collapsed with missing; that ambiguity was finding F-10 itself."
  - "Cleanup of a lapsed draft runs after the fresh administrator check, never inside the read-only ownership probe."
  - "discardExpiredDraft binds id, chat, actor and expiresAt <= now in a single deleteMany, so a renewed draft cannot be destroyed by a stale observation."
  - "The expiry reply is unconditional: a failed cleanup is logged under err and the sentence still goes out, because silence is the defect being closed."
  - "Each surface owns its expiry sentence; the Copywriting Contract carries no generic expiry row and no fallback between setup and settings."

patterns-established:
  - "Tri-state lookup: a carrier route that can claim an update must be able to name why it claimed it."
  - "Bound-delete predicate: every clause of the where is an authorization or freshness claim, asserted by a semantic fake rather than a call counter."

requirements-completed: [CONF-01, CONF-02, CONF-03, CONF-05, AUTH-02]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "An expired settings-edit row is classified as its own routing outcome instead of collapsing into the missing case"
    requirement: CONF-02
    verification:
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#authorizes, discards only the lapsed row, and answers with settings expiry copy"
        status: pass
    human_judgment: false
  - id: D2
    description: "An administrator whose settings-edit draft expired receives the exact settings expiry sentence on a text update, and the setup wizard is never consulted"
    requirement: CONF-02
    verification:
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#authorizes, discards only the lapsed row, and answers with settings expiry copy"
        status: pass
    human_judgment: false
  - id: D3
    description: "The same lapsed settings edit answered with a location produces the identical sentence, cleanup and wizard silence"
    requirement: CONF-02
    verification:
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#answers a lapsed timezone edit answered with a location the same way"
        status: pass
    human_judgment: false
  - id: D4
    description: "The lapsed draft is discarded by an id/chat/actor/expiry-bound predicate and committed configuration is never written"
    requirement: CONF-03
    verification:
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#binds the discard to the observed id, chat, actor and lapsed expiry"
        status: pass
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#authorizes, discards only the lapsed row, and answers with settings expiry copy"
        status: pass
    human_judgment: false
  - id: D5
    description: "Once the lapsed row is gone an ordinary message returns to the silent no-in-flight path with no reply and no role lookup"
    requirement: CONF-01
    verification:
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#returns to the silent no-in-flight path once the lapsed row is gone"
        status: pass
    human_judgment: false
  - id: D6
    description: "Route ownership still precedes the fresh administrator check, and an unanswerable membership lookup still denies fail-closed without deleting the draft"
    requirement: AUTH-02
    verification:
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#keeps the lapsed row intact when the membership lookup cannot be answered"
        status: pass
      - kind: unit
        ref: "tests/unit/authorization.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "Active and missing settings-draft outcomes keep their existing destination and user-facing behaviour on both carrier routes"
    requirement: CONF-05
    verification:
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#hands a live settings text edit to the settings surface, not the wizard"
        status: pass
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#still resolves a live timezone edit answered with a location"
        status: pass
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#still hands a location to the wizard when no settings draft exists"
        status: pass
    human_judgment: false
  - id: D8
    description: "The Copywriting Contract carries distinct setup-expiry and settings-expiry rows with no ambiguous generic fallback"
    requirement: CONF-02
    verification:
      - kind: other
        ref: "grep -n 'Expired setup draft|Expired settings edit|no generic expiry sentence' .planning/phases/01-chat-readiness/01-UI-SPEC.md"
        status: pass
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#keeps the two expiry sentences distinct"
        status: pass
    human_judgment: false
  - id: D9
    description: "UAT test 23 — the settings expiry sentence actually reaches the group chat in a live Telegram run against a settings_edit_drafts row past its TTL"
    requirement: CONF-02
    verification: []
    human_judgment: true
    rationale: "F-10 was structurally undiscoverable from a clean database and was found only by live run 2 against an inherited volume. The unit suite proves the routing, cleanup and sentence; it cannot prove Telegram delivery to a real group. UAT test 23 stays pending by the plan's own success criteria until the third live run."

# Metrics
duration: 10 min
completed: 2026-08-26
status: complete
---

# Phase 01 Plan 23: Expired Settings Edit Routing Summary

**A lapsed settings-edit draft is now a named routing outcome with its own expiry sentence, bound cleanup, and coverage on both carrier routes — closing F-10 / broken window 14.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-26T18:52:00Z
- **Completed:** 2026-08-26T19:02:06Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Replaced the `missing`/`expired` ambiguity in `findSettingsDraft` with a discriminated `SettingsDraftLookup`. That single collapsed `null` **was** finding F-10: a carrier route could not tell "this update answers a lapsed settings edit" from "this update belongs to the setup wizard", so it handed the update to a wizard that owned no draft and returned in silence.
- Added `SettingsService.discardExpiredDraft`, which deletes through one `deleteMany` bound by `id`, `chatId`, `actorUserId` and `expiresAt <= now`. The expiry clause makes the statement structurally incapable of removing a draft a concurrent `beginEdit` renewed between the read and the delete.
- Added `handleExpiredSettingsDraft`, emitting the settings-specific sentence `This settings change expired after 30 minutes of inactivity. Open /settings to start again.` on both `message:text` and `message:location`, ahead of both the active-settings and setup destinations.
- Extended `tests/unit/update-route-ownership.test.ts` from 5 to 14 cases with a mutable settings-draft fake whose `deleteMany` is a semantic predicate rather than a call counter — so "an active draft is not deleted" is a property the fake can actually falsify.
- Gave the Copywriting Contract a distinct `Expired settings edit` row, renamed the old row to `Expired setup draft`, and rewrote the general expiry bullet to name the owning surface and forbid any fallback between the two.

## Task Commits

1. **Task 1 (tracer, TDD RED): failing test for expired settings-edit text routing** — `f22f767` (test)
2. **Task 1 (tracer, TDD GREEN): route an expired settings text edit to settings expiry copy** — `850b6db` (feat)
3. **Task 2 (TDD): apply the settings expiry contract to location edits** — `f9b228a` (feat)

_Task 2's RED and GREEN are one commit: its RED addition was a single location case against the harness Task 1 had already built, and the three sibling cases in the same commit are pre-existing-behaviour controls that passed before the change._

## Files Created/Modified

- `src/telegram/settings-handlers.ts` — `SettingsDraftLookup`, read-only tri-state `findSettingsDraft`, `handleExpiredSettingsDraft`, the settings expiry constant, and two new bounded catch sites.
- `src/domain/chat/settings-service.ts` — `discardExpiredDraft`, the actor/chat/id/expiry-bound lapsed-draft deletion.
- `src/telegram/handlers.ts` — both carrier routes dispatch all three lookup outcomes; the `expired` branch precedes every other destination.
- `tests/unit/update-route-ownership.test.ts` — mutable settings-draft fake, real `SettingsService`, committed-configuration write tracking, and 9 new cases.
- `.planning/phases/01-chat-readiness/01-UI-SPEC.md` — distinct expiry rows and a fallback-free expiry rule.

## Decisions Made

- **The expiry reply is unconditional.** `discardExpiredDraft` is wrapped in a catch that logs under `err` and lets the sentence go out anyway. A failed cleanup leaves the row lapsed — the same state the administrator was already in — so the sentence stays true, and absorbing the failure silently would reproduce F-10 exactly.
- **Cleanup stays out of the ownership probe.** `findSettingsDraft` remains read-only so nothing durable mutates ahead of the fresh administrator lookup; discarding happens downstream of that gate. This is the AUTH-02 ordering the composed-route test asserts as an exact call sequence.
- **The catch site carries the carrier that claimed the update.** `handleExpiredSettingsDraft` takes the route id and picks between `expiredDraftText` and `expiredDraftLocation`, so the closed catch-site vocabulary established in 01-22 stays closed and the record names the surface an operator would look at.
- **Task 1 adapted the location route without fixing it.** Changing `findSettingsDraft`'s return type broke the location route's `!== null` check at compile time. Task 1 mapped it to `lookup.kind === "active"`, preserving today's behaviour exactly (expired still fell to setup); Task 2 then inserted the `expired` branch. This kept Task 1's `npm run build` honest without silently doing Task 2's work.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added failure handling around the lapsed-draft discard**

- **Found during:** Task 1 (`handleExpiredSettingsDraft`)
- **Issue:** The plan specified calling the service method and emitting the copy. An unhandled throw from `deleteMany` would propagate out of the handler before `ctx.reply`, returning the user to silence — the precise defect F-10 describes, re-entered through a different door.
- **Fix:** Wrapped the discard in a catch that logs through the existing `logSettingsFailure` with two new bounded catch sites (`expiredDraftText`, `expiredDraftLocation`), then sends the sentence regardless.
- **Files modified:** `src/telegram/settings-handlers.ts`
- **Verification:** `npm run build`; the catch sites satisfy the module's `satisfies Record<string, Readonly<{route: ChatReadinessRouteId; outcome: string}>>` constraint, so the route label stays inside the closed union.
- **Committed in:** `850b6db` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary for the plan's own must-have truth — an expiry that throws must still speak. No scope creep; no new dependency, schema, or public surface.

## Threat Model Disposition

| Threat ID | Disposition | Where mitigated |
|---|---|---|
| T-01-23-01 | mitigated | Ownership probe → fresh membership lookup → settings lookup → cleanup order asserted as an exact `toStrictEqual` call sequence. |
| T-01-23-02 | mitigated | `discardExpiredDraft`'s four-clause predicate, asserted against a semantic fake that refuses to delete a live or foreign row; committed-configuration writes asserted empty. |
| T-01-23-03 | mitigated | The silent fallthrough is replaced by an exact user-visible sentence; the existing bounded route log is untouched, and cleanup failure gets its own bounded catch site. |
| T-01-23-04 | mitigated | The CR-01 path is unchanged and now has a composed-route regression: a throwing membership lookup denies and leaves the lapsed draft intact. |

The CONF-02 prohibition flagged `unverified` in the plan frontmatter — "MUST NOT silently consume an update that the router claimed as an expired settings-edit attempt, or tell the administrator to restart the unrelated setup wizard" — is now asserted directly: the expired cases assert a non-empty reply, assert `setup.requireActive` is never called, and assert the setup sentence never appears among sent texts.

## Issues Encountered

- The worktree had no `node_modules` and no generated Prisma client. Both are gitignored build artifacts, so they were symlinked from the main checkout to make `npm run build` and the unit suite runnable. Nothing was staged or committed as a result; `git status` stayed limited to the five intended files.

## Verification Results

| Check | Result |
|---|---|
| `npm run build` | pass |
| `npx vitest run --project unit tests/unit/update-route-ownership.test.ts tests/unit/authorization.test.ts` | pass — 17 tests |
| `npx vitest run --project unit` (full suite) | pass — 83 tests, 13 files |
| `npm run format:check` | pass |
| `git diff -- prisma package.json package-lock.json` empty for this plan | pass — no files matched across all three commits |

## Known Stubs

None. The changed files were scanned for `TODO`, `FIXME`, placeholder text, and skipped/todo tests; nothing was found, and no entry was appended to `.planning/WINDOWS.md`.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- F-10 is closed in code and in automated route coverage for both carrier input modes.
- **Broken window 14 is deliberately NOT marked fixed in `.planning/WINDOWS.md`.** F-10 was found live, against an inherited database volume, and was structurally undiscoverable from a clean one. UAT test 23 stays `[pending]` by this plan's own success criteria until the third live Telegram run confirms the sentence reaches the group; marking the window fixed on unit evidence alone would repeat the pattern this phase has already been burned by.
- F-11 (`/setup` claims an already-configured chat is unconfigured, broken window 15, UAT test 22) is untouched here — it belongs to a sibling gap-closure plan. AC-5 stays failing until both land and the live run passes.
- No Prisma schema, migration, dependency, or callback-token change, so nothing downstream needs regeneration.

## Self-Check: PASSED

- All five modified files present on disk.
- All four commits present in `git log`: `f22f767`, `850b6db`, `f9b228a`, `521d1ce`.
- Both tasks' `<acceptance_criteria>` re-run and passing (8 of 8).
- Plan-level `<verification>` re-run: build, focused tests, full unit suite, `format:check`, and the empty `prisma`/`package.json`/`package-lock.json` diff — all pass.

---
*Phase: 01-chat-readiness*
*Completed: 2026-08-26*
