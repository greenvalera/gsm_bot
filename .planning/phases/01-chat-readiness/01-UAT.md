---
status: diagnosed
phase: 01-chat-readiness
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md, 01-06-SUMMARY.md, 01-07-SUMMARY.md, 01-08-SUMMARY.md, 01-09-SUMMARY.md, 01-10-SUMMARY.md, 01-11-SUMMARY.md, 01-12-SUMMARY.md, 01-13-SUMMARY.md, 01-15-SUMMARY.md, 01-LIVE-VERIFICATION-RUNBOOK.md]
started: 2026-08-24T11:35:53Z
updated: 2026-08-26T00:00:00Z
evidence: .planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md
---

## Current Test

[testing complete]

## Tests

<!--
Results 1-19 were first transcribed verbatim from the live-group run of 2026-08-24
recorded in 01-LIVE-VERIFICATION-RUNBOOK.md (verdict NOT approved). Findings F-1..F-9 from
that run are registered as broken windows 4-12 in .planning/WINDOWS.md.
They were RE-ADJUDICATED on 2026-08-26 against LIVE RUN 2, recorded in the same runbook.
Run 2 confirmed all nine run-1 findings closed live and returned NOT approved on two NEW
findings, F-10 and F-11, registered as broken windows 14 and 15. Each re-adjudicated note
cites the runbook step that carries its run-2 evidence.
Test 19 was covered by neither live run and is left exactly as it stood.
Auto-covered deliverables (uat.classify-coverage mode: coverage) are recorded as
result: pass / source: automated and were not presented.
-->

### 1. Enter setup from an unconfigured chat
expected: Bold "Set up rehearsal planning", body "This chat is not configured yet.", exactly one "Start setup" button; after the tap the message reads "Setup in progress" with "Step 1 of 8" and the location instruction.
result: pass
source: live-run (runbook step 1)
note: Not re-entered in run 2 — the chat was already configured, so this surface was not exercised again and the run-1 verdict stands. Run 2 did find F-11 on this same surface: the copy is correct for an unconfigured chat and FALSE on a configured one, where /setup still answers "This chat is not configured yet." See broken window 15.

### 2. Location reply resolves time-zone candidates
expected: Bold "Time zone found", each IANA candidate in monospace with its own "Use <zone>" button, closing "Send another location". The bot never auto-picks a zone and never offers free-text zone entry.
result: pass
source: live-run (runbook step 2a)
note: One candidate returned (Europe/Athens). The multi-candidate branch was deliberately skipped by owner decision — it needs a location near a time-zone border. Not debt of this run. Run 2 (runbook step 2a) re-ran the single-candidate path with the same verbatim card and the same single confirm button; the multi-candidate branch remains skipped by owner decision, and is still neither a pass nor debt.

### 3. Complete all eight wizard steps
expected: Step 2 shows Mon…Sun inline in two rows of 4 and 3; each time step states which time is being entered; step 7 defaults to 10:00 and 16:00 with "Use defaults"/"Edit times"; step 8 offers the three planning-access options defaulting to Admins only.
result: pass
reported: "Steps 3, 5 and 6 show an identical TIME_HINT with no indication of which time is being entered, while step 7 already uses the correct leading-sentence pattern."
severity: minor
source: live-run (runbook step 2b) — F-1
note: Re-adjudicated from issue to pass against live run 2 (2026-08-26). F-1 closed live at runbook step 2b: step 3 reads "Send the default rehearsal start time.", step 5 "Send the daily start boundary." and step 6 "Send the daily end boundary." — each names its value before the format, and start and end are distinguishable. The deliberate "19:5" probe, skipped in run 1, was run this time and returned the verbatim format hint "Use 24-hour time in HH:MM format, for example 19:30.", so the fix prepended a leading sentence rather than rewording the shared hint.

### 4. Review configuration screen
expected: Bold "Review configuration"; values in exactly this order — time zone, default day, default start, duration, daily start, daily end, reminder times, planning access; buttons "Save configuration" then "Cancel setup"; active configuration unchanged until Save.
result: pass
source: live-run (runbook step 2c)
note: Run 2 (runbook step 2c) added the data-level proof this test's last clause asks for: before Save the committed configuration was unchanged (revision 4, default_start 1080, daily_start 1080) while the new values lived only in the draft (1140, 600, expected_revision 4).

### 5. Configuration survives a bot restart
expected: After Save and `docker compose restart bot`, `/settings` shows bold "Chat settings" with sections Schedule → Availability reminders → Planning access and the saved zone intact.
result: pass
source: live-run (runbook step 2d)
note: Verified against the database as well as the rendered card. Also confirms broken window 2 is a stale test expectation, not a product defect. Run 2 went further and proved the ROSTER through a restart (runbook step 4f): docker compose restart bot with a populated roster left /settings showing the saved values and /roster showing the member, and the configuration was reconciled against the stored projection rather than a stale card. That closes AC-3's run-1 residual.

### 6. Update-path logs carry a route, and carry no coordinates
expected: Two ordered parts, and the order is the assertion. FIRST, after the bot has handled at least one update in the live group, grepping its logs must return at least one structured line carrying BOTH an update identifier and a bounded route identifier — if that returns nothing the test FAILS immediately and the second part is not run, because an absence claim over an empty log is vacuously true. ONLY THEN, against a log already shown to be non-empty, grepping for latitude/longitude/decimal coordinates and for the resolved IANA zone value must return nothing.
result: pass
note: "Rewritten by plan 01-22 and reset from issue to pending. The original expectation asserted absence over an unproven set: the 2026-08-24 grep was empty only because the update path emitted nothing at all (F-4), so it would have passed identically with the redactor entirely broken. Plan 01-21 gave the update path a logger and one record per route; plan 01-22 bound the twelve catch clauses that were still discarding exceptions. Redaction itself was and remains genuinely covered by tests/unit/logger.test.ts. This test must be re-run live against the instrumented build rather than inherit the old verdict. RE-ADJUDICATED to pass against live run 2 (2026-08-26): both parts ran in order at runbook step 2e. Part 1 returned a non-empty line carrying both an update identifier and a bounded route identifier, one route record per update; ONLY THEN did part 2 assert absence, over 14 updateId-bearing lines including the location route, and both absence greps came back empty. This pass is NOT vacuous, unlike 2026-08-24."
source: runbook step 2e (rewritten) — F-4

### 7. Edit a setting with a valid value
expected: Bold "Review change" with "Current: <old>" and "New: <new>", buttons "Save change" / "Keep current value"; after Save the card is replaced in place by the updated dashboard.
result: pass
source: live-run (runbook step 3a)
note: Database confirms the two-phase revisioned save (revision 1 → 2, edit draft consumed). Run 2 covered the same behaviour through the wizard (runbook step 3a) and the separate /settings edit flow did not regress.

### 8. Conflicting schedule is rejected without saving
expected: "That schedule does not fit inside the daily time boundaries. No changes were saved." Nothing saved changes, and only the offending field is re-asked while the rest of the draft survives.
result: pass
reported: "The step as written is unrunnable: the daily end value is permanently unreachable from the UI after setup, so Edit daily boundaries is single-field and no multi-field draft exists to partially lose. Separately, there is no defaultStart >= dailyStart check — a schedule that starts an hour before the window opens is already committed in the database."
severity: major
source: live-run (runbook step 3b) — F-5, F-6
note: Re-adjudicated from issue to pass against live run 2 (2026-08-26). The split is stated, not blurred. F-5 CLOSED — runbook step 3c observed separate, reachable "Edit daily start" and "Edit daily end" rows on the dashboard (8 buttons, one per row, against 7 in run 1 where the boundaries were collapsed into a pair and the end was unreachable forever). F-6 CLOSED — the repair migration 20260824000000_repair_schedule_window_floor applied against the live volume (daily_start 1140 to 1080 with revision unmoved) and the floor rule is enforced. NOT RE-RUN — the conflict-rejection path itself, because plans 01-16..01-22 did not touch the rule and run 1 already proved it at the data level with revision unmoved. RESIDUAL, carried forward and still UNVERIFIED: the clause "only the offending field is re-asked while the rest of the draft survives". Boundary edits are single-field on both surfaces, so no multi-field settings draft exists that could be partially lost.

### 9. Add a roster member by reply
expected: Replying to a member's message with `/roster_add` returns "✅ Added <member> to the band roster." with no extra confirmation tap.
result: pass
source: live-run (runbook step 4a)
note: Re-observed in run 2 (runbook step 4a): the add returned immediately with no extra confirmation tap, and decorative characters in the display name rendered without breaking the HTML markup.

### 10. Repeat add is idempotent
expected: A second `/roster_add` on the same reply returns "✅ <member> is already in the band roster." and creates no second membership row.
result: pass
source: live-run (runbook step 4b)
note: Run 2 (runbook step 4b) supplied a stronger proof than the row count. Across a full add, remove and re-add cycle the chat_memberships row kept the SAME id it had in run 1, so the command reactivated a soft-deleted row rather than inserting a duplicate.

### 11. Roster renders safe identity only
expected: Bold "Band roster", alphabetical order, each entry as "• <name> — @username", "• <name>", or "• Telegram user ••••<last 4>". No full numeric ID in any form.
result: pass
source: live-run (runbook step 4c)
note: Decorative characters in a display name did not break the HTML markup. Re-confirmed in run 2 (runbook step 4c): bold "Band roster", the "• <name> — @username" form, exactly one "Remove member" button, and no full numeric ID anywhere.

### 12. Decline a removal confirmation
expected: Bold "Remove <member>?", body "They will no longer be selected for future rehearsals.", buttons "Remove member" / "Keep member"; declining keeps the member in the roster.
result: pass
reported: "Behaviour confirmed — 'Removal cancelled.' replaced the card in place and the membership stayed active in the database — but the verbatim dialog copy was not compared against the contract during the run."
source: live-run (runbook step 4d)
note: Re-adjudicated from skipped to pass against live run 2 (2026-08-26). Run 1 confirmed behaviour only, which is exactly why it was recorded skipped. Run 2 (runbook step 4d) compared the verbatim copy that run 1 could not: bold "Remove <member>?" (roster-renderers.ts:142), body "They will no longer be selected for future rehearsals." (roster-renderers.ts:143), buttons "Remove member" / "Keep member"; after declining, "Removal cancelled." (roster-handlers.ts:456) with the membership still active in the database.

### 13. Confirmed removal, then tapping the same button again
expected: A private alert "Already applied." and no second mutation.
result: pass
source: automated
coverage_id: 01-16/D4
reported: "Not reachable in the roster flow: confirmation replaces the card together with its buttons, so a repeat tap is physically impossible. Idempotence is proven at the data level (single soft-deactivated membership row). The 'Already applied.' surface does not exist on this path; the private-alert check moved to test 17."
note: Recorded as COVERED, not skipped and not a gap. Plan 01-19 removed the live route by design: the card is replaced together with its buttons, so the surface does not exist to tap and "Already applied." is physically unreachable BY DESIGN rather than by oversight. Run 2 (runbook step 4e) confirmed the button is gone with its card and that exactly one soft deactivation occurred. The verbatim text stands on the automated replay in tests/integration/chat-readiness.e2e.test.ts, recorded as deliverable 01-16 D4. This is the fourth of the four contract alert texts named by 01-16 D9: three of the four were confirmed by live tap in run 2, and this one has no live route by design.

### 14. Live demotion takes effect on the next protected action
expected: A demoted actor's command is refused with "Only current chat administrators can change chat setup, roster, or planning access."; a callback shows the private alert "Only current chat administrators can do that."; the actor's draft is deleted before the refusal is shown.
result: pass
reported: "The bot replies with the admin-denial text to an ordinary non-admin message — in a live group, to every one of them. That also makes the command branch of this test non-probative: the same refusal appears without any demotion. The callback branch could not be checked because no live button existed at the moment of demotion."
severity: major
source: live-run (runbook step 5a–5d) — F-7
note: The draft-reset clause of AC-4 is genuinely proven from data — zero drafts of either type after demotion and configuration revision unchanged. Restoring admin rights correctly did not resurrect the draft. Re-adjudicated from issue to pass against live run 2 (2026-08-26). Runbook step 5c exercised the CALLBACK branch that run 1 never reached at all: the verbatim private alert "Only current chat administrators can do that." (callbacks.ts:31), a log record showing denial BEFORE the token was parsed (outcome denied, reason permission-denied, callbackKind null), the actor's draft gone and the configuration revision unmoved. Runbook step 5e is what makes the COMMAND branch probative at last: an ordinary reply from the same demoted actor now draws total silence in the chat, recorded as no-in-flight-action, so the refusal no longer appears without a demotion. F-7 closed.

### 15. Empty roster surface
expected: Header "No band members yet", body "Reply to a member's message, then send /roster_add to add them.", and no Remove buttons. Those two lines are the whole surface; the Copywriting Contract defines no third instruction line.
result: pass
reported: "Header, body and the absence of Remove buttons all match, but the final line 'Reply to a member's message, then send /roster_add.' is missing."
severity: minor
source: live-run (runbook step 6a) — F-8
note: Re-adjudicated to pass on 2026-08-25 (plan 01-20). The missing "final line" was never a contract element, so this was a false positive against a mis-transcribed expectation rather than a product defect. 01-UI-SPEC.md stated the same instruction sentence twice — normatively in the Copywriting Contract and as a paraphrase in the Surface-inventory row — and the runbook-authoring step promoted the paraphrase to a distinct third required line, which propagated into this test and into gap G-01-15. src/telegram/roster-renderers.ts:99-106 renders the Copywriting Contract byte-for-byte and is CORRECT; three exact-match tests (roster-rendering, roster-add, chat-readiness e2e) would fail if a third line were appended. The renderer was not modified. The duplicated sentence was removed from the spec's Surface-inventory row, and broken window 10 was waived as MISFILED rather than fixed. See .planning/debug/empty-roster-missing-final-line.md. Re-observed in run 2 (runbook step 6a) against the CORRECTED expectation: exactly two lines and no Remove buttons.

### 16. Roster pagination beyond 20 members
expected: Pages of 20 alphabetically, footer "Showing <start>–<end> of <total>", Previous/Next buttons, and Remove actions preserved on every page.
result: skipped
reason: "A live run cannot assemble 20+ real accounts. Rendering is unit-covered exactly at the boundary (1, 20, 21 members with verbatim footers). Residual gap: live Previous/Next wiring and per-page Remove actions are keyboard/callback behaviour, not covered by the rendering tests."
source: live-run (runbook step 6b)
note: Unchanged by live run 2 (2026-08-26). Runbook step 6b stays N/A — run 2 could not assemble 20+ real accounts either. The residual gap is STILL OPEN: live Previous/Next wiring and per-page Remove actions are keyboard and callback behaviour, not rendering, and neither run has exercised them.

### 17. Stale action shows its private alert
expected: Tapping a button on an outdated bot message shows "This setup action is no longer available. Send /setup to start again." or, for settings/roster, "This action is no longer available. Open /settings or /roster and try again."
result: pass
reported: "Tapping the expired 'Start setup' button produced no reaction whatsoever — a clean hit on the stale-action branch (0 valid, 17 expired START_SETUP tokens in the database) with no alert shown. No private callback alert is ever displayed, so four verbatim contract texts are unreachable, and the failure is silent because nothing throws."
severity: blocker
source: live-run (runbook step 6c) — F-3
note: Re-adjudicated from issue to pass against live run 2 (2026-08-26). This test names BOTH stale texts, and runbook step 6c landed both. TAP 1 — the stale "Start setup" button returned the verbatim private alert "This setup action is no longer available." / "Send /setup to start again." (setup-handlers.ts:38-39), where run 1 got pure silence. TAP 2, at 15:01 — an "Edit …" button on a /settings dashboard deliberately created at 13:03 and left untouched as a timer, tapped after all 72 SETTINGS_EDIT tokens had passed the 30-minute TTL, returned the verbatim "This action is no longer available. Open /settings or /roster and try again." (settings-handlers.ts:47-48, roster-handlers.ts:46-47). The two strings DIFFER, and that difference is itself the evidence: the alert reaches the correct per-surface branch instead of emitting one generic fallback. F-3 closed live on both branches this test asserts.

### 18. Client-native rendering and in-place card replacement
expected: Text wraps natively with nothing truncated, no reply keyboard and no WebView, and after every callback the bot's original message is replaced by the current state rather than duplicated.
result: pass
reported: "Wrapping is native and everything is inline with no WebView — but the setup wizard appends a new card at every step and leaves the previous card's buttons live, instead of replacing in place the way settings and roster do. Setup step 8 also truncates a button label to 'Previous particip…' because three buttons share one row."
severity: major
source: live-run (runbook step 6d) — F-2, F-9
note: Re-adjudicated from issue to pass against live run 2 (2026-08-26). Runbook step 2b: every callback transition rewrote its card IN PLACE — the zone-confirmation and step-7 cards are absent from the chat history precisely because they were overwritten — and superseded buttons left the screen. The step-8 label rendered untruncated as "Previous participants", one button per row. Runbook step 6d: wrapping native with nothing truncated, no reply keyboard and no WebView across the whole session. F-2 and F-9 both closed.

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
passed: 19
issues: 1
pending: 0
skipped: 1
blocked: 0

**Live run 2 (2026-08-26) returned NOT approved. This UAT now reads almost entirely green and must NOT be mistaken for a passed phase.** AC-5 still fails, on two NEW findings recorded as open windows in `.planning/WINDOWS.md`: F-10, where an expired settings-edit draft is swallowed silently with no expiry copy shown at all, and F-11, where `/setup` unconditionally claims the chat is not configured. The blocking live checkpoint of `01-14-PLAN.md` Task 2 is still not satisfied and the phase stays **pending**. Two residuals survive inside the green: test 16 stays skipped with its live Previous/Next and per-page Remove gap open, and test 8's "only the offending field is re-asked" clause is still unverified. Full run-2 record: `01-LIVE-VERIFICATION-RUNBOOK.md`.

## Gaps

<!-- Root causes filled by parallel diagnosis 2026-08-24. Debug sessions in .planning/debug/. -->

- gap_id: G-01-17
  truth: "A stale or unauthorized callback shows its verbatim private alert"
  status: failed
  reason: "User reported: tapping the expired Start setup button produced no reaction whatsoever; no private callback alert is ever displayed, so four verbatim contract texts are unreachable and the failure is silent."
  severity: blocker
  test: 17
  finding: F-3
  window_id: 4
  root_cause: "src/telegram/callbacks.ts:111 answers every callback query unconditionally with an empty payload before any parse, role lookup or durable read. Telegram honours only the FIRST answer per callback_query.id and silently discards later ones, so all 24 downstream answerCallbackQuery({text, show_alert}) calls are second answers and are dropped. The alert texts are correctly defined and correctly wired; the defect is purely ordering."
  artifacts:
    - path: "src/telegram/callbacks.ts:111"
      issue: "Unconditional text-less ctx.answerCallbackQuery() burns the single answer slot"
    - path: "src/telegram/callbacks.ts:103-106, 123-126, 147-150"
      issue: "Boundary alerts discarded as second answers"
    - path: "src/telegram/setup-handlers.ts:448,467,476,484,500,511,529,540,551,587,605"
      issue: "Discarded alerts"
    - path: "src/telegram/settings-handlers.ts:361,366,386,410,424,445,449"
      issue: "Discarded alerts"
    - path: "src/telegram/roster-handlers.ts:279,315,347"
      issue: "Discarded alerts"
    - path: "tests/integration/chat-readiness.e2e.test.ts:99-121, 441-455"
      issue: "Transport double returns ok:true for a repeated answer and assertions read the LAST answer - the suite ratifies the defect"
  missing:
    - "Make the single answer per query the one that carries the outcome: either remove line 111 and have every terminal branch answer exactly once, or route through a single-shot helper bound to the query id"
    - "Harden the e2e transport double FIRST to reject or flag a second answerCallbackQuery for the same callback_query_id, and assert the FIRST answer"
    - "Revisit and re-record the phase decision 'protected callbacks acknowledge before a live role lookup' - the direct fix contradicts it"
  debug_session: .planning/debug/callback-alerts-never-shown.md

- gap_id: G-01-14
  truth: "Only a genuinely unauthorized actor is refused, and the refusal fires on the next protected action after demotion"
  status: failed
  reason: "User reported: the bot replies with the admin-denial text to an ordinary non-admin message - in a live group, to every one of them."
  severity: major
  test: 14
  finding: F-7
  window_id: 5
  root_cause: "Both update routes in src/telegram/handlers.ts evaluate the administrator gate BEFORE establishing that the update is a protected-action attempt. authorize() fails for any non-administrator, so the denial is sent and the handler returns, never reaching the draft lookup that decides route ownership. The correct silent no-op already exists at setup-service.ts:156 / setup-handlers.ts:375 but is unreachable for non-admins. Model error: CHAT_READINESS_ROUTES marks the two update routes protectedRoute:true exactly like the four command routes, conflating 'route that can carry a protected action' with 'every update here is one'."
  artifacts:
    - path: "src/telegram/handlers.ts:230-233"
      issue: "message:text - gate at :230, denial at :231, return at :232; draft lookup at :234-235 unreachable"
    - path: "src/telegram/handlers.ts:204-207"
      issue: "message:location - structurally identical; draft lookup at :209 unreachable"
    - path: "src/telegram/handlers.ts:94-107"
      issue: "Route declarations carrying flat protectedRoute:true"
    - path: "tests/integration/chat-readiness.e2e.test.ts:329,371,381,384"
      issue: "Only ever sends '19:30' (a plausible wizard answer) then asserts the route must authorize first and must deny - certifies the defect"
  missing:
    - "In the two update branches only: establish route ownership first via a read-only existence probe for an in-flight action for this actor in this chat, authorize second"
    - "No in-flight action -> return silently: no reply, no getChatMember, no deleteMany"
    - "Decide explicitly whether an expired draft counts as a protected attempt (deny, keeping DRAFT_EXPIRED copy) or an ordinary message (silence) - requireActive currently DELETES the expired row before reporting it"
    - "Add the missing regression: ordinary non-admin sentence with no draft must produce zero outbound messages, plus its administrator control"
  ac4_constraint_resolved: "Draft deletion is NOT in handlers.ts - it is a side effect inside AuthorizationService.requireCurrentAdministrator (authorization-service.ts:45-52), strictly before the throw at :53. Delete-before-deny therefore holds BY CONSTRUCTION on all branches and survives any reordering that keeps the protected case flowing through that method. It breaks only if a fix hand-rolls its own role check or moves the deletion out."
  debug_session: .planning/debug/denial-on-ordinary-message.md

- gap_id: G-01-8
  truth: "Daily boundaries are fully editable and an incoherent schedule is rejected before it is saved"
  status: failed
  reason: "User reported: the daily end value is permanently unreachable from the UI after setup, and there is no defaultStart >= dailyStart check - an incoherent schedule is already committed in the database."
  severity: major
  test: 8
  finding: F-5, F-6
  window_id: 6, 7
  root_cause: "Two independent defects. F-5: src/telegram/keyboards.ts:86 renders a plural-labelled 'Edit daily boundaries' button bound to the single field DAILY_START_MINUTE; DAILY_END_MINUTE is bound to no button anywhere, though every other layer (prompt, parser, service, review) already works and settings-handlers.ts:70-81 mints an orphaned DAILY_END_MINUTE token on every dashboard render. F-6: schedule-validator.ts:42-71 enforces four rules and never anchors the rehearsal to the daily window FLOOR; the missing predicate defaultStartMinute >= dailyStartMinute was never specified - 01-UI-SPEC.md:115, 01-PATTERNS.md:121 and 01-06-PLAN.md:102/:120 each enumerate the rules and all omit it. The code matches its contract; the contract is incomplete."
  artifacts:
    - path: "src/telegram/keyboards.ts:86"
      issue: "F-5: single binding, DAILY_END_MINUTE absent from settingsDashboardKeyboard (:74-93)"
    - path: "src/domain/chat/schedule-validator.ts:42-71"
      issue: "F-6: missing floor check between :63 and :64"
    - path: ".planning/phases/01-chat-readiness/01-UI-SPEC.md:115"
      issue: "F-6 origin - rule omitted from the spec; also 01-PATTERNS.md:121, 01-06-PLAN.md:102,:120"
    - path: "src/domain/chat/setup-service.ts:134-144"
      issue: "COLLATERAL DEFECT: beginOrResume never populates expectedRevision (schema defaults it to 0), so on an already-configured chat the save aborts with conflict at :328 after the user walks all eight steps"
    - path: "tests/unit/schedule-settings.test.ts:25-57"
      issue: "All four assertions use defaultStart above dailyStart - mirrors the spec omission"
    - path: "tests/unit/settings.test.ts:84-99"
      issue: "Drives beginEdit(DAILY_END_MINUTE) green at service level while no user can reach the field"
  missing:
    - "F-5: split keyboards.ts:86 into two rows bound to DAILY_START_MINUTE and DAILY_END_MINUTE - no migration, no service change, stays inside the recorded one-field-per-draft decision"
    - "F-6: add the floor check reusing the existing outside-boundaries reason (verbatim copy already covers it, no new user-facing text)"
    - "F-6: amend 01-UI-SPEC.md:115 and 01-PATTERNS.md:121 in the same change or the defect stays re-derivable from the spec"
    - "SEQUENCING: repair the already-committed live row in the same change - once the rule lands, getCommitted stops validating it, /settings degrades to the generic load-failure copy and beginEdit throws, and re-running /setup ALSO fails due to the expectedRevision defect"
  debug_session: .planning/debug/daily-boundaries-incomplete-and-unvalidated.md

- gap_id: G-01-18
  truth: "Every callback replaces the bot's card in place, and no button label is truncated"
  status: failed
  reason: "User reported: the setup wizard appends a new card at every step and leaves the previous card's buttons live; setup step 8 truncates a label to 'Previous particip...' because three buttons share one row."
  severity: major
  test: 18
  finding: F-2, F-9
  window_id: 8, 11
  root_cause: "F-2 primary: replyWithStep (setup-handlers.ts:155-188) types its ctx as {reply: ...} at :156 and therefore emits sendMessage at :168 and :182; the narrow type makes an editMessageText call a compile error. The correct pattern is the structurally identical showReview/showPrompt in settings-handlers.ts:97-130/:131-174, typed {editMessageText: ...}. F-2 contributing (AND-gate): SetupDraft persists NO message_id - no such column exists on any model - which splits the fix. F-9: SETUP_POLICY_BUTTONS (keyboards.ts:44-50) maps all three policies into ONE declared row; setupKeyboard emits .row() only between declared rows. The row algorithm is correct, the declaration is the defect."
  artifacts:
    - path: "src/telegram/setup-handlers.ts:155-188"
      issue: "replyWithStep ctx typed {reply}, emits at :168 and :182; direct replies at :496, :525"
    - path: "src/telegram/keyboards.ts:44-50"
      issue: "F-9: single-row declaration; contrast SETUP_WEEKDAY_BUTTONS :24-34 and planningAccessKeyboard :96-108"
    - path: "prisma/schema.prisma:54-76"
      issue: "SetupDraft has no card-message column - blocks in-place editing on the six text-input steps"
    - path: "tests/integration/chat-readiness.e2e.test.ts:274,278,291,302"
      issue: "completeSetup reads each next wizard card via lastOf('sendMessage') - encodes the defect as its contract"
    - path: ".planning/phases/01-chat-readiness/01-UI-SPEC.md"
      issue: "Spacing Scale xl ('separate bot messages for a new wizard step') contradicts the Interaction Contract ('replace or update the originating bot message'); step 8 pins no row layout while step 2 pins 4-then-3"
  missing:
    - "F-2a (contract-bearing, no migration): give replyWithStep an editMessageText-shaped ctx mirroring showPrompt for the three callback call sites; convert :496 and :525 likewise; update the three lastOf('sendMessage') lookups in completeSetup in the same commit"
    - "F-2b: OUT OF SCOPE by owner decision 2026-08-24 - the six text-input steps stay as-is. Filed as N-6 backlog. Do NOT add SetupDraft.cardMessageId in this wave."
    - "F-9: re-declare SETUP_POLICY_BUTTONS as three single-button rows and add a row-shape assertion (none exists)"
    - "Tighten the UI-SPEC contradiction alongside the code fix"
  f3_coupling: "No data-integrity risk is masked: isExpectedSetupAction (:213-255) and the consumedAt check (:447) already make a stale tap a guarded no-op - F-3 only makes it silent. But only the tapped token is consumed, so sibling and superseded tokens stay live for the draft's 30 minutes with no server-side revocation - the origin of the 17 orphaned START_SETUP tokens in test 17. Fix F-3 then F-2: F-3 alone turns silence into an alert on a button that should not be on screen; F-2 alone removes the button."
  debug_session: .planning/debug/setup-wizard-card-not-replaced.md

- gap_id: G-01-6
  truth: "The update path logs through the redacting logger, so the coordinate grep is meaningfully empty"
  status: failed
  reason: "User reported: the grep is empty only vacuously - there is no logging at all on the update path; all six logger calls live in src/app/main.ts and cover lifecycle only."
  severity: minor
  test: 6
  finding: F-4
  window_id: 12
  root_cause: "Three simultaneously-necessary causes (AND-gate). (1) createLogger is built at main.ts:28 and is in lexical scope at the createBot call on :42-47 but is not passed; none of the three update-path DI containers declares a logger member, so no handler CAN log. (2) The one wired seam, bot.catch (main.ts:50-59), is a genuine update-path seam that already logs updateId/chatId under correct allow-listed keys - but 12 bare 'catch {' blocks convert every exception into user-facing copy without binding the error, so it never fires. (3) 01-14-PLAN.md scoped the logging key_link as main.ts -> logger.ts and its acceptance criterion as a redactor unit test; it never required emission. Confirmed by execution: driving the exact F-3 scenario through the real callback boundary produced STDIO BYTES: 0."
  artifacts:
    - path: "src/app/main.ts:28, 42-47"
      issue: "Logger constructed then omitted from createBot dependencies"
    - path: "src/app/create-bot.ts:22-29"
      issue: "BotDependencies has no logger member"
    - path: "src/telegram/handlers.ts:40-48"
      issue: "ChatReadinessServices has no logger member"
    - path: "src/telegram/callbacks.ts:71-75"
      issue: "CallbackBoundaryDependencies has no logger member"
    - path: "src/telegram/setup-handlers.ts:314,385,418; settings-handlers.ts:235,257,308,400; roster-handlers.ts:139,210,233,260,291"
      issue: "12 bare 'catch {' blocks with no error binding - roster-handlers.ts:260 and :291 are total black holes"
    - path: "src/telegram/callbacks.ts:114,131,136,139,147-152"
      issue: "Non-throwing silent exits on the boundary"
  missing:
    - "Thread a SafeLogger through the three dependency interfaces from the existing main.ts:28 instance"
    - "Instrument the acknowledge-authorize-parse-load-dispatch boundary - each of the five exits gets a distinct event/outcome/reason triple - plus the four command routes and two message routes"
    - "Convert the 12 bare catches to catch (error) and log {err, route, chatId, updateId}"
    - "NON-VACUITY GUARD: the replacement check must assert a POSITIVE existential (handling one update produces >=1 log line carrying updateId and route) BEFORE asserting the negative coordinate grep"
  allow_list_constraints: "timezone is NOT allow-listed and yields [redacted] - either add it to ALLOWED_FIELDS or carry it under field/outcome. An allow-listed key holding an OBJECT is redacted, not walked - pass identifiers as bigint/number/string only. bigint is stringified. err/error yields {name,message,code} only, stack dropped. CHAT_READINESS_ROUTES (handlers.ts:65-129) already defines a bounded id vocabulary that drops straight into the allow-listed route field."
  debug_session: .planning/debug/no-update-path-logging.md

- gap_id: G-01-3
  truth: "Each wizard time step states which time is being entered"
  status: failed
  reason: "User reported: steps 3, 5 and 6 show an identical TIME_HINT with no indication of which time is being entered, while step 7 already uses the correct leading-sentence pattern."
  severity: minor
  test: 3
  finding: F-1
  window_id: 9
  root_cause: "renderSetupStep in src/telegram/renderers.ts interpolates the shared TIME_HINT constant as the ENTIRE message body for the three time-entry branches - :255 (step 3), :263 (step 5), :266 (step 6) - so those prompts state the required input FORMAT but never the SUBJECT. Only the two step-7 branches (:276, :281) prepend a subject sentence, and only because two prompts there share an identical 'Step 7 of 8' header. Six of the eight steps already carry a self-contained subject sentence. Both the hint and the step-7 pattern were authored in the same commit 8d8a670 - an intra-commit consistency lapse, not drift."
  artifacts:
    - path: "src/telegram/renderers.ts:255,263,266"
      issue: "Bare ${TIME_HINT} as the whole body; correct pattern at :276,:281"
    - path: ".planning/WINDOWS.md:26"
      issue: "MISATTRIBUTION: window 9 names setup-handlers.ts, which contains no wizard prompt copy at all. The owner is renderers.ts. (Window 8 / F-2 IS correctly attributed to setup-handlers.ts.)"
    - path: ".planning/phases/01-chat-readiness/01-UI-SPEC.md:128-146"
      issue: "Copywriting Contract has no row for any wizard step prompt - the disambiguation requirement exists only as behavioral prose at :92 and :157"
    - path: "tests/unit/schedule-settings.test.ts:68-80"
      issue: "The sole step-3 assertion checks stringContaining('Step 3 of 8') - the part that was never broken; steps 5 and 6 have no rendering assertion"
  missing:
    - "Prepend a subject sentence to steps 3, 5 and 6 in the step-7 form, deriving names from the wizard-sequence field names (Default rehearsal start time / Daily start boundary / Daily end boundary)"
    - "MUST PREPEND, never replace - the hint itself is contract-fixed at 01-UI-SPEC.md:92 and renders verbatim today"
    - "Correct the file attribution on WINDOWS.md window 9"
  debug_session: .planning/debug/ambiguous-time-hints.md

- gap_id: G-01-19
  truth: "Every SUMMARY coverage block parses against the schema"
  status: failed
  reason: "uat.classify-coverage reported malformed_block: 01-13-SUMMARY.md D8 verification[1].kind is not an allowed value."
  severity: minor
  test: 19
  root_cause: "01-13-SUMMARY.md:127 declares '- kind: manual', a truncation of manual_procedural. The block itself parses (mode: coverage, total: 8); this single out-of-enum value trips the zero-errors clause of the auto-pass gate, demoting entry D8 even though it satisfies every other auto-pass condition. Full sweep: 74 kind: occurrences across .planning/, exactly one offender; all 14 phase summaries classified, 01-13 is the only file with any validation error."
  artifacts:
    - path: ".planning/phases/01-chat-readiness/01-13-SUMMARY.md:127"
      issue: "kind: manual is not in VALID_KINDS (unit, integration, e2e, automated_ui, manual_procedural, other)"
  missing:
    - "Change the single token on line 127 from manual to manual_procedural"
    - "DECIDED by owner 2026-08-24: set kind to manual_procedural AND human_judgment: true with a rationale, keeping D8 a human checkpoint by design. Do NOT let it auto-pass - no automated assertion backs a hand-inspected document."
  adjacent_gaps_excluded: "01-05-SUMMARY.md has no coverage: block at all and silently runs in mode: legacy prose fallback. 01-14-PLAN.md still has no SUMMARY."
  debug_session: .planning/debug/malformed-coverage-block-01-13.md

- gap_id: G-01-15
  truth: "The empty-roster surface ends with 'Reply to a member's message, then send /roster_add.'"
  status: invalid
  reason: "User reported: header, body and absent Remove buttons all match, but the final line is missing."
  severity: minor
  test: 15
  finding: F-8
  window_id: 10
  root_cause: "NOT A CODE DEFECT. src/telegram/roster-renderers.ts:99-106 already renders the Copywriting Contract byte-for-byte. 01-UI-SPEC.md states the empty-state instruction sentence TWICE - normatively in the Copywriting Contract at L134 ('...to add them.') and as an inline paraphrase in the Surface-inventory row at L97 ('...send /roster_add.') - and the spec's own authority note at L152 assigns empty-state copy to the Copywriting Contract, which has no 'final line' element. The runbook-authoring plan (260821-q0p-PLAN.md L113) harvested both and promoted the paraphrase to a distinct third required line, which propagated into the runbook L257, UAT test 15, this gap, and broken window 10."
  artifacts:
    - path: "src/telegram/roster-renderers.ts:99-106"
      issue: "NONE - renders the contract correctly"
    - path: ".planning/phases/01-chat-readiness/01-UI-SPEC.md:97, 134, 152"
      issue: "Same sentence stated twice, once normatively and once as a paraphrase - the duplication is the actual defect"
  missing:
    - "Correct the EXPECTATION, not the renderer: fix runbook L257 and UAT test 15"
    - "De-duplicate 01-UI-SPEC.md so the empty-state sentence appears once, in the Copywriting Contract"
    - "Close WINDOWS.md window 10 as MISFILED, not as fixed - it is filed against a correct source file"
  debug_session: .planning/debug/empty-roster-missing-final-line.md

## Newly Discovered (not from the live run)

<!-- Found during diagnosis. Each needs its own disposition; none is a UAT test result. -->

- id: N-1
  severity: major
  summary: "setup-service.ts beginOrResume never populates expectedRevision (setup-service.ts:134-144; schema.prisma:68 defaults it to 0), so on any chat that has been configured before, /setup aborts with conflict at :328 AFTER the user walks all eight steps."
  why_it_matters: "This is the documented recovery path for a broken configuration, so it must be fixed before or with the F-6 validator change, which otherwise strands the live chat."
  found_by: .planning/debug/daily-boundaries-incomplete-and-unvalidated.md

- id: N-2
  severity: major
  summary: "Four automated gates encode current defects as their contract: chat-readiness.e2e.test.ts:99-121/:441-455 (F-3), :329/:371/:381/:384 (F-7), :274/:278/:291/:302 (F-2), and schedule-settings.test.ts:25-57 (F-6). Each must be corrected in the same change as its defect or the fix will read as a regression."
  why_it_matters: "A green suite currently certifies four of the eight findings. Fixing code without fixing gates produces failing tests that look like the fix is wrong."
  found_by: multiple

- id: N-3
  severity: minor
  summary: "WINDOWS.md file attributions are wrong for windows 6 (F-5 names settings-handlers.ts, owner is keyboards.ts), 9 (F-1 names setup-handlers.ts, owner is renderers.ts) and 10 (F-8 filed against a correct file; the defect is in the spec and the runbook)."
  why_it_matters: "The ledger is the register /gsd-ship gates on; wrong file pointers send fixers to the wrong module."
  found_by: multiple

- id: N-4
  severity: minor
  summary: "01-UI-SPEC.md contains two internal contradictions: the Spacing Scale xl entry ('separate bot messages for a new wizard step') versus the Interaction Contract ('replace or update the originating bot message'); and the empty-state sentence stated twice (L97 paraphrase, L134 normative)."
  why_it_matters: "Both directly caused findings - the first let F-2 survive review, the second manufactured the false F-8."
  found_by: multiple

- id: N-6
  severity: minor
  summary: "In-place card replacement on TEXT-INPUT steps is unimplemented on both setup and settings (setup-handlers.ts text call sites; settings-handlers.ts:342). Requires a SetupDraft.cardMessageId column plus migration and persisting each send's message_id."
  why_it_matters: "Deferred out of the F-2 fix by owner decision on 2026-08-24 so the wave needs no schema change. The UI-SPEC clause is worded 'after every callback', which the callback-half fix satisfies; this is the residual gap beyond that wording."
  found_by: .planning/debug/setup-wizard-card-not-replaced.md

- id: N-5
  severity: minor
  summary: "01-05-SUMMARY.md has no coverage: block and silently runs in mode: legacy prose fallback, so its deliverables are never deterministically classified."
  why_it_matters: "Phase coverage math is quietly incomplete."
  found_by: .planning/debug/malformed-coverage-block-01-13.md

## Deferred Follow-Ups

- test: 2
  idea: "Multi-candidate time-zone branch — needs a location near a time-zone border; owner decided the cost is not justified at this stage."
  deferred_at: 2026-08-24

- test: 16
  idea: "Live Previous/Next wiring and per-page Remove actions for a 20+ member roster."
  deferred_at: 2026-08-24
