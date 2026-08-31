---
phase: 02-weekly-rehearsal-proposal
plan: 01
subsystem: requirements
tags: [planning-docs, requirements-ripple, prisma, postgres, schema-contract]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: ROST-01/ROST-02 roster management, ChatConfiguration, the callback boundary
provides:
  - "REQUIREMENTS.md / ROADMAP.md / PROJECT.md reconciled to the roster-as-lineup participant model (D-09), with no requirement ID deleted"
  - "A developer-confirmed, one-way durable planning-round contract: PlanningRound (a), nullable activeWeekStart uniqueness (b), PlanningParticipant confirm-time snapshot (c), previousRehearsal() definition (d)"
affects: [02-02, 02-03, 02-04, 02-05, phase-3-availability, phase-4-lifecycle, phase-5-reminders]

actuals:
  tokens: 9000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Durable planning state lives in one PostgreSQL row per round, never in grammY session/conversations"
    - "Business invariants are enforced by database constraints, not application code"

key-files:
  created:
    - .planning/phases/02-weekly-rehearsal-proposal/02-01-SUMMARY.md
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/PROJECT.md

key-decisions:
  - "D-09 ripple landed docs-only before any Phase 2 code artifact: PLAN-08 is now the confirm-time snapshot of the currently active band roster; PLAN-09 is retained but marked out of v1 Phase 2 scope with ROST-01/ROST-02 as the replacement path."
  - "Developer confirmed the one-way durable round contract as Option 1 (accept all four (a)-(d) as recommended). Answered interactively; NOT auto-advanced."
  - "(a) One PlanningRound row carries every wizard value, including a start-time snapshot of timezone/durationMinutes/dailyStartMinute/dailyEndMinute and derived startsAt/endsAt."
  - "(b) PLAN-02 one-active-round-per-chat-week is enforced by a nullable activeWeekStart under a plain @@unique([chatId, activeWeekStart]) — no Prisma preview flag, no hand-written partial index."
  - "(c) PlanningParticipant is the confirm-time snapshot and IS the Phase 3 contract; there is no participant-selection wizard step."
  - "(d) previousRehearsal() = the most recent CONFIRMED PlanningRound for the chat with startsAt < now, implemented as ONE named function so Phase 4 can narrow it to 'booked' (LIFE-05) in a single place."

patterns-established:
  - "Requirements Ripple: a superseded requirement is marked out of scope with its supersession reason and replacement path, never deleted — coverage totals stay auditable."
  - "One-way schema doors are confirmed by the developer before the first migration is authored."

requirements-completed: [PLAN-08, PLAN-09]

coverage:
  - id: D1
    description: "REQUIREMENTS.md PLAN-08 states the confirm-time snapshot of the currently active band roster; PLAN-09 retained and marked out of v1 Phase 2 scope by D-09 with ROST-01/ROST-02 named as the replacement path; the traceability table still carries 43 requirement rows with both IDs mapped to Phase 2."
    requirement: "PLAN-08"
    verification:
      - kind: other
        ref: "bash -c 'test $(grep -c \"^| PLAN-0[89] | Phase 2 |\" .planning/REQUIREMENTS.md) -eq 2; test $(grep -cE \"^\\| [A-Z]+-[0-9]+ \\|\" .planning/REQUIREMENTS.md) -eq 43; ... echo RIPPLE_RECONCILED'"
        status: pass
    human_judgment: false
  - id: D2
    description: "ROADMAP.md Phase 2 success criterion 5 states the roster snapshot and keeps its recovery clause; PROJECT.md no longer claims previous-rehearsal participants are a default selection."
    requirement: "PLAN-09"
    verification:
      - kind: other
        ref: "grep -c 'previous confirmed participants' .planning/ROADMAP.md -> 0; grep -c 'recovered with a status request' .planning/ROADMAP.md -> 1; grep -c \"previous rehearsal.s participants used as the default selection\" .planning/PROJECT.md -> 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "The one-way durable planning-round contract (a)+(b)+(c)+(d) is on the record, developer-answered, before any schema file is written."
    verification: []
    human_judgment: true
    rationale: "A recorded developer decision cannot be proven by automation — the artifact is the answer itself, and its correctness is the developer's judgment. Verification is that 02-02's schema matches the contract transcribed below."

# Metrics
duration: 18min
completed: 2026-08-31
status: complete
---

# Phase 2 Plan 01: Requirements Ripple and Durable Round Contract Summary

**The four artifacts carrying the superseded "previous participants seed the next poll" model now state roster-as-lineup (D-09), and the developer has confirmed the one-way PlanningRound / PlanningParticipant durable contract that 02-02 will migrate and Phase 3 will consume.**

## Performance

- **Duration:** ~18 min across two executor sessions (Task 1 autonomous, Task 2 spanning a developer decision checkpoint)
- **Completed:** 2026-08-31T09:51:44Z
- **Tasks:** 2 of 2
- **Files modified:** 3 (`.planning/` docs only) + 1 created (this SUMMARY)

## Accomplishments

- **Requirements Ripple closed docs-only, before any downstream artifact exists.** 02-RESEARCH.md Open Question 2 required this to land before any plan, test, schema, or renderer was authored against superseded text. It did.
- **PLAN-08 rewritten** to: "A new plan takes a participant snapshot of the chat's currently active band roster at confirm time; the active roster is the lineup."
- **PLAN-09 retained, not deleted** — marked "(Removed from v1 Phase 2 scope by D-09 — retained for traceability, not deleted.)" with ROST-01 (add) / ROST-02 (remove) named as the replacement path. Coverage stays 43 of 43 mapped; both IDs still map to Phase 2. This satisfies threat T-02-15 (Repudiation): a requirement that vanishes cannot be audited.
- **ROADMAP.md Phase 2 criterion 5** now reads "A new proposal snapshots the chat's current active band roster as its participants, and can be recovered with a status request after an interruption or bot restart" — the recovery half (PLAN-10 / RELI-01) survived the rewrite verbatim in meaning.
- **PROJECT.md** no longer asserts the previous rehearsal's participants are a default selection; the lineup is the current active roster, and a lineup change is a roster change.
- **The phase's only genuinely irreversible decision is on the record**, developer-answered, before the first migration.

## The Confirmed Durable Contract (Task 2 — developer-answered, Option 1)

**Status: ANSWERED INTERACTIVELY by the developer. This was NOT auto-advanced and NOT unattended.**
The plan's `<default_if_unattended>` fallback path was **not** taken; the developer selected
**Option 1 — accept all four (a), (b), (c) and (d) as recommended.**

02-02 and every later Phase 2 plan MUST build against exactly this shape. It is transcribed
here in full so 02-02's executor can author the Prisma schema without re-opening the decision.

### (a) One `PlanningRound` row carries every wizard value

A single `PlanningRound` row is the durable wizard state. No grammY `session`, no
`conversations` — those are rejected in `.claude/CLAUDE.md` and fail RELI-01 outright.

The row carries:

| Group | Fields |
|---|---|
| Wizard position | `step` |
| Chosen schedule | `selectedDate`, `selectedStartMinute` |
| Telegram anchor | `anchorMessageId` |
| Authorship / activity | `authorUserId`, `lastActivityAt` |
| Optimistic concurrency | `revision` |
| Start-time configuration snapshot | `timezone`, `durationMinutes`, `dailyStartMinute`, `dailyEndMinute` |
| Derived instants | `startsAt`, `endsAt` |

The configuration snapshot is what makes a concurrent `/settings` edit unable to
retroactively invalidate an in-flight card. `startsAt` / `endsAt` derive ONLY from the
round's own civil pair (`selectedDate` + `selectedStartMinute`) plus the round's own
`timezone` snapshot — never from `ChatConfiguration` (DST policy rule 5, and the
`promote` decision in this plan's `<assumption_delta_decision>`).

Accepted cost: a wide table; adding a wizard step later means a migration.

### (b) PLAN-02 enforced by a nullable `activeWeekStart` under a plain unique constraint

```
@@unique([chatId, activeWeekStart])
```

- `activeWeekStart` **equals `targetWeekStart` while the round is `DRAFT`**.
- `activeWeekStart` is **set to NULL on confirm, abandon, or supersede**.
- PostgreSQL treats NULLs in a unique index as distinct, so any number of finished rounds
  coexist for the same chat and week while at most one DRAFT can exist.

Explicitly rejected alternatives: a Prisma partial index (`where:` on `@@unique`, behind the
`partialIndexes` preview flag with reported drop/recreate churn), and a hand-written
`CREATE UNIQUE INDEX ... WHERE` in a `--create-only` migration (the shadow-database diff
proposes to drop it on every later migration). **Neither may be used.**

**Binding invariant for 02-02 onward:** `status` and `activeWeekStart` encode "active" in two
places and MUST always be changed together inside one transaction. Every transition that
touches `status` touches `activeWeekStart` in the same `$transaction`.

### (c) `PlanningParticipant` is the confirm-time snapshot and IS the Phase 3 contract

- Rows are created **inside the Confirm transaction**, from `RosterService.listActive`.
- **There is no participant-selection wizard step.** (D-09 / D-11.)
- The snapshot is the single source of truth for the lineup: the `PREVIOUS_PARTICIPANTS`
  planning-access policy reads it, and Phase 3 reads it to decide exactly who may respond to
  the availability card.

Reversing D-09 later is `costly`, not one-way — the snapshot column stays valid; only a
wizard step and its callback shapes would need re-adding.

### (d) `previousRehearsal()` — one named function

```
previousRehearsal(chatId) =
  the most recent CONFIRMED PlanningRound for the chat
  with startsAt < now, ordered by startsAt DESC
```

This is Assumption A1 from 02-RESEARCH.md (confidence LOW, "needs owner confirmation" — now
confirmed). It MUST be implemented as **exactly one named function** so that Phase 4 can
narrow it to "booked" (LIFE-05) by changing that single place, not every call site.

It drives BOTH:
1. the PLAN-05 / PLAN-07 previous-day / previous-time highlight markers, and
2. `wasPreviousParticipant`, the input to the `PREVIOUS_PARTICIPANTS` planning-access policy.

**Known consequence, shown to and explicitly accepted by the developer:** a proposal that was
confirmed but never actually booked will drive the PLAN-05/PLAN-07 markers and will count for
`wasPreviousParticipant` until Phase 4 narrows the definition. The rejected alternative
(Option 2 — render no previous-rehearsal marker and treat `wasPreviousParticipant` as false
until LIFE-05 lands) was considered and declined.

## Task Commits

1. **Task 1: Reconcile the four artifacts that still carry the superseded participant model** — `33a0d81` (docs)
2. **Task 2: Confirm the one-way durable planning-round contract** — checkpoint task; no code artifact. Its `<done>` is satisfied by the contract transcription above. Recorded in this SUMMARY's commit.

## Files Created/Modified

- `.planning/REQUIREMENTS.md` — PLAN-08 rewritten to the confirm-time active-roster snapshot; PLAN-09 marked out of v1 Phase 2 scope by D-09 with ROST-01/ROST-02 as the replacement path. Traceability table untouched at 43 rows.
- `.planning/ROADMAP.md` — Phase 2 success criterion 5 rewritten; recovery clause preserved. Criteria 1-4, the Phase 1 block, the Progress table and the 30 Phase 1 plan entries untouched.
- `.planning/PROJECT.md` — the two participant-default statements corrected to roster-as-lineup.
- `.planning/phases/02-weekly-rehearsal-proposal/02-01-SUMMARY.md` — this file.

## Decisions Made

See the `key-decisions` frontmatter and the full contract transcription above. The single
substantive decision made during execution was the developer's Option 1 answer to the Task 2
checkpoint; Task 1 followed the plan exactly.

## Deviations from Plan

None — plan executed exactly as written. No auto-fixes were required under Rules 1-3, and no
Rule 4 architectural escalation arose beyond the Task 2 checkpoint the plan itself scheduled.

## Issues Encountered

None. The Task 2 checkpoint halted the first executor session by design (it is a
`checkpoint:decision` with `gate="blocking"`); this continuation session resumed at Task 2
after the developer answered, verified Task 1's commit `33a0d81` was already an ancestor of
the worktree base, and did not redo it.

## Known Stubs

None. This plan produced no source code, no schema, and no test — it is prose reconciliation
plus a recorded decision.

## Threat Flags

None. This plan changed no executable surface. T-02-15 (Repudiation on the traceability
table) and T-02-16 (Tampering on ROADMAP.md) were both mitigated as planned: PLAN-09 was
marked rather than deleted, coverage held at 43 rows, and every edit was a scoped `Edit`
replacement rather than a whole-file write, so ROADMAP.md's 30 Phase 1 plan entries survived.

## Open Items Carried Forward

- **`flagged_assumptions` — PLAN-08 / `unclassified` edge.** Still open, not dismissed. The
  deterministic edge probe could not classify the participant-snapshot requirement, so no
  acceptance criterion was auto-derived. The likely hidden edge: *what happens to the snapshot
  when a roster member is deactivated between the review render and the Confirm tap.* Behavioural
  coverage for PLAN-08 lives in `02-05-PLAN.md`; a human should confirm that edge is covered there.
- **AVAIL-06 and LIFE-05 reconciliation** remains assigned to the Phase 3 and Phase 4
  discussions by 02-CONTEXT.md `<deferred>` — deliberately untouched here.
- **Suggested (not required) invariant test** from the `<assumption_delta_decision>`: a contract
  test asserting that computing a round's `startsAt`/`endsAt` reads no `ChatConfiguration`
  schedule field, so a future phase reintroducing "the chat's default time IS the rehearsal
  time" goes red instead of silently regressing.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

02-02 is unblocked and may proceed immediately. It must author the Prisma schema and migration
against the contract transcribed above — `PlanningRound` (a), the nullable `activeWeekStart`
under a plain `@@unique([chatId, activeWeekStart])` (b), `PlanningParticipant` as the
confirm-time snapshot (c), and a single `previousRehearsal()` function (d) — without
re-opening the decision. 02-02 also carries stated assumptions OQ-3 (the Phase 1 callback
boundary is NOT frozen; extend it per 02-RESEARCH.md Pattern 5 with a regression matrix
pinning every observable Phase 1 behaviour) and OQ-4 (`/plan` refuses in an unconfigured chat
with a concise group message pointing at the setup flow).

No downstream Phase 2 artifact can now be written against the superseded participant model.

---
*Phase: 02-weekly-rehearsal-proposal*
*Completed: 2026-08-31*
