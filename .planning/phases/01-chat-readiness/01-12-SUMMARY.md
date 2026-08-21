---
phase: 01-chat-readiness
plan: 12
subsystem: roster
tags: [telegram, roster, pagination, unicode, privacy, authorization]
requires:
  - phase: 01-11
    provides: Initiator-bound roster removal actions and the safe roster projection module
provides:
  - Deterministic safe roster labels with an internal-only Telegram ID tie-breaker
  - Fixed alphabetical pages of 20 with an exact footer and opaque page actions
  - In-flight, failure, and bound-retry roster states that never show a partial page
  - Page/retry callback actions that revalidate the current administrator before roster access
affects: [chat-readiness, rehearsal-participants, authorization]
actuals:
  tokens: 13687
  tasks: 1
  commits: 2
tech-stack:
  added: []
  patterns:
    - Emit an in-flight projection, then exactly one fully bound authoritative projection
    - Bind a keyboard only after every per-row action exists; otherwise present a retry
    - Idempotent read actions (page, retry) are actor/chat/expiry-bound but never consumed
key-files:
  created:
    - tests/unit/roster-rendering.test.ts
  modified:
    - src/telegram/roster-renderers.ts
    - src/telegram/roster-handlers.ts
    - src/telegram/keyboards.ts
    - src/shared/callback-schema.ts
    - src/domain/roster/roster-service.ts
key-decisions:
  - "Ordering uses an `Intl.Collator` on the safe label, then the Telegram bigint purely as an unseen tie-breaker, so equal labels have one stable rendered order."
  - "Page and retry are idempotent reads: their actions are actor/chat/expiry-bound rows but are never consumed, so repeated navigation re-renders instead of reporting `Already applied.`"
  - "A stale page index is clamped into the current range rather than rendering an empty page."
  - "A roster read failure renders read-specific copy with a bound `Retry` action; the documented generic save copy stays on save paths only."
  - "A username-only identity renders `@username` instead of the masked-ID fallback, which the UI contract reserves for an identity where neither name nor username is readable."
requirements-completed: [ROST-02, ROST-03, AUTH-02]
coverage:
  - id: D1
    description: Every identity form renders per contract and no full numeric Telegram ID reaches chat text
    requirement: ROST-03
    verification:
      - kind: unit
        ref: tests/unit/roster-rendering.test.ts#renders every identity form and never exposes a full Telegram ID
        status: pass
      - kind: unit
        ref: tests/unit/roster-rendering.test.ts#escapes markup in a Telegram identity instead of rendering it
        status: pass
    human_judgment: false
  - id: D2
    description: Unicode and equal labels sort deterministically via an unrendered ID tie-breaker
    requirement: ROST-03
    verification:
      - kind: unit
        ref: tests/unit/roster-rendering.test.ts#sorts Unicode labels deterministically and breaks equal labels by an unrendered ID
        status: pass
    human_judgment: false
  - id: D3
    description: Zero, one, twenty, twenty-one, and forty-five members produce correct pages, footers, and controls
    requirement: ROST-03
    verification:
      - kind: unit
        ref: tests/unit/roster-rendering.test.ts#renders the exact empty state without removal controls
        status: pass
      - kind: unit
        ref: tests/unit/roster-rendering.test.ts#keeps one and twenty members on a single unpaged projection
        status: pass
      - kind: unit
        ref: tests/unit/roster-rendering.test.ts#splits more than twenty members into deterministic pages with an exact footer
        status: pass
      - kind: unit
        ref: tests/unit/roster-rendering.test.ts#clamps an out-of-range page instead of rendering an empty page
        status: pass
    human_judgment: false
  - id: D4
    description: Delayed populated and empty reads show an in-flight state before the authoritative projection
    requirement: ROST-03
    verification:
      - kind: unit
        ref: tests/unit/roster-rendering.test.ts#shows an in-flight state before the authoritative populated projection
        status: pass
      - kind: unit
        ref: tests/unit/roster-rendering.test.ts#shows an in-flight state before an empty roster with no removal controls
        status: pass
    human_judgment: false
  - id: D5
    description: A read failure offers a bound retry and never a partial page; retry recovers the authoritative page
    requirement: ROST-03
    verification:
      - kind: unit
        ref: tests/unit/roster-rendering.test.ts#replaces a failed read with a retry action and never a partial page
        status: pass
    human_judgment: false
  - id: D6
    description: Every visible removal button stays bound to its adjacent membership across page navigation
    requirement: ROST-02
    verification:
      - kind: unit
        ref: tests/unit/roster-rendering.test.ts#keeps per-member removal identity across deterministic pages of twenty
        status: pass
      - kind: unit
        ref: tests/unit/roster-rendering.test.ts#clamps a stale page action to the roster that still exists
        status: pass
    human_judgment: false
  - id: D7
    description: Expired and demoted-actor page actions are denied before any roster access
    requirement: AUTH-02
    verification:
      - kind: unit
        ref: tests/unit/roster-rendering.test.ts#refuses an expired page action without re-rendering the roster
        status: pass
      - kind: unit
        ref: tests/unit/roster-rendering.test.ts#denies a demoted administrator before reading the roster
        status: pass
      - kind: unit
        ref: tests/unit/roster-rendering.test.ts#denies a page action from an actor who lost administrator rights
        status: pass
    human_judgment: false
  - id: D8
    description: Removal request, confirmation, and soft-deactivation behavior from 01-11 still holds against the reworked surface
    requirement: ROST-02
    verification:
      - kind: unit
        ref: tests/unit/roster-remove.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/roster-repository.test.ts
        status: pass
    human_judgment: false
duration: 10 min
completed: 2026-08-21
status: complete
---

# Phase 01 Plan 12: Deterministic Safe Roster Projection Summary

**Roster identity, ordering, pagination, and read-failure behavior are now deterministic and privacy-preserving: labels sort by an `Intl.Collator` with the Telegram ID used only as an unseen tie-breaker, pages are fixed at 20 with an exact footer, and a page is emitted only once every per-row action exists.**

## Performance

- **Duration:** 10 min
- **Tasks:** 1
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

- Centralized safe identity labelling in `roster-renderers.ts`, adding the username-only form and keeping the masked final-four fallback for an identity with neither a readable name nor username.
- Made ordering deterministic: `sortRosterMembers` compares safe display labels with `Intl.Collator("en", { sensitivity: "base" })` and falls back to the Telegram bigint as a tie-breaker that is never rendered.
- Added `paginateRoster` / `renderRosterPage`: fixed pages of 20, the exact `Showing <start>–<end> of <total>` footer only past the boundary, and clamping for any out-of-range page request.
- Added an in-flight roster state. `/roster` now replies with `Loading the roster…` and then replaces that message with the authoritative projection; page and retry callbacks edit through the same two-step sequence.
- Added a read-failure state with a bound `Retry` action. A page is emitted only after every removal token exists, so a rendered label can never carry another membership's action.
- Added opaque page and retry callback actions bound to chat, actor, and expiry, with neutral `Previous` / `Next` controls per the UI contract.
- Rewrote `rosterRemovalKeyboard` to take ordered tokens plus optional page navigation, replacing the previous `unknown`-typed lookup that carried no ordering guarantee.

## Task Commits

1. **Task 1: Make roster identity, pagination, delay, and failure projections deterministic (RED)** - `bf89523` (`test`)
2. **Task 1: Make roster identity, pagination, delay, and failure projections deterministic (GREEN)** - `be5929d` (`feat`)

## Decisions Made

- **Telegram ID is an ordering tie-breaker only.** `sensitivity: "base"` makes case and diacritic variants compare equal, so without an explicit tie-breaker two members whose labels differ only by case would render in database order. The bigint resolves it and never reaches text or callback data.
- **Page and retry actions are never consumed.** They are idempotent reads, so consuming them would make a second `Next` tap report `Already applied.` instead of re-rendering. They remain actor/chat/expiry-bound rows and still revalidate the current administrator.
- **A stale page clamps rather than erroring.** If the roster shrinks between render and navigation, the request resolves to the last existing page instead of an empty page or a stale-action alert.
- **Roster read failure has its own copy.** `I couldn't load the roster. Please try again.` The Copywriting Contract's generic string is scoped to save errors; claiming a save failed when nothing was being saved would violate the voice rule. `/roster_add` keeps the documented save copy.
- **`ROSTER_REMOVE` is the roster-surface routing kind.** Page and retry actions reuse it and discriminate through the server-side `targetId`, avoiding a Prisma enum migration for what is purely a routing label. All authority still comes from the row.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added the username-only identity form**

- **Found during:** Task 1, identity contract review
- **Issue:** `memberLabel` fell back to the masked-ID form whenever the name was missing, even when a readable username existed. The UI contract reserves that fallback for an identity where *neither* is readable, so a username-only member was masked unnecessarily — worse privacy posture and worse usability for no gain.
- **Fix:** `memberLabel` now returns `@username` when there is no readable name but a readable username. The masked final-four form still applies only when both are unreadable.
- **Files modified:** `src/telegram/roster-renderers.ts`
- **Commit:** `be5929d`

**2. [Rule 3 - Blocking] Extended the roster callback target schema and exported the action lifetime**

- **Found during:** Task 1, binding page and retry controls
- **Issue:** The plan's `files_modified` covers only the three telegram files and two test files, but `createRosterRemovalTarget` accepted `{ request | confirm | keep, membershipId }` exclusively. Page and retry actions could not be expressed as opaque server-side rows — which the plan's own `key_links` require — without widening that schema.
- **Fix:** `rosterRemovalTargetSchema` became a strict union: membership actions keep `membershipId`, view actions (`page`, `retry`) carry only a page index. `.strict()` prevents a view target from smuggling a membership. `REMOVAL_ACTION_LIFETIME_MS` was exported as `ROSTER_ACTION_LIFETIME_MS` so page and retry rows share one expiry rather than duplicating a 30-minute literal.
- **Files modified:** `src/shared/callback-schema.ts`, `src/domain/roster/roster-service.ts`
- **Commit:** `be5929d`

**3. [Rule 1 - Test bug] Replaced short ID fixtures that made a leak assertion flaky**

- **Found during:** Task 1, first full GREEN run
- **Issue:** Test fixtures used four-digit Telegram IDs (`9000+`). The assertion that a callback token never contains the member's ID failed intermittently because a random hex UUID can contain `9001` by chance — one run failed on `v1:9a136326-fd87-4681-88ca-69001a6a375d`.
- **Fix:** Fixtures now use full-width 18-digit IDs (`770000000000000000+`), which no hex token can contain, and the assertion additionally proves the token carries no display label. Verified stable across three consecutive suite runs.
- **Files modified:** `tests/unit/roster-rendering.test.ts`
- **Commit:** `be5929d`

**Total deviations:** 3 auto-fixed (1 missing critical functionality, 1 blocking, 1 test bug).
**Impact:** No plan behavior was dropped or weakened. Deviation 2 touched two files beyond the plan's declared set; both changes are additive and no existing caller changed.

## Known Issues

### Inherited pre-existing failure — `tests/integration/chat-configuration.test.ts` (NOT caused by this plan)

Two tests continue to fail in the integration suite:

- `chat configuration promotion > renders committed settings in fixed order and changes planning access only after review`
- `chat configuration promotion > rejects stale, expired, duplicate, and invalid planning-access saves without revision changes`

**Evidence they are inherited:** the orchestrator confirmed both fail identically at `e760820`, before plan 01-11's implementation existed. They originate in the settings plans (01-08 / 01-09) and are recorded in `01-11-SUMMARY.md` under the same heading.

**Disposition:** out of scope by explicit user decision; to be addressed at the phase regression gate. Carried forward here so that gate still picks them up. This plan touched no settings code and the failure signature is unchanged.

A passing run for this plan means: all `roster-rendering`, `roster-remove`, `roster-add`, and `roster-repository` tests pass and these two are the only failures in the repository. That is the observed state.

## Verification Results

| Check | Command | Result |
|---|---|---|
| Formatting | `npm run format:check` | PASS |
| Types | `npm run build` (`tsc --noEmit`) | PASS |
| Roster rendering unit tests | `npm run test:unit -- roster-rendering` | PASS (15/15) |
| Roster removal unit tests | `npm run test:unit -- roster-remove` | PASS (5/5) |
| Full unit suite | `npm run test:unit` | PASS (46/46, 9 files) — stable across 3 consecutive runs |
| Repository integration tests | `npm run test:integration -- roster-repository` | PASS (6/6) |
| Full integration suite | `npm run test:integration` | 21/23 — only the 2 inherited `chat-configuration` failures above |

## must_haves Audit

| Item | Status | Evidence |
|---|---|---|
| Truth: D-05 alphabetical sort by safe label; name+username, name-only, masked final-four fallback | MET | `memberLabel` + `sortRosterMembers`; asserted line-for-line in the identity test |
| Truth: zero members uses the documented empty state without removal controls | MET | `renderRosterPage` returns the empty state; the delayed-empty handler test asserts `reply_markup` is absent |
| Truth: 1/20/21/many render deterministic pages of 20 with correct footer and controls | MET | pagination boundary tests cover 0/1/20/21/45 including footer text and nav presence |
| Backstop: delay, failure, and retry for populated and empty results without losing ordering, paging, or action identity | MET | three handler tests assert the loading→authoritative sequence and full page rebinding after retry |
| Backstop: held-out Unicode case wraps safely while callback routing keeps membership identity | MET | Cyrillic and Ω fixtures with long usernames render in full and page 2 binding is asserted against `membershipId` |
| Edge ROST-03: empty, one-member, duplicate-label, unreadable-identity, Unicode, >20 rosters are deterministic and non-leaking | MET | equal-label tie-break, masked fallback, and `not.toContain(fullId)` assertions across the suite |
| Artifact: `roster-renderers.ts` exports `renderRoster`, `renderRemovalConfirmation` | MET | both exported; `renderRoster` keeps its single-argument shape for the 01-10 caller |
| Artifact: `keyboards.ts` provides page-bound navigation and per-member opaque removal actions | MET | `rosterRemovalKeyboard(tokens, navigation)` and `rosterRetryKeyboard` |
| Artifact: `roster-rendering.test.ts` covers identity, Unicode, 0/1/20/21, equal-label, delay, failure, retry, stale page | MET | 15 tests across four describe blocks |
| Key link: renderers → roster-service safe labels with internal bigint tie-breaker | MET | `sortRosterMembers` tie-break on `telegramUserId` |
| Key link: keyboards → `CallbackAction` opaque action per page/removal button | MET | every button's `callback_data` is a `v1:<uuid>` row token; asserted to contain neither ID nor label |
| Key link: handlers → `requireCurrentAdministrator` on page, retry, and remove paths | MET | single callback gate runs before target parsing; demotion tests assert no roster read occurs |
| Prohibition: full numeric IDs never cross into public text or callback data | MET | `memberLabel` emits at most four digits; token and text leak assertions in every binding check |

## Threat Mitigations Applied

| Threat ID | Mitigation |
|---|---|
| T-01-21 (identity disclosure) | Only the safe label reaches text; the fallback exposes four trailing digits; HTML in names is escaped; tokens and `targetId` assert-tested to exclude both the ID and the label |
| T-01-34 (page/removal action mapping) | Actions bound to actor/chat/membership-or-page/expiry; a page is emitted only after every removal token exists; label-to-action adjacency asserted at both page boundaries |
| T-01-22 (long roster projection, accepted) | Fixed deterministic pages of 20 bound message size and callback count |
| T-01-SC (supply chain) | No dependency added; `package.json` and the lockfile are untouched |

## Next Phase Readiness

Ready for `01-13`. Roster add, view, pagination, and removal are complete, so rehearsal participant selection can rely on the deterministic active-membership projection.

The two inherited `chat-configuration` integration failures remain outstanding for the phase regression gate.

## Self-Check: PASSED

`tests/unit/roster-rendering.test.ts` exists on disk; both task commits (`bf89523` RED, `be5929d` GREEN) are present in git history. TDD gate sequence RED → GREEN verified — no REFACTOR commit was needed.
