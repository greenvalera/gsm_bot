---
status: diagnosed
trigger: "callback-alerts-never-shown — No private callback alert is ever shown to the user, so four verbatim contract texts are unreachable. Finding F-3, broken window id 4."
created: 2026-08-24T00:00:00Z
updated: 2026-08-24T00:00:00Z
---

## Current Focus

bug_class: Bohrbug — fully deterministic. Reproduces on 100% of callbacks, in every
  environment, for every route. No timing, no data, no config dependency.

hypothesis: >
  The unconditional bare `await ctx.answerCallbackQuery()` at
  src/telegram/callbacks.ts:111 consumes the single answer Telegram permits per
  `callback_query.id`. Every alert-bearing `answerCallbackQuery({ text, show_alert })`
  in the codebase is strictly downstream of it and is therefore always a *second*
  answer, which Telegram accepts with `ok: true` and silently discards. Nothing
  throws, so bot.catch stays quiet and the failure is invisible.

status: CONFIRMED — see Evidence 1-8. Diagnose-only mode; no fix applied.

candidate_causes:
  - "code (defect): callbacks.ts:111 pre-answers every callback query with no text, burning the one answer slot"
  - "code (design contract): the recorded phase decision 'protected callbacks acknowledge before a live role lookup' was implemented as a *separate* bare answerCallbackQuery rather than as a single deferred answer that carries text when needed"
  - "test/process (escape cause): the e2e harness transport returns {ok:true, result:true} for every answerCallbackQuery, so it does not model Telegram's one-answer-per-query rule; assertions read the LAST call and thereby encode the bug as correct behaviour"
  - "environment: RULED OUT — deterministic, identical in every environment"
  - "data: RULED OUT — the 0-valid/17-expired token state only selects the stale branch; it is not a cause"

and_gate: >
  NO for the defect. The single condition at callbacks.ts:111 is sufficient on its own:
  given the pre-answer, no later alert can surface on any route regardless of any other
  condition. So root_cause is single-cause.
  YES for the escape. The bug shipped because two conditions held together: the defect
  AND an unfaithful test double that cannot represent the Telegram rule. Those are
  reported separately rather than conflated.

next_action: none — root cause confirmed, returning diagnosis to caller

## Symptoms

expected: Tapping a button on an outdated bot message shows a private Telegram alert with one of the verbatim contract texts, e.g. "This setup action is no longer available. Send /setup to start again.", "This action is no longer available. Open /settings or /roster and try again.", "Only current chat administrators can do that.", or "Already applied."
actual: Tapping the expired "Start setup" button produced no reaction whatsoever. The database showed 0 valid and 17 expired START_SETUP tokens, so this was a clean hit on the stale-action branch. No private alert appeared. The failure is silent — bot.catch stays quiet because nothing throws.
errors: None reported — that is itself part of the symptom.
reproduction: Test 17 in .planning/phases/01-chat-readiness/01-UAT.md; runbook step 6c.
started: Discovered during the live Telegram group verification run on 2026-08-24.

## Eliminated

- hypothesis: "grammY merges or dedupes repeated ctx.answerCallbackQuery calls, so the second call replaces the first"
  evidence: "Empirical probe against grammy@1.45.1: two distinct HTTP requests are issued for the same callback_query_id — #1 {callback_query_id} bare, #2 {callback_query_id, text, show_alert}. grammy/out/context.js:2005-2006 and grammy/out/core/api.js:1345-1346 are thin pass-throughs with no once-per-query guard."
  timestamp: 2026-08-24

- hypothesis: "The alert text exceeds the answerCallbackQuery 200-character limit and Telegram rejects it"
  evidence: "All four texts measured: SETUP_STALE_TEXT 69, GENERIC_STALE_TEXT 76, CALLBACK_DENIAL 45, ALREADY_APPLIED 16. All far under 200."
  timestamp: 2026-08-24

- hypothesis: "An exception is thrown before the alert call is reached, and the error is swallowed"
  evidence: "Two independent refutations. (a) A repeat answerCallbackQuery returns ok:true — Telegram ignores it rather than erroring, so there is nothing to throw. (b) src/app/main.ts:50-59 installs bot.catch with a logger.error; a throw on the update path would have produced 'Unhandled Telegram update error'. The live run reported quiet logs. The alert call at callbacks.ts:147 IS reached; its effect is discarded."
  timestamp: 2026-08-24

- hypothesis: "Environment- or data-specific cause (works elsewhere, or only with this token state)"
  evidence: "The pre-answer at callbacks.ts:111 is unconditional and route-independent — it executes before the chat/actor context is even resolved (line 113). Every callback on every surface in every environment burns its answer slot identically."
  timestamp: 2026-08-24

## Evidence

- timestamp: 2026-08-24
  checked: "All answerCallbackQuery / show_alert call sites across src/ and tests/"
  found: "24 alert-bearing call sites in src (callbacks.ts:103, 123, 147; setup-handlers.ts:448, 467, 476, 484, 500, 511, 529, 540, 551, 587, 605; settings-handlers.ts:361, 366, 386, 410, 424, 445, 449; roster-handlers.ts:279, 315, 347) and exactly one bare, argument-less call: src/telegram/callbacks.ts:111."
  implication: "The alert texts ARE wired to a surface. The defect is ordering, not a missing implementation."

- timestamp: 2026-08-24
  checked: "src/telegram/callbacks.ts:109-155 — the whole callback boundary"
  found: "Line 111 `await ctx.answerCallbackQuery();` runs unconditionally, before the chat/actor context is resolved (113), before authorization (117), before token parse (130), before the action row load (133), before route resolution (138) and before the expiry check (142). The comment on line 110 states the intent: 'Acknowledged before any parse, role lookup, or durable read.'"
  implication: "Every subsequent answerCallbackQuery on every route is a second answer for the same query id."

- timestamp: 2026-08-24
  checked: "Registration topology — grep for callback_query registrations and dispatcher call sites"
  found: "Exactly one `bot.on(\"callback_query:data\", ...)` exists, at callbacks.ts:109. All three dispatchers (dispatchSetupCallback, dispatchSettingsCallback, dispatchRosterCallback) are invoked only from route.dispatch at callbacks.ts:154. createBot (src/app/create-bot.ts:48) composes the bot solely through registerChatReadinessHandlers, which calls registerChatReadinessCallbacks with exhaustive: true."
  implication: "There is no callback path that bypasses line 111. All 24 alert sites are strictly downstream of it — the failure is total, not partial."

- timestamp: 2026-08-24
  checked: "Telegram Bot API semantics for answering the same callback query twice (web research)"
  found: "A callback query may be answered only once. Once answered, subsequent answers for the same query id are silently ignored by Telegram; text and show_alert supplied on a later call are dropped. No error is returned."
  implication: "The first, text-less answer at line 111 is the only one the client ever sees — it merely dismisses the loading spinner, producing exactly the reported 'no reaction whatsoever'."

- timestamp: 2026-08-24
  checked: "grammy@1.45.1 internals — out/context.js:2005-2006, out/core/api.js:1345-1346 — plus a live probe replicating the callbacks.ts ordering"
  found: "ctx.answerCallbackQuery is a thin alias that forwards to raw.answerCallbackQuery with the callback query id spread in. The probe recorded: calls issued: 2 — #1 {\"callback_query_id\":\"CBQ-ID-42\"}, #2 {\"callback_query_id\":\"CBQ-ID-42\",\"text\":\"STALE\",\"show_alert\":true}."
  implication: "Direct observation: the framework issues two independent answers for one query id and does not merge them. The bare one wins."

- timestamp: 2026-08-24
  checked: "Live path trace for the reported scenario — expired START_SETUP tap, 0 valid / 17 expired tokens"
  found: "111 bare ack (spinner dismissed, no text) -> 117 requireCurrentAdministrator passes (actor is admin) -> 130 token parses -> 133 action row found -> 138 START_SETUP route resolved -> 142-146 `action.expiresAt <= now` is true -> 147 answerCallbackQuery({text: SETUP_STALE_TEXT, show_alert: true}) -> discarded by Telegram -> 151 return."
  implication: "Reproduces the observed symptom exactly, including its total silence. Note the boundary returns at 151, so setup-handlers' `ctx.reply(DRAFT_EXPIRED)` group message is never reached either — hence not even a chat message appeared."

- timestamp: 2026-08-24
  checked: "tests/integration/chat-readiness.e2e.test.ts:99-121 (harness api transport) and :427-455 (boundary assertions)"
  found: "The transport stub returns `{ ok: true, result: true }` for every method including a repeated answerCallbackQuery. The test asserts `harness.events.slice(0, 2)` equals ['answerCallbackQuery','membership'] — i.e. it asserts the pre-answer as required behaviour — then reads `harness.last()?.payload` and matches {text: GENERIC_STALE, show_alert: true} on the second, discarded call."
  implication: "The test suite actively encodes the bug as correct. It asserts on the LAST answerCallbackQuery, whereas Telegram honours the FIRST. This is the escape cause: no gate could have caught it because the double is unfaithful to the one-answer rule."

- timestamp: 2026-08-24
  checked: "Character length of all four contract alert texts against the 200-char answerCallbackQuery limit"
  found: "69, 76, 45, 16 characters respectively."
  implication: "Length is not a factor; eliminates the truncation/rejection hypothesis."

## Resolution

root_cause: >
  src/telegram/callbacks.ts:111 answers every callback query unconditionally with an
  empty `ctx.answerCallbackQuery()` before any parse, role lookup, or durable read.
  Telegram honours only the first answer per callback_query.id and silently ignores
  every later one, so all 24 alert-bearing answerCallbackQuery calls — which are all
  strictly downstream of line 111 — are discarded. The first answer carries no text,
  which is why the tap dismisses the spinner and shows nothing at all.

  Escape cause (why it shipped): the e2e harness transport at
  tests/integration/chat-readiness.e2e.test.ts:99-121 returns ok:true for a repeated
  answer, and the boundary assertions at :441-455 read the LAST answerCallbackQuery.
  The test double cannot represent Telegram's one-answer rule, so the suite asserts
  the defective ordering as correct.

fix: "" # diagnose-only mode — no fix applied

verification: "" # diagnose-only mode

files_changed: []

affected_contract_texts:
  - text: "This setup action is no longer available. Send /setup to start again."
    defined: "src/telegram/callbacks.ts:31-32 (SETUP_STALE_TEXT); duplicated as CALLBACK_STALE at src/telegram/setup-handlers.ts:35-36"
    wired_at: "callbacks.ts:148 via route.staleText; setup-handlers.ts:452, 467, 476, 484, 502, 511, 531, 540, 605"
    reachable: false
  - text: "This action is no longer available. Open /settings or /roster and try again."
    defined: "src/telegram/callbacks.ts:33-34 (GENERIC_STALE_TEXT); duplicated as CALLBACK_STALE at settings-handlers.ts:46-47 and roster-handlers.ts:44-45"
    wired_at: "callbacks.ts:104 (unresolved) and 148; settings-handlers.ts:366, 424, 449; roster-handlers.ts:279, 348"
    reachable: false
  - text: "Only current chat administrators can do that."
    defined: "src/telegram/callbacks.ts:30 (CALLBACK_DENIAL)"
    wired_at: "callbacks.ts:124"
    reachable: false
  - text: "Already applied."
    defined: "src/telegram/setup-handlers.ts:45; settings-handlers.ts:54; roster-handlers.ts:46"
    wired_at: "setup-handlers.ts:452, 551; settings-handlers.ts:361, 445; roster-handlers.ts:348"
    reachable: false

fix_direction: >
  Stop pre-answering with an empty payload. The one answer per query must be the one
  that carries the outcome. Two viable shapes:
  (a) Defer the answer — remove line 111 and make every terminal branch answer exactly
      once, bare on success and with {text, show_alert} on denial/stale/duplicate. This
      preserves the letter of the recorded decision only if the role lookup stays before
      any durable read, but it does move the acknowledgement after the role lookup, so
      the phase decision "protected callbacks acknowledge before a live role lookup"
      must be revisited and re-recorded.
  (b) Keep the early acknowledgement but make it carry the text — introduce a
      single-shot answer helper bound to the query id that collapses to one API call,
      and have the pre-ack only fire if no branch has answered by the end of the turn.
  Either way the e2e harness must be hardened first: the transport double should reject
  or flag a second answerCallbackQuery for the same callback_query_id, and assertions
  should read the FIRST answer, not the last. Without that, the regression test cannot
  fail for the right reason.
