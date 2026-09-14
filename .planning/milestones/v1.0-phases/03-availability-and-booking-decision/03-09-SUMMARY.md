---
phase: 03-availability-and-booking-decision
plan: 09
subsystem: telegram
tags: [telegram, unicode, callback-alerts, prisma, postgres, migrations, preflight, requirements]

# Dependency graph
requires:
  - phase: 02-planning-wizard
    provides: "The D-02 ownership refusal, its `refuseNonAuthor` funnel and the plain-label precedence that keeps the `Telegram user ••••NNNN` mask out of assembled identity text"
  - phase: 03-availability-and-booking-decision
    provides: "`CALLBACK_ALERT_LIMIT`, the hoisted `NOT_AUTHOR_PREFIX`/`NOT_AUTHOR_SUFFIX` pair and the exported-refusal cap sweep (03-03)"
  - phase: 03-availability-and-booking-decision
    provides: "`PLANNING_CATCH_SITES` and the `logPlanningFailure` / `logPlanningNotRecorded` split, and the convention that `err` is reserved for a value that was thrown (03-08, IN-03)"
  - phase: 03-availability-and-booking-decision
    provides: "The migration preflight's expected application catalog and its Testcontainers suite (02-01, extended through 03-01)"
provides:
  - "`boundedLabel` measured in UTF-16 code units and cut on code-point boundaries — the alert budget and Telegram's limit finally speak the same unit"
  - "`PLANNING_CATCH_SITES.ownershipAlert` — a rejected ownership acknowledgement absorbed at its own catch site rather than escaping to the global bot error handler"
  - "`hasExactDefinitions` as a set-equality match: every expected entry consumed against a DISTINCT actual entry, any leftover refused"
  - "`planningRoundStatusLabels` — a flat, ordered migration-to-labels lookup replacing a nested condition with an unreachable arm"
  - "A requirement ledger that records the delivery state of every requirement Phase 3 claimed"
affects: [phase-04, phase-05-reminders, any future callback alert that interpolates stored identity text, any future migration that changes PlanningRoundStatus]

actuals:
  tokens: 7764
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "A budget and the limit it protects must be expressed in the SAME unit. A bound counted in code points against a limit counted in UTF-16 code units is not a conservative approximation — it is a bound that permits twice the limit for exactly the input an attacker chooses"
    - "Measuring in UTF-16 units and cutting on code-point boundaries are two separate rules, and applying only the second is what produced the defect: the correct-looking surrogate reasoning was already there, attached to the wrong metric"
    - "A refusal whose text is derived from ANOTHER user's stored data must absorb its own delivery failure, or one member's display name decides whether every other member's refusal works"
    - "A check that is correct only because of an invariant it never states is a check waiting to be wrong. State the property in the function rather than borrowing it from the system the function exists to distrust"
    - "A behaviour-preserving restructure can be VERIFIED rather than argued: evaluate the old and new derivation over every input set and deep-compare. The single set they disagree on is the finding, stated as a measurement"
    - "A condition nested over flags that an external ordering makes dependent has arms describing states that cannot occur; a flat ordered lookup taking the last applicable entry says the same thing for every reachable state with no dead branch"

key-files:
  created: []
  modified:
    - src/telegram/planning-handlers.ts
    - prisma/migrate-deploy.mjs
    - tests/unit/planning-availability-card.test.ts
    - tests/unit/planning-ownership.test.ts
    - tests/integration/migration-preflight.test.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "D-30: the budget is measured in UTF-16 code units and the cut is made on code-point boundaries — two rules, both required, and the pre-existing code applied only the second"
  - "D-31: the ownership acknowledgement is GUARDED, not made unfailable; the bound makes the known cause unreachable, the guard makes the class unreachable"
  - "D-32: the `PlanningRoundStatus` expectation is a flat, ordered lookup over applied migrations, taking the last applied pair"
  - "D-34: the rejected acknowledgement gets its OWN catch site (`ownershipAlert`) rather than reusing `delivery`, which names a rejected CARD — this branch performs no edit at all, so `delivery` would send an operator looking for a message that was never sent"
  - "D-35: `ownershipAlert` logs through `logPlanningFailure` with a real `err`, because something genuinely threw — the IN-03 convention applied in the direction it was written"
  - "The equivalence of the enum restructure is established by mechanical deep-comparison over 28 migration sets rather than by reading the two expressions side by side"

patterns-established:
  - "Sweep assertions must measure with the metric the external system enforces, or an absence proved in the wrong unit certifies exactly the defect it exists to catch"
  - "When a plan-specified test cannot be made to go red, prove that it cannot — empirically — and record it as a boundary guard rather than letting it pad a RED count"
  - "Verify a restructure claimed to be behaviour-preserving by differential evaluation over the input space, not by inspection"

requirements-completed: [AVAIL-01, AVAIL-02, AVAIL-03, AVAIL-07]

coverage:
  - id: D1
    description: "The one refusal that interpolates an untrusted display name fits Telegram's 200-unit cap as Telegram counts it, including for a member whose three stored identity columns are all astral-plane glyphs (WR-04, T-03-58)"
    requirement: "AVAIL-03"
    verification:
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#holds an all-astral-plane member label to the cap Telegram counts"
        status: pass
    human_judgment: false
  - id: D2
    description: "The bound does not empty the refusal and does not cost the ordinary member anything: the astral alert still names the owner, and a label inside the budget is returned untouched"
    requirement: "AVAIL-03"
    verification:
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#returns a label already inside the budget completely untouched"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#holds the one refusal that interpolates a member label to the same cap (the longest legitimate ASCII member, unchanged)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Truncation lands on a code-point boundary, so a bounded label never ends in a lone surrogate and Telegram never rejects the alert as malformed (T-03-60)"
    requirement: "AVAIL-03"
    verification:
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#holds an all-astral-plane member label to the cap Telegram counts (`refusal.isWellFormed()`)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A rejected acknowledgement cannot escape the ownership refusal into the global bot error handler: the handler resolves, the refusal was attempted exactly once, one failure line is emitted at `ownershipAlert` carrying a real `err`, and nothing was mutated, edited or sent (D-31, T-03-59)"
    requirement: "AVAIL-03"
    verification:
      - kind: unit
        ref: "tests/unit/planning-ownership.test.ts#absorbs a rejected acknowledgement instead of escaping to the global handler"
        status: pass
    human_judgment: false
  - id: D5
    description: "The unit sweep that holds every exported refusal to the cap measures with `String#length` — the same metric Telegram counts — so it can observe a violation rather than certify a false one"
    requirement: "AVAIL-02"
    verification:
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#holds each exported refusal constant to the 200-character cap"
        status: pass
      - kind: other
        ref: "boundary guard — every exported constant is ASCII, so the two metrics agree today; the change makes a future violation observable"
        status: pass
    human_judgment: false
  - id: D6
    description: "A member's display name cannot change the reachability of any other member's refusal: the bound removes the known cause and the guard removes the class (T-03-58, T-03-59)"
    requirement: "AVAIL-02"
    verification:
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#holds an all-astral-plane member label to the cap Telegram counts"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-ownership.test.ts#absorbs a rejected acknowledgement instead of escaping to the global handler"
        status: pass
    human_judgment: false
  - id: D7
    description: "The migration preflight matches catalogs as SETS: every expected entry is consumed against a distinct actual entry and any leftover fails (WR-07, T-03-61)"
    requirement: "AVAIL-01"
    verification:
      - kind: integration
        ref: "tests/integration/migration-preflight.test.ts#refuses a fully migrated ledger carrying an extra planning index"
        status: pass
      - kind: integration
        ref: "tests/integration/migration-preflight.test.ts#refuses a fully migrated ledger missing an expected foreign key"
        status: pass
      - kind: other
        ref: "grep -c 'actual.some(' prisma/migrate-deploy.mjs == 0; findIndex >= 1; splice >= 1"
        status: pass
      - kind: other
        ref: "BOUNDARY GUARDS, not gates — both integration cases pass on the pre-fix tree. The refused shape is unproducible against real PostgreSQL; see Gap and Finding Closure Verdicts"
        status: pass
    human_judgment: false
  - id: D8
    description: "Every pre-existing preflight case still passes, and the index-validity assertions layered over the stricter match still fire"
    requirement: "AVAIL-01"
    verification:
      - kind: integration
        ref: "tests/integration/migration-preflight.test.ts — all 30 cases, including the fresh-database replay, the Phase 1 prefix, the four drift refusals, the invalid-index case and the lock-holding case"
        status: pass
    human_judgment: false
  - id: D9
    description: "The `PlanningRoundStatus` expectation is derived by a flat lookup over applied migrations with no arm encoding a combination migration ordering makes unreachable (IN-01, T-03-62)"
    requirement: "AVAIL-01"
    verification:
      - kind: integration
        ref: "tests/integration/migration-preflight.test.ts#applies the availability migration to a database stopped one migration short (three-label expectation)"
        status: pass
      - kind: integration
        ref: "tests/integration/migration-preflight.test.ts#accepts a fully migrated database with nothing left to apply (four-label expectation, BOOKED last)"
        status: pass
      - kind: other
        ref: "differential evaluation of `expectedApplicationCatalog` before and after over 28 migration sets — agreement on every reachable state, divergence only on the unreachable availability-without-integrity combination"
        status: pass
      - kind: other
        ref: "grep -c 'integrityApplied' prisma/migrate-deploy.mjs == 8, none inside the PlanningRoundStatus expectation"
        status: pass
    human_judgment: false
  - id: D10
    description: "`.planning/REQUIREMENTS.md` records the delivery state of every requirement Phase 3 claimed, and no other row moved (gap G-05)"
    requirement: "AVAIL-07"
    verification:
      - kind: other
        ref: "grep -c '^- \\[x\\] \\*\\*AVAIL-01\\*\\*' == 1; AVAIL-07 == 1; '| AVAIL-01 | Phase 3 | Complete |' == 1; AVAIL-07 == 1; '| Phase 3 | Pending |' == 0"
        status: pass
      - kind: other
        ref: "git diff --numstat .planning/REQUIREMENTS.md == 4 changed lines; AVAIL-05, AVAIL-06 and AVAIL-08 still unchecked"
        status: pass
    human_judgment: false

# Metrics
duration: 30 min
completed: 2026-09-07
status: complete
---

# Phase 3 Plan 9: The Last Four Findings Summary

**The one callback refusal that quotes a member's stored display name is now budgeted in the unit Telegram actually counts — an all-astral-plane name produced a 335-unit alert against a 200-unit cap — and a rejected acknowledgement is absorbed at its own catch site instead of leaving a bystander's tap spinning behind the global error handler; the migration preflight now states the set-equality property it had only been borrowing from PostgreSQL's name-uniqueness rules, and derives its enum expectation from a flat lookup whose one removed arm described a database that cannot exist; and the requirement ledger finally records what Phase 3 shipped.**

## Performance

- **Duration:** ~30 min (`3fecf20` through `3a17fd5`)
- **Completed:** 2026-09-07
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- **The budget and the limit speak the same unit (WR-04).** `boundedLabel` compares `String#length` — which IS the UTF-16 code unit count — against its budget, and walks code points while summing each one's own `length` so the cut still lands on a code-point boundary. The two rules are separate and the pre-existing code applied only the second: its doc comment carried entirely correct surrogate reasoning attached to the wrong metric, which is why the defect survived review until WR-04. The worst legitimate member — 64 + 64 + 32 astral-plane glyphs across the three stored identity columns — went from a **335-unit alert to exactly 200**, still naming the owner.
- **`planningNotAuthorText`'s arithmetic follows.** The budget is now `CALLBACK_ALERT_LIMIT - NOT_AUTHOR_PREFIX.length - NOT_AUTHOR_SUFFIX.length`. Copy, hoisting and the plain-label precedence are untouched.
- **A refusal that cannot be delivered is a logged failure, not an unhandled one (D-31).** `refuseNonAuthor`'s acknowledgement is wrapped. This matters beyond tidiness: the branch is reached by a **bystander**, and its text is built from **another member's** stored display name — so an unwrapped call let one member's name decide whether every other member's refusal was handled here or thrown at the boundary. There is nothing to retry and nothing durable to roll back, so absorbing costs nothing and buying back the handled path costs the tapper nothing either.
- **The rejection gets its own catch site (D-34).** Not `delivery`, whose reason is `telegram-rejected-the-card`: this branch performs no `editMessageText` at all, so an operator reading `delivery` here would go looking for a message that was never sent. `ownershipAlert` carries `telegram-delivery-failed` / `telegram-rejected-the-ownership-alert`, and logs through `logPlanningFailure` with a real `err` — something genuinely threw, which is the IN-03 convention applied in the direction it was written.
- **The preflight states the property it was borrowing (WR-07).** `hasExactDefinitions` copies the actual entries, finds each expected entry's first remaining match, splices it out so it cannot satisfy a second expected entry, and requires the working list to be empty. `hasExactIndexes` and its valid/ready/live assertions compose over it unchanged.
- **The enum expectation is a flat, ordered lookup (IN-01).** `PLANNING_ROUND_STATUS_LABELS` pairs each migration that changes `PlanningRoundStatus` with the labels it leaves in place, and the derivation takes the last applied pair. Adding a migration is one appended entry rather than a nesting decision.
- **The restructure's equivalence is measured, not asserted.** `expectedApplicationCatalog` was evaluated before and after over 28 migration sets — the empty set, all nine lexicographic prefixes, nine two-element sets and nine leave-one-out sets — and deep-compared. Exactly one set differs, and it is precisely the state IN-01 names.
- **The ledger is in step (G-05).** Four scoped line replacements; every other row untouched. No Phase 3 requirement is left pending.

## Task Commits

1. **Task 1 RED: failing gates for the UTF-16 alert budget and the guarded ack** — `3fecf20` (test)
2. **Task 1 GREEN: the UTF-16 budget, the code-point walk, the guarded acknowledgement** — `9e5d23c` (feat)
3. **Task 2 "RED": catalog and enum guards for the migration preflight** — `c751aef` (test) — **no case in it goes red; see TDD Gate Compliance**
4. **Task 2 GREEN: set-equality matching and the flat enum lookup** — `d7b8ee1` (fix)
5. **Task 3: mark AVAIL-01 and AVAIL-07 complete** — `3a17fd5` (docs) — **no RED; see TDD Gate Compliance**
6. **This SUMMARY** — the sixth commit.

No REFACTOR commit was needed.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 1 | `3fecf20` (2 genuine failures) | `9e5d23c` | — | Pass |
| 2 | `c751aef` (0 failures — see below) | `d7b8ee1` | — | **Partial — guards only** |
| 3 | — (no behaviour, no test) | `3a17fd5` | — | **N/A** |

**Task 1's RED genuinely failed, and the observed failures are recorded verbatim in the commit message:**

- `expected 335 to be less than or equal to 200` — the astral-plane alert overran the cap by 67%.
- `Error: Bad Request: message text is too long` — the rejection propagated straight out of `dispatchPlanningCallback`, which has no try/catch of its own.

Three cases in that commit are **boundary guards** and are labelled as such in the commit message rather than counted as gates: the exported-refusal sweep and the booking-refusal case switching from a code-point spread to `String#length` (every constant is ASCII, so the metrics agree today), and `refusal.isWellFormed()` in the astral case (the current walk already never emits a lone surrogate; the assertion goes red the moment somebody replaces it with the prohibited `String.slice`).

**Task 2 has NO genuine RED, and this is a finding rather than an omission.** All 30 preflight cases pass against the unfixed script. Following the rule that a plan-specified test which passes on the unfixed tree is the test's fault, I tried to adjust the fixture until it went red, and then established that it cannot:

- WR-07's admitted shape needs two expected entries collapsing onto one actual entry, which needs two entries sharing a name — the match predicate tests `entry.name` first.
- PostgreSQL 18.4 refuses a second constraint of the same name on a table (`ERROR: constraint "dup" for relation "a" already exists`, enforced by `pg_constraint_conrelid_contypid_conname_index`), verified directly in a throwaway container, and index names are unique per schema.
- The expected lists carry no duplicate entry at any of the nine reachable migration prefixes, verified by evaluating `expectedApplicationCatalog` over every prefix and scanning each table's constraint and index lists for repeated names and repeated full tuples.

IN-01's dead branch cannot be made to go red either — a branch that is unreachable is unreachable from a test too.

**Task 3 has no RED because it adds no behaviour.** The plan marks it `tdd="true"`, but its `<verify>` is four greps over a Markdown file. A failing test would have had to be fabricated. Recorded as a deviation rather than manufactured.

## Files Created/Modified

- `src/telegram/planning-handlers.ts` — `boundedLabel` rewritten to measure in UTF-16 units while walking code points, with a doc comment stating both rules, why each is needed, and naming WR-04 so the simpler-looking version is not reintroduced; `planningNotAuthorText`'s budget arithmetic switched to `String#length` on both hoisted strings; a new `ownershipAlert` catch site and its `telegram-rejected-the-ownership-alert` reason added to the two bounded vocabularies; `refuseNonAuthor`'s acknowledgement wrapped in a try/catch with a comment recording why the guard is necessary rather than defensive.
- `prisma/migrate-deploy.mjs` — `hasExactDefinitions` rewritten as a consuming set-equality match with a comment stating the property and the borrowed invariant it replaces; `PLANNING_ROUND_STATUS_LABELS` and `planningRoundStatusLabels` added above `expectedApplicationCatalog`, replacing the nested condition, with a comment recording that the removed arm described a combination lexicographic migration order makes unreachable.
- `tests/unit/planning-availability-card.test.ts` — the three cap assertions switched from a code-point spread to `String#length`; an `ASTRAL` fixture constant; two new cases (the all-astral-plane member, and the label already inside the budget).
- `tests/unit/planning-ownership.test.ts` — `createTelegramDouble` gained a `failAnswer` option that records the payload **before** throwing, so "the refusal was attempted" and "the refusal was delivered" stay separable facts and an absorbing branch cannot pass by never having tried; `dispatch` gained the pass-through parameter; one new case.
- `tests/integration/migration-preflight.test.ts` — a `planningRoundStatusLabels` helper; two new refusal cases (extra planning index, missing foreign key) under a block comment recording why neither can go red; enum-expectation assertions added to the two existing cases that already reach the two reachable states.
- `.planning/REQUIREMENTS.md` — four scoped line replacements.

## Decisions Made

- **D-30 (UTF-16 budget, code-point cut).** Both rules, stated together in the doc comment. The failure mode this fixes is subtle precisely because the code already looked careful: the surrogate reasoning was correct and complete, and was applied to a quantity Telegram does not measure.
- **D-31 (guard, do not make unfailable).** The bound closes the known cause. The guard closes the class, which is what stops the next stored-identity defect from becoming a chat-wide outage of the ownership refusal.
- **D-32 (flat, ordered lookup).** Restructuring only. No expected value changes for any state a deployment can be in — established by differential evaluation, not by reading.
- **D-34 (`ownershipAlert` is its own catch site).** Execution-time, within the plan's stated latitude ("reuse the delivery site if it says the right thing, otherwise add one"). `delivery`'s reason names a rejected *card*; this branch deliberately renders and edits nothing, so reusing it would misdirect the one person reading the line.
- **D-35 (`logPlanningFailure`, with `err`).** The 03-08 convention is that `err` is reserved for a value that was thrown. This one was thrown, so it is bound. This is the *opposite* case from the one 03-08 flagged, and does not deepen it — see below.
- **The enum equivalence is measured.** Reading two boolean expressions side by side is exactly the review activity that let IN-01 through in the first place.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] The rejected acknowledgement needed a new catch site, not `delivery`**

- **Found during:** Task 1 (GREEN)
- **Issue:** The plan offers a choice — "reuse the delivery site if it says the right thing, otherwise add one with a bounded reason". `delivery` does not say the right thing: its reason is `telegram-rejected-the-card` and its comment reads "Telegram rejected the send or the in-place edit". `refuseNonAuthor` performs **no** `editMessageText` and sends nothing, by design (D-02: the anchor belongs to the author and must not be spent on a stranger's mistake). An operator seeing `delivery` on this branch would go looking for a card that never existed.
- **Fix:** Added `PLANNING_CATCH_SITES.ownershipAlert` (`telegram-delivery-failed` / `telegram-rejected-the-ownership-alert`), with the new reason added to `PLANNING_REASONS`. Both additions carry comments explaining why they are distinct.
- **Files modified:** `src/telegram/planning-handlers.ts`
- **Verification:** The new unit case asserts the outcome and reason explicitly; no test enumerates the two vocabularies, so nothing else was affected.
- **Committed in:** `9e5d23c`

**2. [Rule 1 - Plan/reality mismatch] Task 2's specified test cannot be constructed**

- **Found during:** Task 2 (RED)
- **Issue:** The plan asks for "a duplicate-plus-unexpected case: against a fully migrated database, create one extra object that duplicates an expected entry and one that matches nothing expected ... so the cardinality still matches". Creating two extra objects raises cardinality by two, so as written the fixture is not self-consistent; and no consistent variant of it can distinguish the two implementations, for the reasons under **TDD Gate Compliance**.
- **Fix:** Built the closest reachable cases and labelled them honestly — an extra-index case (one duplicating an expected entry's shape, one matching nothing expected, both refused, neither cleaned up) and a missing-foreign-key case. The second deliberately targets a **constraint**: a missing index is also caught by the relation-name set check, so only a constraint isolates `hasExactDefinitions`. A block comment above both records why neither goes red.
- **Files modified:** `tests/integration/migration-preflight.test.ts`
- **Verification:** Both pass on both trees, as documented; the empirical proof of unproducibility is in the RED commit message.
- **Committed in:** `c751aef`

**3. [Rule 1 - Plan/reality mismatch] Task 3 carries `tdd="true"` but has no behaviour**

- **Found during:** Task 3
- **Issue:** The task edits four lines of a Markdown ledger. Its own `<verify>` is a chain of greps.
- **Fix:** One `docs` commit, with the absent RED stated in the commit message.
- **Committed in:** `3a17fd5`

### The 03-08 Open Item — Checked, Not Touched, Not Deepened

Plan 03-08 carried forward that `dispatchAnnouncement`'s failed-record branch routes both `failed` and `stale` to `logPlanningNotRecorded`, discarding a real Prisma exception, while the `/plan` initial anchor and `repostAnchor`'s re-anchor both split and keep `logPlanningFailure` for `failed`.

**This plan does not touch that surface.** `git diff 94a9afb..HEAD -- src/telegram/planning-handlers.ts` contains no occurrence of `dispatchAnnouncement`, `repostAnchor`, `recordAnnouncement` or `logPlanningNotRecorded`, and the two integration cases and one unit gate that pin `err === undefined` on that line are untouched and passing.

Nor does it deepen the inconsistency. The new site is on the *majority* side of it: `ownershipAlert` absorbs a value that was genuinely **thrown** and therefore binds a real `err` through `logPlanningFailure`, exactly as the two anchor sites do for their `failed` half. The follow-up 03-08 describes — the three-line failed/stale split at the announcement-record site plus one filter adjustment — remains unclaimed and is still worth scheduling.

---

**Total deviations:** 3 auto-fixed (1 missing functionality, 2 plan/reality mismatch), 0 open items introduced
**Impact on plan:** None on scope or design. Every prohibition holds: no label is bounded with a plain string slice (the walk is over code points and `isWellFormed()` pins it); the owner's name is bounded, never emptied or omitted (asserted in both the astral and the ASCII case); no member's display name can change the reachability of another's refusal (the bound and the guard, each with its own case); the preflight was not relaxed to make a case pass — it was made strictly stronger, and all 30 cases including the four drift refusals still pass; and no requirement outside AVAIL-01 and AVAIL-07 changed its checkbox, wording, phase assignment or state.

## Issues Encountered

- **The worktree has no `node_modules/.bin`,** so `tests/helpers/postgres.ts` fails with `spawn ./node_modules/.bin/prisma ENOENT`. Fixed by symlinking the parent checkout's `.bin` into the worktree — gitignored, nothing installed, nothing committed. This has now bitten four consecutive waves of this phase.
  **I agree the follow-up is worth doing**, and it is not just ergonomics: the helper hard-codes a relative path from `process.cwd()`, so the suite silently depends on being run from a checkout root that happens to have a local install. Resolving the Prisma binary through `require.resolve("prisma/package.json")` or `node_modules/.bin` discovery up the tree would make it correct rather than merely convenient. It was correctly out of scope here.
- Task 2's `<precondition>` — a reachable Docker daemon — was satisfied (Engine 29.7.2) and re-checked before the suite ran.
- No checkpoint was reached, no authentication gate was hit, and no `<verify>` command went unrun.

## Verification Results

| Check | Baseline (`94a9afb`) | Result |
|---|---|---|
| `npm run build` (`tsc --noEmit`) | exit 0 | **exit 0** |
| `npm run test` (unit) | 25 files, 338/338 | **25 files, 341/341** (+3) |
| `npm run test:integration` | 15 files, 243/243 | **15 files, 245/245** (+2) |

`npm run lint` was not used as a gate: it reports pre-existing failures on untracked agent tooling under `.claude/`, `.codex/`, `.gsd/` and `.agents/`, none of which is tracked. `npx prettier --check` passes on all six modified files.

Acceptance criteria, all satisfied:

| Criterion | Required | Actual |
|---|---|---|
| `CALLBACK_ALERT_LIMIT` in `planning-handlers.ts`, non-comment | at least 2, value unchanged | 2, still `200` |
| `answerCallbackQuery` in `planning-handlers.ts`, non-comment | unchanged from pre-task | 48, was 48 |
| `actual.some(` in `migrate-deploy.mjs` | 0 | 0 |
| `findIndex` in `migrate-deploy.mjs` | at least 1 | 2 |
| `splice` in `migrate-deploy.mjs` | at least 1 | 1 |
| `integrityApplied` in `migrate-deploy.mjs` | at least 1, none in the enum expectation | 8, none in the enum expectation |
| `- [x] **AVAIL-01**` / `**AVAIL-07**` | exactly 1 each | 1, 1 |
| `\| AVAIL-01 \| Phase 3 \| Complete \|` / AVAIL-07 | exactly 1 each | 1, 1 |
| `\| Phase 3 \| Pending \|` | 0 | 0 |
| `- [ ] **AVAIL-05/06/08**` | exactly 1 each | 1, 1, 1 |
| `git diff --numstat .planning/REQUIREMENTS.md` | 4 changed lines | 4 |

## Gap and Finding Closure Verdicts

**WR-04 — CLOSED, and genuinely gated, at unit level only.**

Both halves have a case that fails on the pre-fix tree with the failure the fix addresses. The measurement half is closed hardest: 335 → 200 UTF-16 units for the worst legitimate member, with the alert still naming the owner and `isWellFormed()` holding the code-point boundary. The absorption half is closed at the handler's own entry point — the case drives `dispatchPlanningCallback`, which has no try/catch of its own, so "the handler resolves" is a real property of the production dispatch path and not of a wrapper.

**The honest limit: both are unit-level.** No integration case drives a real ownership refusal against a Telegram double that rejects the answer, and none asserts the alert length end to end. That is proportionate — `planningNotAuthorText` is pure and `refuseNonAuthor` reaches Telegram through one call — but it should be read as what it is. A regression in how `refuseNonAuthor` is *reached* (say, a new control that refuses a bystander without funnelling through it) would not be caught by anything added here.

**WR-07 — CLOSED in code; NOT gated by any test that can go red.**

The set-equality rewrite is real, complete and strictly stronger, and the acceptance greps confirm the existential match is gone. What no test demonstrates is a behaviour difference, because there is none observable: the pre-fix check was already correct for every catalog a real PostgreSQL can present. It was correct by borrowing name-uniqueness from the database whose consistency the script exists to distrust, and by never saying so. That is a genuine robustness defect and the fix is genuine; it is not a live bug, and this SUMMARY does not claim it was one. The proof of unproducibility (a PostgreSQL 18.4 experiment and a nine-prefix scan of the expected lists) is recorded in the RED commit message, and the residue is filed in `.planning/WINDOWS.md` as window 21 rather than left implicit.

**IN-01 — CLOSED structurally, and the dead branch's wrongness is now measured.**

The nested condition is gone and the acceptance greps confirm `integrityApplied` no longer appears in the expectation. A dead branch cannot be gated by a test, so closure rests on the differential evaluation: over 28 migration sets the old and new derivations agree everywhere except the one unreachable combination, where

```
availability applied, integrity not
  before: ["DRAFT","CONFIRMED","ABANDONED","SUPERSEDED"]
  after:  ["DRAFT","CONFIRMED","SUPERSEDED","BOOKED"]
```

That is the finding restated as a measurement: the old arm was not merely unreachable, it was **wrong** — and it would have been silently applied to a real database the first time a migration was inserted out of lexicographic order. The two reachable expectations are pinned on the two integration cases that already reach those states.

**G-05 — CLOSED, completely.**

AVAIL-01 and AVAIL-07 read complete in both the checklist and the traceability table, no Phase 3 requirement remains pending, and the diff is exactly the four intended lines with every other character preserved.

**Phase-level:** with this plan every one of the eleven `03-REVIEW.md` findings and all five `03-VERIFICATION.md` gaps has a disposition, and none is carried into a later phase.

## Known Stubs

None. No `TODO`, `FIXME`, `.skip(` or `.todo(` appears in any of the six modified files, and no `<verify>` went unrun.

One entry was appended to `.planning/WINDOWS.md` (window 21, kind `deviation`, phase 03, `prisma/migrate-deploy.mjs`): WR-07 and IN-01 are closed in code but gated by no test that can go red, with the mechanical evidence named. It is filed **open** deliberately — the ledger exists so that a closure resting on argument rather than on a red test is visible at ship time rather than only in a SUMMARY that has scrolled out of context. It is a reasonable waive candidate; the reason to waive it is already written above.

## Threat Flags

None. The plan's register is addressed as written: T-03-58 by the UTF-16 budget with D1 behind it; T-03-59 by the guarded acknowledgement with D4; T-03-60 by the code-point cut with D3; T-03-61 by the set-equality match with D7 (with the caveat recorded above); T-03-62 by the flat lookup with D9; T-03-SC holds — no package was installed and neither `package.json` nor the lockfile was touched.

No new network endpoint, auth path, file access pattern or schema change was introduced. `prisma/schema.prisma` was not modified, no column or migration was added, and `prisma/migrate-deploy.mjs` is the deploy preflight rather than a schema source, so the schema gate remains NOT APPLICABLE.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Every `03-REVIEW.md` finding and every `03-VERIFICATION.md` gap now has a closure. Nothing from Phase 3 is carried forward except the two follow-ups named below.
- **Follow-up 1 (inherited from 03-08, still open):** the failed/stale split at `dispatchAnnouncement`'s announcement-record log site. Three lines of handler code and one filter adjustment in the unit gate. Untouched and undeepened here.
- **Follow-up 2 (new, low priority):** `tests/helpers/postgres.ts` resolves the Prisma binary at the literal relative path `./node_modules/.bin/prisma`. Four consecutive waves of this phase have had to work around it in a worktree. Worth making robust.
- `boundedLabel` is now the seam for any future callback alert that interpolates stored text. Its two rules are stated in its doc comment and both have a case; the `isWellFormed()` assertion is what goes red if somebody reaches for `String.slice`.
- `PLANNING_ROUND_STATUS_LABELS` is where a future migration that changes the status enum registers its labels — one appended entry, in migration order.
- STATE.md and ROADMAP.md were deliberately left untouched; the orchestrator owns them. `.planning/REQUIREMENTS.md` was in this plan's scope and is modified.

## Self-Check: PASSED

- All six modified files exist on disk and are tracked.
- All five implementation commits (`3fecf20`, `9e5d23c`, `c751aef`, `d7b8ee1`, `3a17fd5`) are present in `git log`.
- `git diff --diff-filter=D --name-only 94a9afb HEAD` is empty — no file was deleted.
- `git status --short` is clean apart from this SUMMARY and the ledger entry.
- Every acceptance grep in all three tasks was re-run against the final tree and passes (table above).
- The three gate commands were run against the final tree: build exit 0, unit 341/341, integration 245/245 — each at or above its baseline.

---
*Phase: 03-availability-and-booking-decision*
*Completed: 2026-09-07*
