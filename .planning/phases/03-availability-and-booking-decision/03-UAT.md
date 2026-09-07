---
status: testing
phase: 03-availability-and-booking-decision
source: [03-VERIFICATION.md]
started: 2026-09-07T17:47:34Z
updated: 2026-09-07T17:47:34Z
---

## Current Test

number: 1
name: Resolve the 32 judgment-tier prohibitions declared across the nine plans
expected: |
  Each prohibition is confirmed still-honored, or one is reopened as a finding. The eight
  security-category ones are the ones that matter: booking eligibility, the announcement claim,
  the takeover mint guard, the capability-on-a-read-path rule, the release-only-on-pointer-failure
  rule, the code-point-boundary truncation, and the cross-member alert reachability.
awaiting: user response

## Tests

### 1. Resolve the 32 judgment-tier prohibitions declared across the nine plans

All carry `status: resolved`, all `verification: judgment`, zero test-tier. The verifier's
per-item verdicts are recorded in the Prohibitions section of 03-VERIFICATION.md and are
explicitly NON-AUTHORITATIVE — a judgment-tier prohibition is closed by a human, not by a
verifier (ADR-550 D4).

expected: Each prohibition is confirmed still-honored, or one is reopened as a finding. The eight security-category ones are the ones that matter: booking eligibility, the announcement claim, the takeover mint guard, the capability-on-a-read-path rule, the release-only-on-pointer-failure rule, the code-point-boundary truncation, and the cross-member alert reachability.
result: [pending]

### 2. Run `/gsd-secure-phase 3` to produce 03-SECURITY.md

`workflow.security_enforcement` is true and `security_block_on` is high. Phases 1 and 2 each
have a SECURITY.md; Phase 3 has none, and the phase's plans carry STRIDE threat registers
(T-03-18, T-03-25, T-03-27, T-03-45, T-03-47, T-03-48, T-03-52, T-03-53) whose mitigation has
never been formally verified. The code review's narrative security pass is not that artifact.

expected: A STRIDE mitigation verification for Phase 3, matching the 01-SECURITY.md and 02-SECURITY.md artifacts that both prior phases produced before reaching status: passed.
result: [pending]

### 3. Live Telegram pass for SC1–SC3 — card publication, markers, outsider refusal

In a real Telegram group: `/plan` → pick a day and time → Confirm. Confirm the availability card
replaces the draft card in place. Have two roster members tap Can attend / Cannot attend. Have a
non-roster member tap a control.

expected: One card, edited in place, with one glyph-led line per participant, "Answered N of M" above the list, and a legend showing only the markers in use. The outsider gets a private alert and the card does not change. The outsider's tap produces no group message.
result: [pending]

### 4. Live Telegram pass for SC4 and the G-01 closure

Drive the same round to unanimity, then send `/plan_status` repeatedly from two different members
over the following ten minutes. Then tap Mark as booked and confirm.

expected: Exactly ONE notifying "Ready to book" message reaches the chat. Every later /plan_status re-posts the quiet availability card with the two answer controls and no Mark-as-booked button. The booking confirm pair is named, and after confirming, both messages are re-rendered with no controls.
result: [pending]

### 5. Confirm the WR-02 attribution loss on the terminal card after a takeover

Complete a round where an administrator took the round over from its original author, then book
it. Scroll back to the availability card.

expected: The terminal card still carries "Planned by <name>." Review finding WR-02 predicts it does NOT — `closeBookedRound` builds its projection with no owner. Confirm the user-visible impact before deciding whether to fix now or file it.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
