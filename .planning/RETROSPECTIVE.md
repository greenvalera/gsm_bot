# Project Retrospective

## Milestone: v1.0 — Rehearsal Coordination

**Completed:** 2026-09-15
**Phases:** 5 | **Plans:** 66

### What Was Built
- Persistent administrator-managed settings, timezone, access policy and band roster.
- Authorized week-aware planning with hourly slots, roster snapshots, takeover and restart recovery.
- Custom availability cards, pending/available/unavailable responses, unanimous readiness and manual booking.
- Safe replanning, date/time changes, cancellation, stale-button handling and prior-rehearsal defaults.
- State-aware planning and pending-member reminders with publication grace, spacing, durable recovery and obsolete-work suppression.
- Single-worker runtime and canonical chat migration with guarded schema deployment and recorded regression/security evidence.

### What Worked

- PostgreSQL constraints, transactions and negative-case tests protected shared state.
- Scoped live Telegram checks caught callback alerts, privacy-mode instructions and stale message problems that transport doubles missed.
- Explicit acceptance records preserved waivers without inventing observed passes.

### What Was Inefficient

- Repeated live findings required many sequential gap-closure plans, especially in Phase 1.
- Historical statuses and missing summary metadata confused automatic closeout counts.
- Phase 4 probe provenance was not retained; later reconciliation could not recover it honestly.

### Patterns Established

- Opaque callbacks grant only an attempt; fresh authorization and transaction guards decide outcomes.
- Persistent publication acknowledgment and attempt ownership control reminder eligibility and uncertain delivery.
- One shared coordinator orders updates and reminders in a single polling process.

### Key Lessons

1. Capture probe provenance and task totals when authored, and reconcile status at phase closure.
2. Test Telegram presentation separately from durable state, with bounded native fixtures and restoration.
3. Preserve accepted waivers and name historical evidence boundaries when archiving.
4. Keep completed-history status UX and operational diagnostics in an explicit backlog.

### Cost Observations

- Model mix and session counts: unavailable; not inferred.
- 27 elapsed calendar days, August 19–September 15.
- 137 task counts recovered from 64 summaries; two lack counts. This is incomplete metadata, not measured effort.

## Milestone: v1.1 — Localization and Ukrainian

**Shipped:** 2026-09-20
**Phases:** 3 | **Plans:** 18

### What Was Built

A durable per-group language preference (English or Ukrainian) selectable at the start of first setup and later in settings, carried through the complete interface: setup, settings, roster, planning, day/time selection, availability, readiness, manual booking, replanning, cancellation, lifecycle recovery, and both reminder streams. Typed shared catalogs make key and parameter drift a compile error; an outbound-surface inventory reconciles 477 output sites and 222 catalog keys; the pruned runtime image verifies both catalogs and Ukrainian ICU.

### What Worked

- Resolving presentation locale at the send boundary rather than caching it. This single pattern is why a language change reaches queued reminders and the next card update without any push-repaint machinery, and it made LANG-06 and LREM-01 fall out of the design instead of needing special handling.
- Making the catalog contract a mapped type over the parameter map, so missing or mistyped Ukrainian keys fail at compile time. Type-level enforcement beat convention and test coverage here.
- Refusing to widen waivers by analogy. Each native waiver stayed pinned to the exact scenario that earned it, so the final acceptance record says precisely what was and was not observed.
- Separating automated evidence from native evidence in distinct documents, which kept the scoped correction reruns from being mistaken for a clean full-suite claim.

### What Was Inefficient

- Native UAT stretched across three days because scenarios depended on real scheduled occurrences (16:00, then 10:00 the next morning). Scenario ordering that batches same-day occurrences would have compressed this.
- A runtime/image mismatch blocked the first native attempt and required an authorized local runtime update mid-UAT.
- Requirement bookkeeping was deferred plan by plan in Phase 8 and never reconciled, so all five summaries closed with empty `requirements-completed` despite the work being complete and verified.
- Two tooling gates cost more time than the work they guarded: the plan-coverage gate counted a plan-check report as an unexecuted plan, and the UAT predicate rejected an approved skip.

### Patterns Established

- Resolve locale at the production send boundary, never from cached round or card state.
- Catalogs as typed contracts shared by interactive handlers and background jobs.
- Civil-date-only week arithmetic, with the authoritative timezone left on the round.
- Fail-closed reachability proofs for output sites that cannot be exercised, counted separately from real bilingual evidence.
- Name plan-verification reports `-PLAN-REVIEW.md`, not `-PLAN-CHECK.md`, so the plan scan does not count them as executable plans.

### Key Lessons

- A boundary-resolved value removes a whole class of staleness bugs. Prefer it over invalidation whenever the resolve is cheap.
- When a record is deliberately deferred ("pending later plans"), the deferral needs an owner and a closing step, or it silently survives to milestone close.
- Tooling gates that disagree with their own documented contract are worth diagnosing rather than working around; the authoritative gate here was a different command than the one that was failing.
- Evidence provenance is easiest to keep honest when original failures are never rewritten, only supplemented with scoped reruns.

### Cost Observations

- Model mix and session counts: unavailable; not inferred.
- 6 elapsed calendar days, September 15-20; 182 commits.
- 42 recorded tasks across 18 summaries, all with counts.
- 83/83 must-haves verified across three phase reports; 46 unit test files / 757 tests passing at audit time.

## Cross-Milestone Trends

Two completed milestones. v1.1 was far smaller and faster than v1.0 (3 phases in 6 days against 5 phases in 27), which is expected for a cross-cutting presentation change over an existing domain rather than net-new capability. Plan granularity tightened sharply: 13.2 plans per phase in v1.0 against 6.0 in v1.1. Both milestones closed carrying scoped native waivers, and both ended with an artifact-record gap found at close rather than during execution - a recurring signal that closing bookkeeping deserves an explicit step.

| Milestone | Phases | Plans | Quality evidence |
|---|---:|---:|---|
| v1.0 | 5 | 66 | 43 reconciled requirement IDs; recorded Phase 5 baseline 381 unit / 448 integration plus 25 final affected tests; not a fresh full-tree run |
| v1.1 | 3 | 18 | 17/17 requirements; 83/83 must-haves across three phase reports; integration audit found zero blockers and 3/3 E2E flows complete; 757 unit tests passing; integration suite inspected, not executed, at audit time |
