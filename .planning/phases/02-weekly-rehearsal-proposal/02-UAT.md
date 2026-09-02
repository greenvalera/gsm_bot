---
status: complete
phase: 02-weekly-rehearsal-proposal
source: [02-VERIFICATION.md]
started: 2026-09-01T09:20:00Z
updated: 2026-09-02T09:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Full /plan wizard on a real Telegram group
expected: Every glyph renders. No label truncates. The anchor card is edited in place DAY → TIME → REVIEW → confirmed; no second message is posted by a step tap; exactly one card live at any moment.
why_human: Telegram renders emoji, button widths and in-place edits client-side. Nothing in this repo observes what a Telegram client actually draws, and F-9 was found in Phase 1 only on a live run.
steps: /plan → tap a day → tap an hour → tap Back twice → tap Confirm.
result: pass
source: live-run
evidence: |
  Driven on Telegram Web against chat -5576109925 (GSM_bot_test_group) with the
  bot running from compose against the inherited gsmbot-postgres-data volume.

  Anchor discipline — seven transitions were taken (DAY → TIME → REVIEW → TIME →
  DAY → TIME → REVIEW → CONFIRMED). The card's DOM message id was read before and
  after every transition and never changed; the chat's maximum message id never
  advanced and the rendered message count stayed at 36 throughout. No step tap
  posted a second message and exactly one card was live at every moment.

  Glyphs — all four marker glyphs rendered as real glyphs, not tofu: 🚫 on the
  unavailable day (Mon 31), ⭐ on the usual start (19:00), ✅ on the chosen slot
  (14:00) and on the chosen day (Wed 2).

  Button widths — day rows held 4/3 and slot rows held 3/3/3/1 with no label
  truncated to an ellipsis. Phase 1 finding F-9 did not recur.

  Terminal card — the CONFIRMED card carried no reply_markup, as specified.

  Durable outcome — planning_rounds row cmtj4wa3e000101qn7w5u0qr8: status
  CONFIRMED, step REVIEW, active_week_start NULL (week released), author 340431867,
  selected_date 2026-09-02, selected_start_minute 840, starts_at 2026-09-02
  11:00:00+00, ends_at 13:00:00+00, revision 9. The confirm-time lineup snapshot
  persisted as exactly one planning_participants row (telegram_user_id 340431867,
  membership cmtj4vypc000001qnvgmd2lvb, active), matching the one-member roster.

  Note on message ids: the DB anchor_message_id is 181 while the Telegram Web DOM
  reports 397923 for the same message. These are different id spaces — 36 rendered
  messages cannot span Bot API ids up to 397923 — so the DOM attribute is a
  client-internal identifier, not the Bot API message_id. The invariant under test
  (the id is constant across every transition, and the chat maximum never advances)
  holds in either space, so this is not a defect.

### 2. Single-member roster grammar on the review card
expected: The lineup heading reads correctly for one person.
why_human: Confirmed defect, not a question. `planning-renderers.ts:386` renders "**Asking these band member:**" when `members.length === 1` — the singular arm drops the count but keeps the plural determiner. No test asserts either arm. Code review WR-07, deliberately not fixed; needs a ship/no-ship call on broken grammar on the terminal decision card.
steps: Configure a chat whose active band roster has exactly ONE member, then reach the review step.
result: issue
source: live-run + code-repro
reported: "Reproduced live on the review card with a one-member roster: the heading reads 'Asking these band member:'. Reproducing it deterministically against renderReviewStep exposed a SECOND defect on the same card that WR-07 does not list — the closing sentence is a constant with no singular arm, so it reads 'Confirming commits the rehearsal and starts the availability round, where each of them answers whether they can make it.' Fixing planning-renderers.ts:386 alone would leave the card still wrong."
severity: major
evidence: |
  Rendered card for a one-member roster, verbatim:

    <b>Confirm the rehearsal — Wed 2 Sep</b>
    Start 14:00 · 120 minutes.

    <b>Asking these band member:</b>
    • Solo

    Confirming commits the rehearsal and starts the availability round, where each of them answers whether they can make it.

  Two singular arms are missing, not one: the determiner "these" in the heading
  (planning-renderers.ts:386) and the whole closing line (planning-renderers.ts:391),
  which has no ternary at all.

### 3. Non-member refusal names the real reason
expected: A refusal that names the real reason (not in this chat), not an administrator-rights refusal.
why_human: Confirmed defect, not a question. `callbacks.ts:390-395` routes the route-resolved non-member refusal through `denyNonAdministrator`, which always answers CALLBACK_DENIAL ("Only current chat administrators can do that."). That is false for the planning route, where D-02/D-15 admit any member. The correct copy (PLANNING_STATUS_DENIAL) already exists and is unused on this path. Code review WR-10, deliberately not fixed.
steps: In a group where the bot's getChatMember lookup for a band member transiently fails (or with a user who has left), tap any planning button on a live card.
result: issue
source: code-repro
reported: "Confirmed at source. A non-member tapping a route-resolved planning button reaches callbacks.ts:388-393, which calls denyNonAdministrator with the deniedNonMember branch; that helper (callbacks.ts:292-301) always answers with CALLBACK_DENIAL. The alert therefore reads 'Only current chat administrators can do that.', which is false for the planning route — D-02/D-15 admit any chat member. The correct copy exists and is reachable nowhere on this path: PLANNING_STATUS_DENIAL = 'Only people in this chat can check the rehearsal plan.'"
severity: major
verified_by: |
  Could not be driven live from a single browser session — it needs a second,
  non-member Telegram account tapping the card, and authenticating as another
  user is out of bounds. Verified deterministically instead: the branch is
  unconditional (no route check between callbacks.ts:388 and the answerCallbackQuery
  at :297), and both copy constants were evaluated to confirm the exact strings.

### 4. Owner name with an ampersand in a callback alert
expected: The private alert names the owner as "Ben & Jo".
why_human: WINDOWS.md defect #20 is OPEN and is the only open window in the ledger. `memberLabel` HTML-escapes for the card, but `answerCallbackQuery` text is plain, so the alert shows "Ben &amp;amp; Jo". Cosmetic, private, single-viewer — deliberately left unfixed because both candidate fixes (a second escaper, or a second identity path) were rejected by 02-05. Needs an owner decision: fix, waive, or carry to the live-run pass.
result: issue
source: code-repro
reported: "Reproduced deterministically. planningNotAuthorText with firstName 'Ben & Jo' returns, verbatim: 'Only Ben &amp; Jo can use this card's buttons — they started this plan.' Since answerCallbackQuery text is plain, the bystander sees the literal entity 'Ben &amp; Jo'. One correction to the ledger: WINDOWS.md #20 predicts 'Ben &amp;amp; Jo' — that is the HTML source form. The alert actually shows a single escape, 'Ben &amp; Jo'. The defect is real; only the predicted string was off."
severity: cosmetic
verified_by: |
  memberLabel (roster-renderers.ts:39-52) escapes for HTML on every branch;
  planningNotAuthorText (planning-handlers.ts:140-142) is the only alert that
  embeds an owner name, and it consumes memberLabel directly.

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
result: issue
source: owner-decision
reported: "Fix now"
severity: major
decision: |
  The owner elected to FIX all seven rather than ledger or accept any of them.
  None is waived and none is carried forward as a broken window.

  Three of the seven already carry their own gap from an earlier test and are
  not duplicated here: WR-07 → G-02-2 (and note that gap is wider than WR-07 —
  a second singular arm is missing), WR-10 → G-02-3, WINDOWS.md #20 → G-02-4.

  The remaining four plus the unreported race are carried by G-02-5.

### 6. ROADMAP mode/goal format mismatch (project-wide, not a Phase 2 defect)
expected: Either the `**Mode:** mvp` field is corrected, or the phase goals are rewritten as User Stories via `/gsd mvp-phase`.
why_human: Every phase 1-5 in ROADMAP.md carries `**Mode:** mvp`, but no phase Goal is written as a User Story ("As a ..., I want to ..., so that ..."). Under MVP mode the verifier is instructed to refuse verification and demand a User Story goal. It did not refuse, because the mismatch predates Phase 2, affects all five phases, and Phase 2 carries five explicit well-formed Success Criteria that ARE a verifiable contract. Flagged so the discrepancy is not silently absorbed.
result: issue
source: doc-audit
reported: "Still unresolved, and narrower than the test text says. Phase 1's goal HAS since been rewritten as a User Story ('As a chat admin, I want to configure a durable, access-controlled chat, so that the band can plan rehearsals.' — ROADMAP.md:24). Phases 2, 3, 4 and 5 still carry **Mode:** mvp over declarative, non-User-Story goals (ROADMAP.md:165-166, 209-210, 225-226, 241-242). Neither remedy has been applied to those four, so the mismatch stands for 4 of 5 phases rather than 5 of 5."
severity: major
scope: project-wide — not a Phase 2 code defect; do not gate Phase 2 on it.

## Summary

total: 6
passed: 1
issues: 5
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-02-2
  truth: "The lineup heading on the review card reads correctly for a roster of one person."
  status: failed
  reason: "Reproduced live and deterministically: the heading renders 'Asking these band member:' (plural determiner with a singular noun), and a second, previously unlisted defect sits on the same card — the closing line 'where each of them answers whether they can make it' is a constant with no singular arm. WR-07 names only the first; fixing planning-renderers.ts:386 alone leaves the card wrong."
  severity: major
  test: 2
  artifacts: []
  missing: []

- gap_id: G-02-3
  truth: "A non-member who taps a planning button is told the real reason — that they are not in this chat — not that the surface is administrator-only."
  status: failed
  reason: "Confirmed at source: callbacks.ts:388-393 routes the deniedNonMember branch through denyNonAdministrator, which unconditionally answers CALLBACK_DENIAL ('Only current chat administrators can do that.'). That is false for the planning route, where D-02/D-15 admit any member. PLANNING_STATUS_DENIAL ('Only people in this chat can check the rehearsal plan.') already exists and is unreachable on this path."
  severity: major
  test: 3
  artifacts: []
  missing: []

- gap_id: G-02-4
  truth: "A private callback alert names an owner whose display name contains an ampersand as 'Ben & Jo'."
  status: failed
  reason: "Reproduced: planningNotAuthorText returns 'Only Ben &amp; Jo can use this card's buttons — they started this plan.' answerCallbackQuery text is plain, so the bystander sees the literal entity. memberLabel escapes for HTML on every branch and is the only identity path the alert has. (WINDOWS.md #20 predicts a double escape; the alert shows a single one.)"
  severity: cosmetic
  test: 4
  artifacts: []
  missing: []

- gap_id: G-02-6
  truth: "ROADMAP phase mode and goal format agree — either **Mode:** mvp is corrected or the goal is a User Story."
  status: failed
  reason: "Phases 2-5 still carry **Mode:** mvp over declarative goals (ROADMAP.md:165-166, 209-210, 225-226, 241-242). Phase 1 has since been rewritten as a User Story (ROADMAP.md:24), so the mismatch is 4 of 5 phases, not 5 of 5. Project-wide bookkeeping — not a Phase 2 code defect, and it must not gate Phase 2."
  severity: major
  test: 6
  artifacts: []
  missing: []

- gap_id: G-02-5
  truth: "Every defect the owner elected to fix is fixed: no unreaped callback_actions rows, no dead Zod/enum members, a referential-integrity-backed PlanningParticipant, a lineup read inside the atomic gate, and no callback token consumed before its revision guard."
  status: failed
  reason: "Owner decision on test 5 was 'Fix now' for all seven. This gap carries the five that have no gap of their own: WR-05 (callback_actions rows are never reaped), WR-06 (dead Zod action members and the dead ABANDONED enum value), WR-08 (PlanningParticipant.membershipId has no FK and telegramUserId has no index), WR-09 (the lineup is read one statement before the atomic gate under READ COMMITTED), and the UNREPORTED token race (back(), selectDay(), selectTime() and takeover() consume the callback token before the revision guard, without the release confirm() received — a lost race leaves a permanently dead button, and back() and takeover() have only one token each). WR-07, WR-10 and WINDOWS.md #20 are already carried by G-02-2, G-02-3 and G-02-4."
  severity: major
  test: 5
  artifacts: []
  missing: []

## Diagnoses

Root causes established by direct source inspection during this session. No
debug agents were spawned — every claim below was read at the cited line.

- gap_id: G-02-2
  root_cause: |
    `renderReviewStep` (src/telegram/planning-renderers.ts:375-400) builds the
    lineup block from two strings, only one of which has a count-dependent arm.
    Line 386's ternary swaps the NOUN ("band member" / "N band members") but the
    determiner "these" is outside the ternary, so one member reads "Asking these
    band member:". Line 391 is a plain constant — "…where each of them answers
    whether they can make it." — with no arm at all, so it is wrong for one
    member regardless of what line 386 does.
  fix_shape: Give both strings a singular arm; assert both arms in a renderer test.

- gap_id: G-02-3
  root_cause: |
    src/telegram/callbacks.ts:388-393. Inside the `if (!isAdministrator)` block,
    the `route.authority === "current-admin"` branch returns first; everything
    that falls through is a route-resolved surface. The non-member check then
    calls the SAME helper the admin branch calls — `denyNonAdministrator`
    (callbacks.ts:292-301) — which hard-codes `text: CALLBACK_DENIAL`. There is
    no route-dependent copy on that path, so a member-open surface answers with
    an administrator-rights refusal. The correct string already exists as
    PLANNING_STATUS_DENIAL (planning-handlers.ts:67-68) and no code reaches it
    from a callback.
  fix_shape: Give the deniedNonMember branch its own copy (per-route text on the route row, or a distinct helper); assert the branch answers it.

- gap_id: G-02-4
  root_cause: |
    `planningNotAuthorText` (src/telegram/planning-handlers.ts:140-142) is the
    only alert that embeds an identity, and it interpolates `memberLabel`
    (src/telegram/roster-renderers.ts:39-52), which calls `escapeHtml` on every
    branch because its primary consumer is a `parse_mode: "HTML"` card.
    `answerCallbackQuery` text is plain, so the escape is never undone.
    Verified output: "Only Ben &amp; Jo can use this card's buttons — they
    started this plan."
  fix_shape: A plain-text identity formatter for alert copy, sharing memberLabel's name/username/fallback precedence but not its escaping.

- gap_id: G-02-5
  root_cause: |
    WR-05 — nothing in src/ ever deletes a callbackAction row. The only
    delete/deleteMany references are in the generated client. Rows accumulate
    for the life of the database. Note the table's only index is
    `@@index([chatId, actorUserId, expiresAt])` (prisma/schema.prisma), unlike
    SetupDraft and SettingsEditDraft which each carry `@@index([expiresAt])` —
    so a reaper keyed on expiresAt alone has no index to use.

    WR-06 — `ABANDONED` is declared in prisma/schema.prisma:30 and appears
    nowhere in src/ outside the generated client. Dead enum value; the dead Zod
    action members are its counterpart.

    WR-08 — PlanningParticipant (prisma/schema.prisma:202-211) declares
    `membershipId String @map("membership_id")` with NO `@relation` to
    ChatMembership and no index on `telegramUserId`. Confirmed live: the table
    has exactly one FK, `planning_participants_round_id_fkey`. Phase 3 reads
    these rows to decide who may answer, so a dangling membershipId is a
    cross-phase correctness hazard, and its per-user lookup is unindexed.

    WR-09 — `confirm()` reads the lineup via `listActiveMemberships(tx, chatId)`
    (planning-service.ts:1352) BEFORE the compare-and-set at :1354 and the
    revision-guarded promotion at :1367. Under READ COMMITTED the transaction
    cannot see a roster change committed after that read, so the snapshot
    written at :1404 can disagree with the roster at commit time.

    UNREPORTED (the sharpest of the five) — `selectDay` (:991), `selectTime`
    (:1105), `back` (:1198) and `takeover` (:1555) each consume the callback
    token with `updateMany ... consumedAt: null` and only THEN guard on
    `revision`. When the guard fails they `return { kind: "stale" }`. Prisma
    commits an interactive transaction on a normal return, so the consume is
    durable while the transition never happened. `confirm()` is the only one
    that handles this — planning-service.ts:1391-1397 explicitly releases the
    token with `data: { consumedAt: null }` on a lost race, and its comment
    names the exact symptom. `back()` and `takeover()` mint one token each, so a
    lost race there leaves a permanently dead button with no second control to
    escape through.
  fix_shape: Mirror confirm()'s release into the other four; reap expired callback_actions on a schedule (with a supporting index); add the ChatMembership relation and telegramUserId index; read the lineup after the atomic gate; delete the dead enum value and Zod members.

- gap_id: G-02-6
  root_cause: |
    ROADMAP.md bookkeeping, not code. Phase 1's goal has been rewritten as a
    User Story (line 24); phases 2-5 (lines 165-166, 209-210, 225-226, 241-242)
    still pair `**Mode:** mvp` with declarative goals. Out of Phase 2's scope —
    must not gate Phase 2 completion.
  fix_shape: Owner's choice — correct the Mode field on phases 2-5, or rewrite their goals as User Stories.
