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

## Cross-Milestone Trends

Only one completed milestone; no cross-milestone trend is established.

| Milestone | Phases | Plans | Quality evidence |
|---|---:|---:|---|
| v1.0 | 5 | 66 | 43 reconciled requirement IDs; recorded Phase 5 baseline 381 unit / 448 integration plus 25 final affected tests; not a fresh full-tree run |
