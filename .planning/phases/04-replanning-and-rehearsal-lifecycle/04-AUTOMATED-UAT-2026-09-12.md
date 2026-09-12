# Phase 4 automated UAT supplement

## H6 continuation — 2026-09-12

After accepting H3/H5, the user requested testing the remaining H6 scenarios. Extended existing integration tests rather than duplicating them:

- `planning-recovery.test.ts`: a Sunday draft retains its Honolulu timezone after chat configuration changes to Kiritimati. It stays active at one millisecond before Honolulu Monday, is superseded exactly at Monday, and the new round uses Kiritimati and the correct new target week. Historical timezone remains Honolulu.
- `planning-round.test.ts`: the only historical round is a finished CONFIRMED rehearsal and initially supplies a previous-rehearsal result. Real service cancellation removes that result. The previously invited member retains planning access; an unrelated member receives the exact denial and creates no round. The veteran can then reclaim the current week, with no historical day legend from the cancelled rehearsal.

Final verification: 64/64 integration tests passed across planning-round and planning-recovery (14.33 seconds); 98/98 unit tests passed across target-week, planning-day-card, planning-time-card and zoned-clock (550 ms); TypeScript no-emit checking and touched-file formatting passed. The selected suites also exercise scheduled-end equality, dated booked recovery, day/time projections, and timezone conversion. No new defect was found.

Tests use disposable PostgreSQL, intercepted Telegram API responses and injected timestamps. No machine clock, live configuration, live history or bot process was changed. The deterministic results are not native phone/location or real-time midnight observations. H6 now has this automated supplement alongside prior live results; explicit acceptance on this basis remains pending. Overall acceptance stays 7/8, and the separate migration-startup issue remains unresolved.

The user chose automated stale-control checks and isolated edit-failure injection after Web, Desktop and phone did not retain retired rehearsal buttons. Scope: H3/H5 only, through the resumed GSD add-tests workflow. The selected test category is integration: real update routing and disposable PostgreSQL, with intercepted Telegram API responses. No native-client E2E pass is claimed.

## Coverage and changes

| Case | Evidence |
| --- | --- |
| Retained day/time/back/confirm after cancellation or replacement | Existing lifecycle matrix asserts exact terminal explanation, unchanged rounds and unconsumed token. Extended with exact duplicate text and expiry-at-now refusal, no message effects, and unchanged rounds. |
| Retained answer/booking after replacement | Existing replan test asserts exact explanation, no edits and unchanged successor participants. |
| Retained answer/booking after cancellation | Extended the existing test to cover both controls and reject all send/edit effects. |
| Expired answer | Existing exact stale-copy assertion and successor participant isolation. |
| Inline Change edit failure, CONFIRMED and BOOKED | Added two parameterized tests, each exercising Keep and Apply. Intercepts the original message's edit only; the replacement remains editable. Checks acknowledgement before delivery, one fresh confirmation, changed durable pointer, and preserved pre-decision state. |
| Keep after recovery | Checks status, booking time and participant records unchanged, usable Change control, and no extra round. |
| Apply after recovery | Checks superseded predecessor, same-week draft successor, no booking, two reset participant answers, stripped replacement-confirmation controls, and duplicate Apply producing no extra round or message. |
| Delivery/tracking failure and delayed acknowledgement | Existing lifecycle tests exercise compensation/recovery advice, guarded pointers and acknowledgement before deferred delivery. |

Files: `tests/integration/planning-lifecycle-review.test.ts` and `tests/integration/planning-replan-telegram.test.ts`. Production implementation and live fixtures were not modified. Other phase tests were outside this scoped change and were not duplicated.

## Verification

- Initial extended-suite run: 20/20 passed, 32.55 seconds.
- Final run after strengthening exact copy and cancelled booking assertions: 20/20 passed across two files, 13.88 seconds, exit 0.
- TypeScript `tsc --noEmit`: passed.
- Touched TypeScript files formatted with project Prettier.
- Tests use disposable PostgreSQL and intercepted API calls; no Telegram message was sent and no second polling worker was started.

The added regression tests passed against existing production behavior. No artificial RED failure or production mutation was introduced. Assertions check durable state and transport effects, rather than only mocked return values. No product defect was found by these selected tests. This does not resolve the separate repeat-migration-startup finding.

## Acceptance disposition

H3/H5 now have the requested automated supplement. Native stale-button presentation and retained-deleted-inline behavior remain unobserved, and are not silently waived by choosing automated tests. Overall group counts remain 5/8 accepted in scope, two partial, one client-blocked. H6's remaining calendar/timezone/isolation cases are unchanged.

## Subsequent user acceptance

On 2026-09-12 the user explicitly accepted H3/H5 based on these automated results. Both groups are now accepted; native-client execution is still not claimed. This supersedes the prior pending-acceptance disposition above. Counts are 7/8 accepted, one pending (H6), zero client-blocked groups. The migration-startup finding remains separate and unresolved.
