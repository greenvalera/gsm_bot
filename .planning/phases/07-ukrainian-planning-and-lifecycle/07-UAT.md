---
status: testing
phase: 07-ukrainian-planning-and-lifecycle
source: [07-VERIFICATION.md]
started: 2026-09-17T23:26:08Z
updated: 2026-09-18T18:37:00Z
---

# Phase 7 Acceptance

Implementation and automated verification are complete: 26/26 objective truths, six requirements implemented, and 16/16 decisions covered. These four judgments remain open; automated string matches do not constitute their acceptance. Historical native-testing waivers remain valid. Any live Telegram testing must follow the project telegram-web-uat skill and restore fixtures within its scope.

## Current Test

number: 1
name: Idiomatic Ukrainian wording and formatting
expected: |
  Planning, blocked, booking, cancellation, recovery and feedback read naturally.
  Full dates and separate durations are grammatical for one and multiple participants.
awaiting: human wording judgment; B-response handoff and fixture cleanup are complete

## Tests

### 1. Idiomatic Ukrainian wording and formatting
expected: Planning, blocked, booking, cancellation, recovery and feedback read naturally; full dates and separate durations remain grammatical for one and multiple participants. Review rendered outputs, including the agreed count boundaries.
result: [pending]

### 2. Neutral participant and blocked-slot wording
expected: Pending, available and unavailable statuses and blocked messages describe neutral facts without blaming or shaming a member. Record an explicit judgment on this prohibition.
result: [pending]

### 3. Readiness and manual-booking transparency
expected: Ready means everyone is available. The user understands that the studio must already have been booked externally before confirming, and Back does not confirm booking. The bot does not imply it booked the studio.
result: [pending]

### 4. Resolve the raw TEXT-03 review item
expected: Record the intended acceptance condition and its disposition against the named booking, replanning, change, cancellation and recovery scenarios, or explicitly record that the raw item cannot be classified. Do not silently turn the unspecified item into a pass or waiver.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

G-07-1 (minor, resolved): Native day/change/cancel copy combined nominative dates with incompatible phrases. Three catalog phrases corrected; 66 unit tests passed. All three corrections observed natively, including the week-start heading at 21:32. Tracked through `.planning/debug/uk-week-heading.md`. Test 1 remains pending human acceptance.

G-07-2 (minor, resolved): Returning from change/cancel confirmation omitted the organizer line. Both paths now supply persisted organizer identity. Four regression cases failed before correction; 53 integration tests passed after it. Both Keep paths passed native retest. Tracked through `.planning/debug/keep-card-owner.md`.

Test 4 retains an unspecified acceptance condition for explicit disposition; it is not an implementation defect or an accepted waiver.

## Native checkpoint — 2026-09-18

See `07-LIVE-TEST-2026-09-18.md` for evidence, corrections and exact restoration obligations. Native evidence covers Ukrainian day/time/review, A/B pending statuses, A unavailable/available reversal, blocked/retracted copy, both language-switch directions and duplicate alerts, and change/cancel Keep controls. No subjective test has been passed by the agent.

Evening continuation completed B availability, readiness, booking request/Back/apply, booked status recovery, booked-slot change, response reset, blocked replanning, past-day feedback and final cancellation. Duration previews showed 1 hour and 1 hour 30 minutes without saving changes. Running-image boundary samples are recorded separately in the live report.

Final fixture restored: no active plan; original English, A/B roster and all scheduling settings. Temporary prior attempts are superseded and final draft cancelled. No role/profile changes or deletions. Groups remain 0/4 accepted, 4 pending explicit human judgments. User confirmation that B answered is not wording acceptance. Single-participant native wording and unforced failure variants are not claimed as observed; automated coverage remains supporting evidence.
