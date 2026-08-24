---
status: diagnosed
trigger: "Investigate issue: denial-on-ordinary-message — The bot replies with the administrator-denial text to an ordinary non-admin message — in a live group, to every single one. This is finding F-7, broken window id 5."
created: 2026-08-24T00:00:00Z
updated: 2026-08-24T00:00:00Z
goal: find_root_cause_only
bug_class: Bohrbug
---

## Current Focus

hypothesis: CONFIRMED — `bot.on("message:text")` (handlers.ts:224-248) and `bot.on("message:location")` (handlers.ts:201-222) call the `authorize()` gate BEFORE the route decides whether the update is a protected-action attempt. Route ownership (does the actor have a live settings draft or setup draft?) is only determined AFTER the denial has already been sent and the handler has returned.
test: Reproduction harness driving the real `registerChatReadinessHandlers` over a real grammY `Bot` with a stubbed API transformer and stubbed Prisma; three cases (non-admin/no-draft, admin/no-draft, non-admin/with-draft).
expecting: Non-admin + no draft must produce zero outbound messages per the UI contract. Any `sendMessage` proves the defect.
next_action: none — root cause confirmed; diagnose-only mode, no fix applied.

reasoning_checkpoint:
  hypothesis: "The COMMAND denial is emitted for every non-admin message that reaches the bot, because authorization is evaluated at the top of the two update routes, unconditionally, instead of after the route establishes that the update is answering a live setup/settings prompt."
  confirming_evidence:
    - "Direct observation: reproduction run emitted sendMessage with the exact COMMAND_DENIAL text for a non-admin ordinary text message with no draft."
    - "Control observation: the identical message from an administrator emitted zero API calls, isolating the authorize gate as the sole cause of the asymmetry."
    - "Code reading: handlers.ts:230-233 replies and returns before handlers.ts:234-235 ever looks up a draft."
    - "handleSetupText (setup-handlers.ts:375) already returns silently when no draft is active — the correct no-op exists but is unreachable for non-admins."
  falsification_test: "If an ordinary non-admin text message with no draft produced no outbound message, the hypothesis would be dead. It produced the denial."
  fix_rationale: "N/A — diagnose-only. Direction recorded under Resolution.fix_direction."
  blind_spots:
    - "The callback branch of AC-4 remains unverified in the live run (no live button existed at the moment of demotion); this investigation did not exercise it."
    - "The expired-draft sub-case (draft row exists but has lapsed) is a genuine design decision the fixer must settle; not resolved here."
  candidate_causes:
    - "code: inverted check ordering at handlers.ts:230 and handlers.ts:204 — authorize() runs before route-ownership is known"
    - "environment/protocol: Telegram privacy mode ON still delivers replies to the bot's own messages, and both wizards constantly ask users to reply to bot prompts, so ordinary non-admin messages reach the bot routinely"
    - "data: the actor has no draft row (requireActive -> missing, findSettingsDraft -> null) — precisely the state the two routes never distinguish"
    - "spec/test: the e2e route-composition test pins the defective behaviour as contract (chat-readiness.e2e.test.ts:371,381-386)"
  and_gate: "yes for the observable symptom, no for the defect. The symptom needs code-defect AND message-delivery AND no-draft simultaneously. But only the code defect is removable: privacy-mode reply delivery is required platform behaviour the product depends on, and no-draft is the normal steady state. Root cause is therefore the single code defect, with the other two as necessary preconditions and the test as the reason it shipped."

## Symptoms
<!-- prefilled from UAT F-7 / broken window 5 — IMMUTABLE -->

expected: The administrator denial "Only current chat administrators can change chat setup, roster, or planning access." is sent only when a non-administrator attempts a protected action (a setup/settings/roster command or a protected callback). An ordinary chat message from a non-administrator gets no reply at all.
actual: The bot replies with that denial text to an ordinary non-admin message. In a live group it fires on every such message. Side effect — the live-demotion test became non-probative: the same refusal appears with or without demotion, so it proves nothing about authorization being re-checked.
errors: None — the wrong branch is taken silently.
reproduction: Test 14 in .planning/phases/01-chat-readiness/01-UAT.md; runbook step 5a-5d.
started: Discovered during the live Telegram group verification run on 2026-08-24.

## Eliminated
<!-- APPEND only -->

- hypothesis: "The four command routes (/setup, /settings, /roster, /roster_add) are also mis-ordered and part of the defect."
  evidence: "handlers.ts:165-199 — each command route is itself a protected action by definition, so authorize-then-deny at the top is correct there. The UI-SPEC 'Permission denial' row explicitly covers 'protected command'. These branches are correct and must not be changed."
  timestamp: 2026-08-24

- hypothesis: "The denial text is being emitted from a downstream handler (setup-handlers/settings-handlers) rather than from the router."
  evidence: "grep for COMMAND_DENIAL shows it is only defined at setup-handlers.ts:33-34 and only sent from handlers.ts (lines 168, 177, 186, 195, 205, 231, 278, 287). No downstream handler sends it."
  timestamp: 2026-08-24

- hypothesis: "registerRosterHandlers (handlers.ts:258-299) contributes to the symptom."
  evidence: "It registers only two commands and the callback boundary — no message:text or message:location route. It is a test-only composition and cannot emit a denial for an ordinary message."
  timestamp: 2026-08-24

## Evidence
<!-- APPEND only -->

- timestamp: 2026-08-24 (phase 0)
  checked: .planning/debug/knowledge-base.md
  found: No knowledge base exists yet (debug directory was absent).
  implication: No prior-pattern shortcut; investigate from first principles.

- timestamp: 2026-08-24 (phase 1)
  checked: .planning/phases/01-chat-readiness/01-UI-SPEC.md line 100 (Interaction Contract, "Permission denial" row) and lines 142-143 (Copywriting Contract)
  found: "Permission denial | Protected command or callback after current-role check fails | Callback: private alert only, `Only current chat administrators can do that.` Command: concise group reply, `Only current chat administrators can change chat setup, roster, or planning access.` Delete the actor's setup/settings draft before showing the denial."
  implication: The denial is contractually gated on "protected command or callback"; the draft deletion MUST precede the denial (AC-4). Any correct fix must preserve delete-before-deny ordering while narrowing the trigger condition.

- timestamp: 2026-08-24 (phase 1)
  checked: src/telegram/handlers.ts:224-248 (bot.on("message:text"))
  found: |
    227  if (ctx.message.text.startsWith("/")) return;      <- commands escape here
    228  const context = actionContext(ctx.chat?.id, ctx.from?.id);
    229  if (context === undefined) return;
    230  if (!(await authorize(services, context))) {        <- DEFECT: unconditional gate
    231    await ctx.reply(COMMAND_DENIAL);                   <- denial sent here
    232    return;
    233  }
    234  const now = services.now();
    235  const draft = await findSettingsDraft(...);          <- route ownership decided ONLY here
    247  await handleSetupText(...);
  implication: Authorization is evaluated before the route knows whether this update is a protected-action attempt. Every non-command text message from a non-admin is refused at line 231 and never reaches lines 234-247.

- timestamp: 2026-08-24 (phase 1)
  checked: src/telegram/handlers.ts:201-222 (bot.on("message:location"))
  found: |
    203  if (context === undefined) return;
    204  if (!(await authorize(services, context))) {        <- DEFECT: same shape
    205    await ctx.reply(COMMAND_DENIAL);
    206    return;
    207  }
    209  const draft = await findSettingsDraft(...);          <- route ownership decided ONLY here
    221  await handleSetupLocation(...);
  implication: Structurally identical defect. Confirms the runbook's "check ordering in two handlers.ts branches" attribution — the two branches are message:text and message:location, not the command routes.

- timestamp: 2026-08-24 (phase 1)
  checked: src/telegram/setup-handlers.ts:359-375 (handleSetupText) and src/domain/chat/setup-service.ts:147-162 (requireActive)
  found: "handleSetupText begins with requireActive; requireActive returns { kind: 'missing' } at line 156 when no draft row exists; handleSetupText then returns silently at line 375 (`if (active.kind !== \"active\") return;`)."
  implication: The correct behaviour for an ordinary message — total silence — ALREADY EXISTS one call deeper. It is simply unreachable for a non-administrator because line 230/204 short-circuits first. This is why an admin's ordinary message is silent and a non-admin's is refused.

- timestamp: 2026-08-24 (phase 2/3, direct reproduction)
  checked: "Ran registerChatReadinessHandlers against a real grammY Bot with a stubbed API transformer, a stubbed Prisma, membership gateway returning administrator for ADMIN_ID and member for everyone else, and setup.requireActive returning { kind: 'missing' }."
  found: |
    CASE 1 non-admin, ordinary text "see you at practice", NO draft:
      sent      = [{ method: "sendMessage",
                     text: "Only current chat administrators can change chat setup, roster, or planning access." }]
      deletions = ["setupDraft.deleteMany", "settingsEditDraft.deleteMany"]
      -> BUG REPRODUCED. Contract requires zero outbound messages.
    CASE 2 administrator, identical text, NO draft:
      sent = []
      -> CONTROL PASSES. Silence, as the contract requires.
    CASE 3 non-admin, WITH an active draft, text "19:30":
      deletions = ["setupDraft.deleteMany", "settingsEditDraft.deleteMany"] BEFORE the denial
      sent.at(-1).text = COMMAND_DENIAL
      -> AC-4 ordering confirmed.
  implication: |
    Three things are established by direct observation, not inference.
    (a) The defect is real and deterministic — a Bohrbug, no timing or environment dependence.
    (b) The admin/non-admin asymmetry on an identical input isolates the authorize() gate as the
        sole cause; nothing downstream differs.
    (c) Draft deletion is a side effect INSIDE requireCurrentAdministrator and therefore always
        precedes the denial. AC-4 is structurally safe as long as the fix keeps routing the
        protected case through requireCurrentAdministrator.

- timestamp: 2026-08-24 (phase 3)
  checked: src/domain/auth/authorization-service.ts:30-54 (requireCurrentAdministrator)
  found: |
    41  if (role === "creator" || role === "administrator") return;   <- admin exits early
    45  await this.prisma.setupDraft.deleteMany({ chatId, actorUserId });        <- AC-4 deletion
    48  if (this.prisma.settingsEditDraft !== undefined) {
    49    await this.prisma.settingsEditDraft.deleteMany({ chatId, actorUserId });<- AC-4 deletion
    53  throw new PermissionDeniedError();                             <- only now does it throw
    and handlers.ts:136-150 (authorize) converts that throw into `false`, after which the caller replies.
  implication: |
    CRITICAL FOR THE FIX. Draft deletion lives at authorization-service.ts:45-52, strictly before the
    throw at :53, which is strictly before the reply at handlers.ts:231 / :205. AC-4 ("demotion resets
    the actor's draft, before the denial is shown") is therefore satisfied by CONSTRUCTION and does not
    depend on ordering inside handlers.ts. The fix must NOT reimplement the denial by hand-rolling a
    role check that bypasses requireCurrentAdministrator, and must NOT move the deletion out of the
    authorization service.

- timestamp: 2026-08-24 (phase 3)
  checked: "Same reproduction run, CASE 1 deletions array"
  found: "setupDraft.deleteMany and settingsEditDraft.deleteMany both execute even when the actor has no draft at all, plus one getCurrentRole (getChatMember) call."
  implication: "Secondary cost: every ordinary non-admin message currently costs one Telegram getChatMember API call and two no-op DELETE round-trips, on top of the spurious reply. Narrowing the gate removes all three."

- timestamp: 2026-08-24 (phase 3, environmental precondition)
  checked: .planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md lines 13 and 54
  found: |
    Line 13: privacy mode was deliberately left ON.
    Line 54: with privacy mode ON the bot receives only commands, service messages, and REPLIES TO ITS
    OWN MESSAGES — the runbook author had to send the setup location as a reply to the bot's prompt,
    "otherwise the update simply never reaches it".
  implication: |
    Resolves the apparent puzzle in "to every single one". The bot is not seeing all group traffic;
    it sees replies to its own prompts. Both wizards constantly ask the user to reply with a value,
    so a non-admin replying to any bot prompt hits message:text every time. Delivery is a necessary
    precondition of the symptom but is correct, required platform behaviour — not the defect.

- timestamp: 2026-08-24 (phase 3, why it was not caught)
  checked: tests/integration/chat-readiness.e2e.test.ts:313-387 ("registers every Phase 1 route once and gates each protected route on the current administrator")
  found: |
    371  ["update:message:text", messageUpdate(1_006, chatId, MEMBER_ID, "19:30")],
    381  expect(harness.events[0], `${id} must authorize first`).toBe("membership");
    384  expect(harness.last()?.payload.text, `${id} must deny`).toBe(COMMAND_DENIAL);
    329  expect(CHAT_READINESS_ROUTES.every((route) => route.protectedRoute)).toBe(true);
    The two denial cases in tests/integration/walking-skeleton.test.ts:151-183 both use /setup, a genuine
    protected command, so they do not cover this either.
  implication: |
    The existing gate CERTIFIED the defect instead of catching it. The test only ever sends "19:30" —
    a plausible wizard answer — and never an ordinary sentence, so it cannot distinguish "authorize
    before a protected action" from "authorize before any message". The fix must revise assertions
    :381 and :384 for the two update routes and add the missing ordinary-message case.

- timestamp: 2026-08-24 (phase 3, model-level cause)
  checked: src/telegram/handlers.ts:101-107 and :94-100 (CHAT_READINESS_ROUTES entries)
  found: "update:message:text and update:message:location are declared surface: 'setup', protectedRoute: true — identically to the four command routes."
  implication: |
    The route model conflates "route that can CARRY a protected action" with "every update on this
    route IS a protected action". Commands are inherently protected; a text/location message is
    protected only when it answers a live prompt. The flat protectedRoute: true flag is what made
    the top-of-handler gate look correct to both the implementer and the test.

## Resolution

root_cause: |
  src/telegram/handlers.ts evaluates the administrator gate before the route establishes that the
  update is a protected-action attempt, in exactly two branches:
    - bot.on("message:text")     — handlers.ts:230-233, before the draft lookup at :234-235
    - bot.on("message:location") — handlers.ts:204-207, before the draft lookup at :209
  Because authorize() fails for any non-administrator, every non-command message that reaches the bot
  from a non-admin is answered with COMMAND_DENIAL at :231 / :205 and never reaches the draft lookup.
  The correct no-op already exists one level deeper (setup-handlers.ts:375, reached via
  setup-service.ts:156 { kind: "missing" }) but is unreachable for non-admins — which is why the same
  message is silent for an administrator and refused for everyone else.
  Underlying model error: CHAT_READINESS_ROUTES (handlers.ts:101-107, :94-100) marks the two update
  routes protectedRoute: true exactly like the command routes, conflating "route that can carry a
  protected action" with "every update on this route is a protected action".

ac4_constraint: |
  Draft deletion is NOT in handlers.ts. It is a side effect inside
  AuthorizationService.requireCurrentAdministrator — setupDraft.deleteMany at
  authorization-service.ts:45-47 and settingsEditDraft.deleteMany at :48-52 — both strictly before
  `throw new PermissionDeniedError()` at :53. handlers.ts:136-150 turns that throw into `false`, and
  only then does the caller reply at :231 / :205.
  Ordering per branch, verified by reproduction CASE 3:
    message:text     -> authorize (deletes drafts) -> reply COMMAND_DENIAL at :231   [delete BEFORE deny]
    message:location -> authorize (deletes drafts) -> reply COMMAND_DENIAL at :205   [delete BEFORE deny]
    commands         -> authorize (deletes drafts) -> reply COMMAND_DENIAL at :168/:177/:186/:195
  AC-4 therefore holds by construction and survives any reordering that keeps the protected case
  flowing through requireCurrentAdministrator. It breaks only if a fix hand-rolls a role check that
  bypasses that method, or moves deletion out of it.

fix_direction: |
  Invert the order in the two update branches only: establish route ownership first, authorize second.
    1. Probe read-only for an in-flight action for THIS actor in THIS chat — an active settings edit
       draft (settings-handlers.ts:196-210) or a setup draft row.
    2. No in-flight action -> return silently. No reply, no getChatMember call, no deleteMany.
    3. In-flight action -> call authorize() as today. Non-admin: drafts are deleted inside
       requireCurrentAdministrator, then COMMAND_DENIAL is replied. AC-4 preserved unchanged.
  Leave the four command branches (:165-199) exactly as they are — a command IS a protected action.
  Three decisions the fixer must make explicitly:
    a. Expired draft: setup-service.ts requireActive DELETES an expired row at :158 before returning
       { kind: "expired" }. Use a read-only existence probe for the gate decision so no mutation
       precedes authorization; then decide whether an expired draft counts as a protected attempt
       (deny) or as an ordinary message (silence, losing the DRAFT_EXPIRED copy).
    b. The probe is a findUnique keyed on the actor's own (chatId, actorUserId) — it reads no other
       user's data and mutates nothing, so running it before authorization is safe. Say so in the fix.
    c. Update the tests that currently pin the defect: chat-readiness.e2e.test.ts:381 and :384 for the
       two update routes, and the protectedRoute invariant at :329 if the route model is changed.
       Add the missing regression case — an ordinary non-admin sentence with no draft must produce
       zero outbound messages — plus its administrator control.

fix: "[not applied — goal: find_root_cause_only]"
verification: "[not applied — goal: find_root_cause_only]"
files_changed: []
