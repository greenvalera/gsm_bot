---
status: complete
phase: 01-chat-readiness
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md, 01-06-SUMMARY.md, 01-07-SUMMARY.md, 01-08-SUMMARY.md, 01-09-SUMMARY.md, 01-10-SUMMARY.md, 01-11-SUMMARY.md, 01-12-SUMMARY.md, 01-13-SUMMARY.md, 01-15-SUMMARY.md, 01-LIVE-VERIFICATION-RUNBOOK.md]
started: 2026-08-24T11:35:53Z
updated: 2026-08-24T11:39:19Z
evidence: .planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md
---

## Current Test

[testing complete]

## Tests

<!--
Results 1-19 are transcribed verbatim from the executed live-group run recorded in
01-LIVE-VERIFICATION-RUNBOOK.md (run 2026-08-24, verdict NOT approved). Findings F-1..F-9
are registered as broken windows 4-12 in .planning/WINDOWS.md.
Auto-covered deliverables (uat.classify-coverage mode: coverage) are recorded as
result: pass / source: automated and were not presented.
-->

### 1. Enter setup from an unconfigured chat
expected: Bold "Set up rehearsal planning", body "This chat is not configured yet.", exactly one "Start setup" button; after the tap the message reads "Setup in progress" with "Step 1 of 8" and the location instruction.
result: pass
source: live-run (runbook step 1)

### 2. Location reply resolves time-zone candidates
expected: Bold "Time zone found", each IANA candidate in monospace with its own "Use <zone>" button, closing "Send another location". The bot never auto-picks a zone and never offers free-text zone entry.
result: pass
source: live-run (runbook step 2a)
note: One candidate returned (Europe/Athens). The multi-candidate branch was deliberately skipped by owner decision — it needs a location near a time-zone border. Not debt of this run.

### 3. Complete all eight wizard steps
expected: Step 2 shows Mon…Sun inline in two rows of 4 and 3; each time step states which time is being entered; step 7 defaults to 10:00 and 16:00 with "Use defaults"/"Edit times"; step 8 offers the three planning-access options defaulting to Admins only.
result: issue
reported: "Steps 3, 5 and 6 show an identical TIME_HINT with no indication of which time is being entered, while step 7 already uses the correct leading-sentence pattern."
severity: minor
source: live-run (runbook step 2b) — F-1

### 4. Review configuration screen
expected: Bold "Review configuration"; values in exactly this order — time zone, default day, default start, duration, daily start, daily end, reminder times, planning access; buttons "Save configuration" then "Cancel setup"; active configuration unchanged until Save.
result: pass
source: live-run (runbook step 2c)

### 5. Configuration survives a bot restart
expected: After Save and `docker compose restart bot`, `/settings` shows bold "Chat settings" with sections Schedule → Availability reminders → Planning access and the saved zone intact.
result: pass
source: live-run (runbook step 2d)
note: Verified against the database as well as the rendered card. Also confirms broken window 2 is a stale test expectation, not a product defect.

### 6. No raw coordinates in logs
expected: Grepping the bot logs for latitude/longitude/decimal coordinates returns nothing, because the update path logs through the redacting logger.
result: issue
reported: "The grep is empty only vacuously — there is no logging at all on the update path; all six logger calls live in src/app/main.ts and cover lifecycle only. Redaction itself is genuinely covered by tests, but this step proves nothing and silent failures like F-3 are undetectable."
severity: minor
source: live-run (runbook step 2e) — F-4

### 7. Edit a setting with a valid value
expected: Bold "Review change" with "Current: <old>" and "New: <new>", buttons "Save change" / "Keep current value"; after Save the card is replaced in place by the updated dashboard.
result: pass
source: live-run (runbook step 3a)
note: Database confirms the two-phase revisioned save (revision 1 → 2, edit draft consumed).

### 8. Conflicting schedule is rejected without saving
expected: "That schedule does not fit inside the daily time boundaries. No changes were saved." Nothing saved changes, and only the offending field is re-asked while the rest of the draft survives.
result: issue
reported: "The step as written is unrunnable: the daily end value is permanently unreachable from the UI after setup, so Edit daily boundaries is single-field and no multi-field draft exists to partially lose. Separately, there is no defaultStart >= dailyStart check — a schedule that starts an hour before the window opens is already committed in the database."
severity: major
source: live-run (runbook step 3b) — F-5, F-6

### 9. Add a roster member by reply
expected: Replying to a member's message with `/roster_add` returns "✅ Added <member> to the band roster." with no extra confirmation tap.
result: pass
source: live-run (runbook step 4a)

### 10. Repeat add is idempotent
expected: A second `/roster_add` on the same reply returns "✅ <member> is already in the band roster." and creates no second membership row.
result: pass
source: live-run (runbook step 4b)

### 11. Roster renders safe identity only
expected: Bold "Band roster", alphabetical order, each entry as "• <name> — @username", "• <name>", or "• Telegram user ••••<last 4>". No full numeric ID in any form.
result: pass
source: live-run (runbook step 4c)
note: Decorative characters in a display name did not break the HTML markup.

### 12. Decline a removal confirmation
expected: Bold "Remove <member>?", body "They will no longer be selected for future rehearsals.", buttons "Remove member" / "Keep member"; declining keeps the member in the roster.
result: skipped
reason: "Behaviour confirmed — 'Removal cancelled.' replaced the card in place and the membership stayed active in the database — but the verbatim dialog copy was not compared against the contract during the run."
source: live-run (runbook step 4d)

### 13. Confirmed removal, then tapping the same button again
expected: A private alert "Already applied." and no second mutation.
result: skipped
reason: "Not reachable in the roster flow: confirmation replaces the card together with its buttons, so a repeat tap is physically impossible. Idempotence is proven at the data level (single soft-deactivated membership row). The 'Already applied.' surface does not exist on this path; the private-alert check moved to test 17."
source: live-run (runbook step 4e)

### 14. Live demotion takes effect on the next protected action
expected: A demoted actor's command is refused with "Only current chat administrators can change chat setup, roster, or planning access."; a callback shows the private alert "Only current chat administrators can do that."; the actor's draft is deleted before the refusal is shown.
result: issue
reported: "The bot replies with the admin-denial text to an ordinary non-admin message — in a live group, to every one of them. That also makes the command branch of this test non-probative: the same refusal appears without any demotion. The callback branch could not be checked because no live button existed at the moment of demotion."
severity: major
source: live-run (runbook step 5a–5d) — F-7
note: The draft-reset clause of AC-4 is genuinely proven from data — zero drafts of either type after demotion and configuration revision unchanged. Restoring admin rights correctly did not resurrect the draft.

### 15. Empty roster surface
expected: Header "No band members yet", body "Reply to a member's message, then send /roster_add to add them.", final line "Reply to a member's message, then send /roster_add.", and no Remove buttons.
result: issue
reported: "Header, body and the absence of Remove buttons all match, but the final line 'Reply to a member's message, then send /roster_add.' is missing."
severity: minor
source: live-run (runbook step 6a) — F-8

### 16. Roster pagination beyond 20 members
expected: Pages of 20 alphabetically, footer "Showing <start>–<end> of <total>", Previous/Next buttons, and Remove actions preserved on every page.
result: skipped
reason: "A live run cannot assemble 20+ real accounts. Rendering is unit-covered exactly at the boundary (1, 20, 21 members with verbatim footers). Residual gap: live Previous/Next wiring and per-page Remove actions are keyboard/callback behaviour, not covered by the rendering tests."
source: live-run (runbook step 6b)

### 17. Stale action shows its private alert
expected: Tapping a button on an outdated bot message shows "This setup action is no longer available. Send /setup to start again." or, for settings/roster, "This action is no longer available. Open /settings or /roster and try again."
result: issue
reported: "Tapping the expired 'Start setup' button produced no reaction whatsoever — a clean hit on the stale-action branch (0 valid, 17 expired START_SETUP tokens in the database) with no alert shown. No private callback alert is ever displayed, so four verbatim contract texts are unreachable, and the failure is silent because nothing throws."
severity: blocker
source: live-run (runbook step 6c) — F-3

### 18. Client-native rendering and in-place card replacement
expected: Text wraps natively with nothing truncated, no reply keyboard and no WebView, and after every callback the bot's original message is replaced by the current state rather than duplicated.
result: issue
reported: "Wrapping is native and everything is inline with no WebView — but the setup wizard appends a new card at every step and leaves the previous card's buttons live, instead of replacing in place the way settings and roster do. Setup step 8 also truncates a button label to 'Previous particip…' because three buttons share one row."
severity: major
source: live-run (runbook step 6d) — F-2, F-9

### 19. COVERAGE declarations parse against the schema
expected: Every SUMMARY `coverage:` block parses cleanly so auto-covered deliverables can be classified deterministically.
result: issue
reported: "01-13-SUMMARY.md entry D8 fails validation: verification[1].kind is not one of unit, integration, e2e, automated_ui, manual_procedural, other. The deliverable falls back to a human checkpoint instead of being auto-classified."
severity: minor
source: uat.classify-coverage (malformed_block error, fail-safe path)

### 20. Migration-backed settings edit end to end
expected: PostgreSQL migrations apply and a settings edit completes end to end against a real database.
result: pass
source: automated
coverage_id: 01-09/D3
note: Confirmed live by tests 5 and 7 (restart persistence plus a revisioned save verified in the database).

### 21. Auto-covered deliverables across plans 01-01…01-15
expected: Deliverables whose coverage entries name passing unit/integration verifications.
result: pass
source: automated
coverage_id: aggregate (01-01, 01-03, 01-04, 01-06, 01-07, 01-08, 01-10, 01-11, 01-12, 01-15 — all_auto_covered)

## Summary

total: 21
passed: 10
issues: 8
pending: 0
skipped: 3
blocked: 0

## Gaps

- gap_id: G-01-3
  truth: "Each wizard time step states which time is being entered"
  status: failed
  reason: "User reported: steps 3, 5 and 6 show an identical TIME_HINT with no indication of which time is being entered, while step 7 already uses the correct leading-sentence pattern."
  severity: minor
  test: 3
  finding: F-1
  window_id: 9
  artifacts: []
  missing: []

- gap_id: G-01-6
  truth: "The update path logs through the redacting logger, so the coordinate grep is meaningfully empty"
  status: failed
  reason: "User reported: the grep is empty only vacuously — there is no logging at all on the update path; all six logger calls live in src/app/main.ts and cover lifecycle only."
  severity: minor
  test: 6
  finding: F-4
  window_id: 12
  artifacts: []
  missing: []

- gap_id: G-01-8
  truth: "Daily boundaries are fully editable and an incoherent schedule is rejected before it is saved"
  status: failed
  reason: "User reported: the daily end value is permanently unreachable from the UI after setup, and there is no defaultStart >= dailyStart check — an incoherent schedule is already committed in the database."
  severity: major
  test: 8
  finding: F-5, F-6
  window_id: 6, 7
  artifacts: []
  missing: []

- gap_id: G-01-14
  truth: "Only a genuinely unauthorized actor is refused, and the refusal fires on the next protected action after demotion"
  status: failed
  reason: "User reported: the bot replies with the admin-denial text to an ordinary non-admin message — in a live group, to every one of them."
  severity: major
  test: 14
  finding: F-7
  window_id: 5
  artifacts: []
  missing: []

- gap_id: G-01-15
  truth: "The empty-roster surface ends with 'Reply to a member's message, then send /roster_add.'"
  status: failed
  reason: "User reported: header, body and absent Remove buttons all match, but the final line is missing."
  severity: minor
  test: 15
  finding: F-8
  window_id: 10
  artifacts: []
  missing: []

- gap_id: G-01-17
  truth: "A stale or unauthorized callback shows its verbatim private alert"
  status: failed
  reason: "User reported: tapping the expired Start setup button produced no reaction whatsoever; no private callback alert is ever displayed, so four verbatim contract texts are unreachable and the failure is silent."
  severity: blocker
  test: 17
  finding: F-3
  window_id: 4
  artifacts: []
  missing: []

- gap_id: G-01-18
  truth: "Every callback replaces the bot's card in place, and no button label is truncated"
  status: failed
  reason: "User reported: the setup wizard appends a new card at every step and leaves the previous card's buttons live; setup step 8 truncates a label to 'Previous particip…' because three buttons share one row."
  severity: major
  test: 18
  finding: F-2, F-9
  window_id: 8, 11
  artifacts: []
  missing: []

- gap_id: G-01-19
  truth: "Every SUMMARY coverage block parses against the schema"
  status: failed
  reason: "uat.classify-coverage reported malformed_block: 01-13-SUMMARY.md D8 verification[1].kind is not an allowed value."
  severity: minor
  test: 19
  artifacts: []
  missing: []

## Deferred Follow-Ups

- test: 2
  idea: "Multi-candidate time-zone branch — needs a location near a time-zone border; owner decided the cost is not justified at this stage."
  deferred_at: 2026-08-24

- test: 16
  idea: "Live Previous/Next wiring and per-page Remove actions for a 20+ member roster."
  deferred_at: 2026-08-24
