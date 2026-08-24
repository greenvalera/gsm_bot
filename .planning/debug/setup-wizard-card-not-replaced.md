---
status: diagnosed
trigger: "Investigate issue: setup-wizard-card-not-replaced — F-2 (broken window 8): setup wizard appends a new card at every step and leaves the previous card's buttons live instead of replacing the card in place. F-9 (broken window 11): setup step 8 truncates a button label to 'Previous particip…' because three buttons share one row."
created: 2026-08-24T00:00:00Z
updated: 2026-08-24T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED (both defects). F-2 — the setup surface renders every wizard step through `replyWithStep`, whose ctx contract is `{ reply }`, so all callback-driven steps `sendMessage` a new card; settings/roster render their callback steps through `showReview`/`showPrompt`, whose ctx contract is `{ editMessageText }`. F-9 — `SETUP_POLICY_BUTTONS` declares the three policy buttons as one row; `setupKeyboard` reproduces declared rows verbatim, so all three share a row and Telegram truncates the middle label.
test: (1) drove `dispatchSetupCallback` for weekday and policy selections against a recording ctx exposing both `reply` and `editMessageText`; (2) printed the serialized `inline_keyboard` shape of `setupKeyboard(SETUP_POLICY_BUTTONS)` vs `planningAccessKeyboard`.
expecting: (1) `reply(...)` recorded, `editMessageText` never called; (2) setup = one row of three, settings = three rows of one.
next_action: none — diagnose-only mode, root cause reported to caller. Do not fix.
bug_class: Bohrbug (deterministic, reproduces on every callback; no timing or concurrency component)

reasoning_checkpoint:
  hypothesis: "F-2: every setup wizard step is emitted with ctx.reply (sendMessage) rather than ctx.editMessageText, because the shared renderer replyWithStep types its ctx as { reply }. F-9: SETUP_POLICY_BUTTONS groups three buttons into a single declared row and setupKeyboard lays declared rows out verbatim."
  confirming_evidence:
    - "Probe: dispatchSetupCallback weekday selection recorded only reply(\"Setup in progress\\nStep 3 of 8…\"); editMessageText never invoked."
    - "Probe: dispatchSetupCallback policy selection recorded only reply(\"<b>Review configuration</b>…\"); editMessageText never invoked."
    - "Probe: setupKeyboard(SETUP_POLICY_BUTTONS) serializes to [[\"Admins only\",\"Previous participants\",\"Anyone in chat\"]]; planningAccessKeyboard serializes to [[\"Admins only\"],[\"Previous participants\"],[\"Anyone in chat\"],[]]."
    - "Static: replyWithStep ctx parameter is typed { reply: (text, options?) => Promise<unknown> } (setup-handlers.ts:156); showReview/showPrompt ctx parameters are typed { editMessageText: … } (settings-handlers.ts:99, :133)."
  falsification_test: "If a recording ctx had shown editMessageText for any callback-driven step, or if the setup policy keyboard had serialized to three single-button rows, the hypothesis would be dead. Neither happened."
  fix_rationale: "F-2's cause is the emission verb on the callback paths, not the renderer or the token model, so switching those specific call sites to editMessageText addresses the root cause. F-9's cause is the row declaration, not the label text or setupKeyboard's algorithm, so re-declaring SETUP_POLICY_BUTTONS as three rows addresses the root cause."
  blind_spots: "Not exercised against live Telegram — client-side truncation width is inferred from the reported symptom, not measured. The text-input steps cannot be fixed by the same change (no persisted message_id); that half is a design gap, not a mis-typed call."
  candidate_causes:
    - "code: replyWithStep uses ctx.reply on callback paths (CONFIRMED — primary)"
    - "data/schema: SetupDraft persists no message_id, so text-input steps have no card identity to edit (CONFIRMED — contributing, bounds the fix)"
    - "config: none — no feature flag, env var, or setting selects reply vs edit (ELIMINATED)"
    - "environment: none — reproduces in an in-process probe with no Telegram, network, or client involvement (ELIMINATED)"
  and_gate: "yes for F-2. Restoring the contract on EVERY wizard transition requires two simultaneous conditions to be fixed: (a) the callback-path emission verb, and (b) the absence of a persisted card message_id for the text-input steps. Fixing (a) alone repairs the 6 callback transitions the UAT contract names ('after every callback') but leaves steps 3–6 and the reminder-time prompts still appending. F-9 is single-cause (and_gate: no)."

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: After every callback the bot's original message is replaced by the current state rather than duplicated, and no button label is truncated in the Telegram client.
actual: The setup wizard appends a new card at each step and leaves the earlier cards' buttons live and tappable. Settings and roster do this correctly — they replace their card in place — so the defect is localised to the setup wizard. On setup step 8, the planning-access choice renders three buttons in one row and the middle label truncates to "Previous particip…".
errors: None — both are contract deviations, not failures.
reproduction: Test 18 in .planning/phases/01-chat-readiness/01-UAT.md; runbook steps 6d and 2b.
started: Discovered during the live Telegram group verification run on 2026-08-24.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: "The setup wizard cannot edit in place because grammY's ctx.editMessageText is unavailable on the setup callback context."
  evidence: "CallbackContext is Filter<Context, 'callback_query:data'> (callbacks.ts:37) — the same type roster-handlers.ts:287/:306/:337/:344 and settings-handlers.ts:125/:167/:173/:468 successfully call ctx.editMessageText on. grammY resolves the target from ctx.callbackQuery.message, so no stored id is needed on a callback path. The setup dispatcher receives exactly this type."
  timestamp: 2026-08-24

- hypothesis: "A config/env/feature switch selects reply-vs-edit and is set wrongly for setup."
  evidence: "No such switch exists. replyWithStep (setup-handlers.ts:155-188) has ctx typed as { reply } — the verb is compile-time fixed, not selected at runtime. Probe reproduced the behaviour with no config loaded at all."
  timestamp: 2026-08-24

- hypothesis: "F-9 is caused by the label 'Previous participants' exceeding the UI-SPEC 24-character button budget."
  evidence: "The label is 21 visible characters, inside budget. The identical label renders untruncated in the settings surface, where planningAccessKeyboard gives it a full-width row. Row density is the variable, not label length."
  timestamp: 2026-08-24

- hypothesis: "setupKeyboard's row algorithm is broken and collapses declared rows."
  evidence: "setupKeyboard(SETUP_WEEKDAY_BUTTONS) serialized to [['Mon','Tue','Wed','Thu'],['Fri','Sat','Sun']] — declared rows are reproduced faithfully. The algorithm is correct; the SETUP_POLICY_BUTTONS declaration is what groups three into one row."
  timestamp: 2026-08-24

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-08-24
  checked: .planning/debug/knowledge-base.md and .planning/debug/resolved/
  found: Neither exists — this is the first debug session in the project.
  implication: No prior-pattern shortcut available; full investigation required.

- timestamp: 2026-08-24
  checked: src/telegram/setup-handlers.ts:155-188 (replyWithStep) against src/telegram/settings-handlers.ts:97-130 (showReview) and :131-174 (showPrompt)
  found: Structurally the same helper — mint tokens, render projection, emit. The only difference is the ctx contract: replyWithStep declares `ctx: { reply: (text: string, options?: object) => Promise<unknown> }` (line 156); showReview declares `ctx: { editMessageText: (text: string, options?: object) => Promise<unknown> }` (line 99), as does showPrompt (line 133).
  implication: The divergence is a single wrong verb in one shared helper, structurally parallel to the correct implementation. The narrow ctx typing means the helper *cannot* edit — TypeScript would reject an editMessageText call — so the mistake was locked in at the signature.

- timestamp: 2026-08-24
  checked: every emission call site in src/telegram/setup-handlers.ts
  found: replyWithStep is reached from three callback-path sites — :560 (timezone "Use <zone>"), :593 (weekday / reminders-defaults / reminders-edit / policy), :596 (bare START_SETUP, i.e. the "Start setup" button) — and from six text-path sites (:379, :386, :398, :408, :417, :419, :430). Two further callback-path emissions bypass the helper and call ctx.reply directly: :496 (committed configuration after Save) and :525 ("Setup cancelled.").
  implication: Six distinct callback transitions violate the "replace in place" contract: Start setup→Step 1, Use <zone>→Step 2, weekday→Step 3, Use defaults/Edit times→Step 8 or reminder prompt, policy→Review, Save→committed card, Cancel→"Setup cancelled.".

- timestamp: 2026-08-24
  checked: prisma/schema.prisma models SetupDraft (:54-76) and SettingsEditDraft (:78-92); grep -in "message" over the whole schema; grep -rln "message_id" over prisma/migrations
  found: NO message_id / card-message column exists anywhere in the schema — not on SetupDraft, not on SettingsEditDraft, not on any model. The token 'message' does not appear in schema.prisma at all, and no migration mentions message_id.
  implication: DECISIVE for fix sizing. The callback-driven half of F-2 needs no schema work (grammY derives the target from ctx.callbackQuery.message). The text-input half — steps 3, 4, 5, 6 and both reminder-time prompts — has no card identity to edit and CANNOT be made in-place without a new nullable column (e.g. SetupDraft.cardMessageId BigInt?) plus a migration plus persisting the message_id returned by each send. Anyone scoping this as "swap reply for editMessageText" is scoping only the callback half.

- timestamp: 2026-08-24
  checked: src/telegram/settings-handlers.ts:291-346 (handleSettingsText)
  found: Settings also uses ctx.reply on its text-input path (line 342), exactly like setup. Its in-place behaviour exists only on callback paths (:125, :167, :173, :468).
  implication: The "settings and roster do this correctly" comparison in the symptom holds specifically for callback transitions. The UAT contract is worded the same way ("after every callback"), so the callback half is the contract-bearing half; the text half is an unbudgeted design gap that the reference surfaces share.

- timestamp: 2026-08-24
  checked: PROBE — drove dispatchSetupCallback (weekday selection, then policy selection) against a recording ctx exposing reply, editMessageText, answerCallbackQuery and api.editMessageText, with stubbed prisma/setup deps
  found: weekday-callback calls: ["reply(\"Setup in progress\\nStep 3 of 8\\n\\nSend a ti\")"] — policy-callback calls: ["reply(\"<b>Review configuration</b>\\nTime zone: <\")"]. editMessageText was never invoked on either path.
  implication: F-2 confirmed by direct observation, deterministically, with no Telegram/network/client involvement. Bohrbug.

- timestamp: 2026-08-24
  checked: PROBE — serialized inline_keyboard of setupKeyboard(SETUP_POLICY_BUTTONS), planningAccessKeyboard, and setupKeyboard(SETUP_WEEKDAY_BUTTONS)
  found: SETUP step 8 rows: [["Admins only","Previous participants","Anyone in chat"]] — SETTINGS policy rows: [["Admins only"],["Previous participants"],["Anyone in chat"],[]] — SETUP weekday rows: [["Mon","Tue","Wed","Thu"],["Fri","Sat","Sun"]].
  implication: F-9 confirmed. Three buttons share one row in setup and each therefore gets ~1/3 of the card width; the 21-character middle label is the one that cannot fit, matching the reported "Previous particip…". Settings escapes it via one-per-row. Adjacent observation: planningAccessKeyboard emits a trailing empty row [] because it calls .row() after the last button — Telegram ignores it, so it is cosmetic, not the defect.

- timestamp: 2026-08-24
  checked: src/telegram/keyboards.ts:44-50 (SETUP_POLICY_BUTTONS) and :58-72 (setupKeyboard) vs :96-108 (planningAccessKeyboard)
  found: SETUP_POLICY_BUTTONS maps the three policy values with a single .map() into ONE array, producing one declared row; the weekday constant above it (:24-34) deliberately splits into two arrays (4 then 3). setupKeyboard emits .row() only *between* declared rows (:67-69), so one declared row means one keyboard row. planningAccessKeyboard instead calls .row() after every button (:105).
  implication: F-9's root cause is one declaration, at keyboards.ts:46-49 — the same generator shape as the weekday constant but without the deliberate row split. Two equivalent correct patterns already exist in the same file (SETUP_WEEKDAY_BUTTONS' explicit split, planningAccessKeyboard's per-button .row()).

- timestamp: 2026-08-24
  checked: tests/integration/chat-readiness.e2e.test.ts completeSetup (:253-305)
  found: After each wizard callback the test reads the next card via harness.lastOf("sendMessage") — e.g. :278 (weekday "Wed"), :291 ("Use defaults"), :302 ("Admins only") — and only uses lastOf("editMessageText") for the timezone-candidate card (:274), which genuinely is an edit. No test asserts the policy keyboard's row shape; the nearest neighbour, tests/integration/chat-configuration.test.ts:180, reads the *settings* policy selection at inline_keyboard[2][0], which passes only because settings is one-per-row.
  implication: WHY NOT CAUGHT. The e2e gate does not merely miss F-2 — it encodes the defect as its contract. Correcting setup to editMessageText will fail completeSetup at :278/:291/:302, so the fix must update those lookups. The harness callback fixture already carries message: { message_id: 777, chat: … } (:206-210), so ctx.editMessageText is exercisable there without harness surgery. F-9 was never gated at all.

- timestamp: 2026-08-24
  checked: src/telegram/callbacks.ts:109-155 (callback boundary) and setup-handlers.ts:546-553 (token consumption)
  found: The boundary calls a bare `await ctx.answerCallbackQuery()` at :111 before any dispatch, so every later answerCallbackQuery({text, show_alert}) in the dispatchers is a second answer to an already-answered query and shows nothing (F-3). Separately, consumption at :546 marks only the tapped token; sibling tokens on the same card and all tokens on superseded cards stay unconsumed and unexpired for the draft's 30-minute life, and nothing revokes them.
  implication: F-2/F-3 INTERACTION, as anticipated. Stale buttons remain physically tappable purely because the superseded card is still on screen with its keyboard attached; in-place editing is what makes those tokens unreachable, since there is no server-side revocation of superseded tokens. State corruption is nonetheless blocked by isExpectedSetupAction (:213-255) and the consumedAt check (:447) — so a stale tap is a guarded no-op that F-3 renders silent. Fixing F-3 alone converts the silence into a "no longer available" alert on a button that should not have been there; fixing F-2 alone removes the buttons. Both are needed for the contract, and neither masks a data-integrity bug. This also explains the 17 orphaned START_SETUP tokens observed in UAT test 17.

- timestamp: 2026-08-24
  checked: .planning/phases/01-chat-readiness/01-UI-SPEC.md — Spacing Scale (xl token) vs Interaction Contract (Callback and command behavior) and step 8 of the wizard sequence
  found: The xl token reads "Separate bot messages for a new wizard step rather than padding one message", while the callback contract reads "During a successful mutation, replace or update the originating bot message with the authoritative resulting state". Step 8 lists the three policy choices without pinning a row layout, whereas step 2 explicitly pins "two rows (4 then 3)".
  implication: CONTRIBUTING SPEC AMBIGUITY, not a second root cause. The xl row is a plausible-reading escape hatch for the reply-per-step implementation, and step 8's missing layout clause is why the one-row grouping passed review while the weekday split did not. Both spec rows are worth tightening alongside the code fix so the contract cannot be read two ways.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "F-2 (primary): src/telegram/setup-handlers.ts:155-188 — the shared step renderer replyWithStep types its ctx as `{ reply: … }` and emits every wizard step with ctx.reply (:168 no-keyboard branch, :182 keyboard branch), i.e. sendMessage, so each callback appends a card and leaves the superseded card's keyboard attached and tappable; the same file bypasses the helper and replies directly at :496 (post-Save committed card) and :525 (Setup cancelled). The correct project pattern is settings-handlers.ts showReview/showPrompt (:97-130, :131-174), whose ctx is typed `{ editMessageText: … }`, and roster-handlers.ts :287/:306/:337/:344 — all on the identical CallbackContext type (callbacks.ts:37), proving no stored message id is needed on a callback path; F-2 (contributing, AND-gate): prisma/schema.prisma SetupDraft (:54-76) persists NO message_id column — none exists anywhere in the schema — so the six text-input transitions (:379, :386, :398, :408, :417, :419, :430) have no card identity to edit and cannot be made in-place without a new nullable column and migration; F-9: src/telegram/keyboards.ts:44-50 — SETUP_POLICY_BUTTONS maps all three policy values into a single declared row, and setupKeyboard (:58-72) emits .row() only between declared rows (:67-69), so the three share one keyboard row at ~1/3 width each and Telegram truncates the 21-character 'Previous participants'; the sibling constant SETUP_WEEKDAY_BUTTONS (:24-34) splits rows deliberately and settings' planningAccessKeyboard (:96-108) calls .row() per button, so both correct patterns already exist in the same file."
fix: "" # diagnose-only mode — no fix applied
verification: "" # diagnose-only mode
files_changed: []
