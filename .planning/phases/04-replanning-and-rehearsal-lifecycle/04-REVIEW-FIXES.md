# Phase 04 Review Corrections

Implemented under the existing Phase 04 execution workflow on 2026-09-09. No additional plan or plan summary was created. The parent orchestrator owns closure updates to the review reports, security report, state and roadmap.

## Corrections

| Finding | Change | Regression evidence |
| --- | --- | --- |
| CR-01 | Cancel and Change Keep explicitly render an availability card when the live control slot is the anchor. A retained notification cooldown timestamp cannot select announcement rendering and remove the answer buttons. | Both routes exercise blocked → collecting → ready/blocked within cooldown with a null announcement pointer, then decline and assert both answer controls. |
| CR-02 | Day, time, back and confirm transitions return explicit superseded/cancelled results after token kind, chat, expiry, target and round-chat validation. Their shared terminal response gives the correct historical advice. Consumed callbacks retain duplicate semantics. | Every draft target is delivered after real Change and Cancel transitions; alerts are distinct, successor snapshots remain unchanged, tokens remain unconsumed, and consumed replay does not become a terminal alert. |
| UI-02 | Failed inline confirmation edits fall back to a fresh tracked confirmation. Send/tracking failures produce explicit `/plan_status` recovery advice; an untracked fresh card has its keyboard cleared. | Deleted inline controls for both routes; failed send; a revision race during real tracking; and status/revision/prior-pointer guards. |
| UI-03 | Command entry always posts a named confirmation at the bottom of the chat. A guarded update moves only the previous lifecycle slot, preserving the other pointer. The former control message loses its keyboard. | Both commands exercise availability-anchor and booked-announcement slots, verify the new pointer and unchanged other pointer, then decline on the new card. Existing cancellation/change surface suites follow the newly tracked IDs. |
| UI-04 | Successful Cancel offered/kept/cancelled and Change offered/kept branches acknowledge before delivery, matching Change apply. Refusal alerts remain their sole acknowledgement. | Deferred transport tests hold message delivery pending and assert exactly one acknowledgement before release for all three success branches on both routes. |

`reanchorLifecycleConfirmation` has its own narrow internal purpose: status, revision and both prior pointers must match before it changes one message ID. It does not widen status-repost semantics, change notification cooldown claims, or introduce schema fields. Availability answers stay on the unchanged anchor when an announcement moves; when the anchor itself moves, the previous anchor loses all controls.

## Commits

- `e5ae03d` — RED: lost answer controls and draft terminal advice.
- `8823a3b` — GREEN: explicit anchor rendering and validated terminal draft classification.
- `8625100` — RED: reachable command/inline confirmations and acknowledgement ordering.
- `ae3c85d` — parent-owned adaptation of existing cancellation/change surface expectations to fresh tracked confirmations.
- `1b6d38a` — GREEN: shared confirmation recovery, guarded tracking, compensation and early acknowledgement.

The separate parent copy correction `e9a0577` addresses UI-01 and is not part of these fixes.

## Automated Validation

- Final full unit invocation: **360 passed**, 25 files.
- Final full integration invocation: **304 passed**, 21 files, 247.94 seconds, against PostgreSQL Testcontainers.
- New review regression suite: **14 passed**, including parameterized route/state coverage described above.
- Existing cancellation and change Telegram suites: **17 passed** after their pointer expectations were adapted.
- TypeScript and scoped Prettier checks passed. Existing repository-wide formatting debt was not included in this correction.

## Remaining Verification Boundaries

Real Telegram presentation, notification prominence and navigation under busy chat traffic remain human UAT work. Telegram edits after a durable pointer move are best effort and logged if rejected; delivery failure does not reverse a completed lifecycle transition. The locked same-week change and today-selectable date rules are unchanged.

All listed commits and the new test artifact `tests/integration/planning-lifecycle-review.test.ts` exist. No dependencies, implementation stubs, skipped tests, additional plans or database fields were introduced.
