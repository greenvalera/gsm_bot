---
status: testing
phase: 02-weekly-rehearsal-proposal
source: [02-VERIFICATION.md]
started: 2026-09-01T09:20:00Z
updated: 2026-09-01T09:20:00Z
---

## Current Test

number: 1
name: Full /plan wizard on a real Telegram group — glyphs, button widths, single live card
expected: |
  Every marker glyph renders as a glyph, not tofu (⭐ usual, 🔁 last rehearsal,
  🚫 unavailable, ✅ chosen). No button label truncates to an ellipsis in the 4/3
  day rows or the 3/3/3/1 slot rows (Phase 1 finding F-9 recurrence). The anchor
  card is edited in place from DAY to TIME to REVIEW to the confirmed card; no
  step tap posts a second message, and exactly ONE card is live at every moment.
awaiting: user response

## Tests

### 1. Full /plan wizard on a real Telegram group
expected: Every glyph renders. No label truncates. The anchor card is edited in place DAY → TIME → REVIEW → confirmed; no second message is posted by a step tap; exactly one card live at any moment.
why_human: Telegram renders emoji, button widths and in-place edits client-side. Nothing in this repo observes what a Telegram client actually draws, and F-9 was found in Phase 1 only on a live run.
steps: /plan → tap a day → tap an hour → tap Back twice → tap Confirm.
result: [pending]

### 2. Single-member roster grammar on the review card
expected: The lineup heading reads correctly for one person.
why_human: Confirmed defect, not a question. `planning-renderers.ts:386` renders "**Asking these band member:**" when `members.length === 1` — the singular arm drops the count but keeps the plural determiner. No test asserts either arm. Code review WR-07, deliberately not fixed; needs a ship/no-ship call on broken grammar on the terminal decision card.
steps: Configure a chat whose active band roster has exactly ONE member, then reach the review step.
result: [pending]

### 3. Non-member refusal names the real reason
expected: A refusal that names the real reason (not in this chat), not an administrator-rights refusal.
why_human: Confirmed defect, not a question. `callbacks.ts:390-395` routes the route-resolved non-member refusal through `denyNonAdministrator`, which always answers CALLBACK_DENIAL ("Only current chat administrators can do that."). That is false for the planning route, where D-02/D-15 admit any member. The correct copy (PLANNING_STATUS_DENIAL) already exists and is unused on this path. Code review WR-10, deliberately not fixed.
steps: In a group where the bot's getChatMember lookup for a band member transiently fails (or with a user who has left), tap any planning button on a live card.
result: [pending]

### 4. Owner name with an ampersand in a callback alert
expected: The private alert names the owner as "Ben & Jo".
why_human: WINDOWS.md defect #20 is OPEN and is the only open window in the ledger. `memberLabel` HTML-escapes for the card, but `answerCallbackQuery` text is plain, so the alert shows "Ben &amp;amp; Jo". Cosmetic, private, single-viewer — deliberately left unfixed because both candidate fixes (a second escaper, or a second identity path) were rejected by 02-05. Needs an owner decision: fix, waive, or carry to the live-run pass.
steps: Have an author whose Telegram display name contains an ampersand or angle bracket own a round, then have a bystander tap a button on that card.
result: [pending]

### 5. Developer decision on the seven deliberately-unfixed defects
expected: Each is fixed, ledgered as a broken window, or explicitly accepted with a reason.
why_human: None of the seven blocks a Phase 2 success criterion — that judgement is recorded in 02-VERIFICATION.md with evidence — but each is a real defect and only the owner decides which ship. WR-05 and WR-08 in particular become Phase 3 problems rather than Phase 2 ones.
items: |
  - WR-05 — callback_actions rows are never reaped
  - WR-06 — dead Zod action members + dead ABANDONED enum value
  - WR-07 — singular-roster grammar on the review card (see test 2)
  - WR-08 — PlanningParticipant.membershipId has no FK and no index on telegramUserId
  - WR-09 — lineup read one statement before the atomic gate under READ COMMITTED
  - WR-10 — wrong non-member refusal text (see test 3)
  - UNREPORTED — back(), selectDay(), selectTime() and takeover() consume the callback
    token before the revision guard, without the release confirm() received. A lost race
    leaves a permanently dead button; back() and takeover() have only one token each.
result: [pending]

### 6. ROADMAP mode/goal format mismatch (project-wide, not a Phase 2 defect)
expected: Either the `**Mode:** mvp` field is corrected, or the phase goals are rewritten as User Stories via `/gsd mvp-phase`.
why_human: Every phase 1-5 in ROADMAP.md carries `**Mode:** mvp`, but no phase Goal is written as a User Story ("As a ..., I want to ..., so that ..."). Under MVP mode the verifier is instructed to refuse verification and demand a User Story goal. It did not refuse, because the mismatch predates Phase 2, affects all five phases, and Phase 2 carries five explicit well-formed Success Criteria that ARE a verifiable contract. Flagged so the discrepancy is not silently absorbed.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
