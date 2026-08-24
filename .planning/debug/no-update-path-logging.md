---
status: diagnosed
trigger: "no-update-path-logging — There is no logging at all on the Telegram update path, so the live verification of 'no raw coordinates in logs' passed only vacuously and silent failures are undetectable. Finding F-4, broken window id 12, filed as unrun-verify rather than a deviation."
created: 2026-08-24T00:00:00Z
updated: 2026-08-24T15:05:00Z
---

## Current Focus

hypothesis: CONFIRMED (AND-gate, three simultaneous contributing causes — see Resolution.root_cause)
test: complete
expecting: n/a
next_action: hand off to planner; goal is find_root_cause_only, no fix applied

bug_class: Bohrbug — fully deterministic, reproduced on demand from a static
  code property. Not a Heisenbug: SBFL was skipped deliberately (Phase 1.25) because
  the defect is an *absence* of code, which no coverage spectrum can rank.

reasoning_checkpoint:
  hypothesis: "No Telegram update can produce a log line, because the redacting logger is never injected into any of the three Telegram-layer dependency containers; the single wired update-path seam (bot.catch) is neutralised by 12 bare `catch {}` blocks; and UAT test 6 asserted an existential premise that no plan requirement ever committed to."
  confirming_evidence:
    - "Direct observation: grep for `logger` across src/telegram, src/domain, src/infrastructure, src/shared/callback-schema.ts, src/app/create-bot.ts, src/app/config.ts returns exit 1 (zero hits)."
    - "Direct observation: grep for console./process.stdout/process.stderr across all of src/ returns zero hits. Pino inside logger.ts is the only writer in the process."
    - "Direct execution: driving the exact F-3 update (expired START_SETUP token) through the real registerCallbackBoundary captured 0 bytes on stdout+stderr while making 2 answerCallbackQuery calls."
    - "Direct execution: the real createLogger keeps all 27 allow-listed fields and redacts all 12 non-allow-listed ones, including latitude/longitude."
  falsification_test: "Find any code path reachable from a Telegram update that writes a byte to stdout/stderr. Executed twice (static grep + runtime stdio capture); both returned empty."
  fix_rationale: "n/a — diagnose-only mode, no fix applied."
  blind_spots:
    - "Runtime stdio capture covered the callback boundary only; the command and message:location/message:text routes were verified statically (no logger in scope) rather than by execution."
    - "Pino's own internal warnings (e.g. transport errors) were not exercised; they are not update-path logs."
  candidate_causes:
    - "code: no logger member on BotDependencies / ChatReadinessServices / CallbackBoundaryDependencies, so no handler can log even if it wanted to"
    - "code: 12 bare `catch {}` blocks discard the error binding, neutralising the one live seam (bot.catch)"
    - "process/requirements: 01-14-PLAN scoped its key_link as main.ts -> logger.ts only; UAT test 6 asserted a stronger premise the plan never required"
    - "config: LOG_LEVEL default 'info' — ELIMINATED, see Eliminated"
  and_gate: "YES. All three contributing causes are required simultaneously. Remove (1) and handlers could log. Remove (2) and the existing bot.catch seam would have fired on the swallowed failures. Remove (3) and the vacuous grep would have been caught at verification time before shipping. No single one of the three produces finding F-4 on its own."

## Symptoms

expected: The update path emits structured logs through the redacting logger, so that grepping the bot logs for coordinates is a meaningful check and silent handler failures leave a trace.
actual: All six logger calls live in src/app/main.ts and cover process lifecycle only. Nothing on the update path logs anything. The coordinate grep returned empty at both info and debug level — but vacuously, because coordinates never had any route into the logs. A genuinely silent defect (F-3, no callback alert ever shown) produced no log evidence whatsoever during the live run.
errors: None — absence of output is the symptom.
reproduction: Test 6 in .planning/phases/01-chat-readiness/01-UAT.md; runbook step 2e.
started: Discovered during the live Telegram group verification run on 2026-08-24.

## Eliminated

- hypothesis: "The redactor is over-aggressive and silently swallows update-path log lines that are being emitted."
  evidence: "tests/unit/logger.test.ts passes 6/6 in this worktree; a direct probe against the real createLogger emitted every one of the 27 allow-listed fields intact. The redactor emits correctly whenever it is called — it is simply never called from the update path."
  timestamp: phase-3

- hypothesis: "LOG_LEVEL default of 'info' suppresses update-path lines that are emitted at debug level."
  evidence: "src/app/config.ts:27 defaults LOG_LEVEL to 'info', but this is irrelevant: there are zero logger call sites outside src/app/main.ts, so no level setting can reveal anything. The live run also grepped at debug level and still got nothing."
  timestamp: phase-3

- hypothesis: "bot.catch is registered too late (main.ts:50, after createBot at 42) or is bypassed by @grammyjs/runner, so update errors are lost."
  evidence: "@grammyjs/runner run() wires the sink error handler to `bot.errorHandler(error)` (runner.js:41-48), and bot.catch merely assigns that property (grammy bot.js:382-383). The closure reads the property at call time, so ordering is immaterial. The seam IS live — it just never fires, because the handlers swallow every throw."
  timestamp: phase-3

## Evidence

- timestamp: phase-0
  checked: .planning/debug/knowledge-base.md
  found: File does not exist — no prior resolved sessions
  implication: No known-pattern shortcut; investigate from scratch

- timestamp: phase-1
  checked: "grep -rn 'logger|createLogger|pino|Logger' src/ --include=*.ts"
  found: "Exactly two files match. src/app/main.ts (import at :10, construction at :28, six call sites) and src/shared/logger.ts (the implementation). Zero matches in src/telegram/, src/domain/, src/infrastructure/, src/app/create-bot.ts, src/app/config.ts, src/shared/callback-schema.ts — that grep exits 1."
  implication: The user's count of six is exact. The logger is structurally confined to the composition root.

- timestamp: phase-1
  checked: "grep -rn 'console\\.|process\\.stdout|process\\.stderr' src/ --include=*.ts"
  found: Zero hits across all 13 source files.
  implication: Pino inside logger.ts is the ONLY writer to the process streams. If the logger is not called, the process is byte-for-byte silent. The coordinate grep could not have found anything under any circumstances.

- timestamp: phase-1
  checked: "The six call sites in src/app/main.ts"
  found: ":51 bot.catch error, :69 info(signal) on shutdown, :75 info shutdown complete, :79 error shutdown failed, :86 info runner started, :93 error startup failed."
  implication: "The symptom statement is very slightly imprecise in a way that MATTERS to the planner: five of six are lifecycle, but :51 (bot.catch) IS an update-path seam, and it already logs updateId + chatId under correct allow-listed key names. The update path is not un-instrumented by oversight of the seam — the seam exists and is starved."

- timestamp: phase-1
  checked: "@grammyjs/runner wiring of bot.catch"
  found: "runner.js:39-48 — consumer.consume = (update) => bot.handleUpdate(update); createConcurrentSink(consumer, async (error) => { await bot.errorHandler(error) }). grammy bot.js:236-244 — handleUpdate wraps middleware and THROWS BotError; it does not call errorHandler itself. grammy bot.js:382-383 — catch(errorHandler) { this.errorHandler = errorHandler }."
  implication: bot.catch at main.ts:50 is genuinely reachable under run(bot). The seam is live, not dead. Confirms the third eliminated hypothesis.

- timestamp: phase-1.5
  checked: "common-bug-patterns.md — Error Handling category, 'Swallowed error: empty catch {} or logs but does not rethrow/handle'"
  found: "Textbook match, 12 instances: setup-handlers.ts:314,385,418; settings-handlers.ts:235,257,308,400; roster-handlers.ts:139,210,233,260,291. All are bare `} catch {` — they do not even bind the error, so there is no error object in scope to log."
  implication: "This is why the live bot.catch seam never fires. Two of them (roster-handlers.ts:260 and :291) are total black holes whose own comment says 'Telegram delivery itself failed; there is no further recovery to attempt' — a delivery failure is exactly the class of defect an operator needs a log line for."

- timestamp: phase-3
  checked: "Executed probe: real createLogger with 39 candidate fields, destination sink, level=debug"
  found: "SURVIVES (27): chatId, actorId, targetId, updateId, messageId, actionId, draftId, membershipId, roundId, jobId, actionKind, callbackKind, route, command, field, event, outcome, reason, status, signal, revision, expectedRevision, attempt, count, page, pageCount, durationMs. REDACTED (12): latitude, longitude, callbackData, token, update, from, text, timezone, userId, username, firstName, location."
  implication: "The allow-list is a working instrument, not a broken one. Crucially `timezone` is NOT allow-listed — a planner who logs the resolved IANA zone gets [redacted]."

- timestamp: phase-3
  checked: "Executed probe: allowed key carrying an object, and error shape"
  found: "{chatId: {id: -100123}} emits chatId: '[redacted]' — an allow-listed key with a non-scalar value is redacted, not walked (logger.ts:89-109). bigint values are stringified: chatId came out as the string '-1001234567890'. {err: new Error('connect failed postgresql://user:pw@db:5432/app')} emits err:{type:'Object', message:'connect failed [redacted]', stack:'', name:'Error'} — the connection string is scrubbed by SENSITIVE_PATTERNS and the stack is dropped."
  implication: "Concrete constraints for the planner: pass identifiers as bigint/number/string never as objects; error context must be bound in the catch to be loggable at all; stacks are unavailable by design."

- timestamp: phase-3
  checked: "Executed probe: the exact F-3 scenario (expired START_SETUP row) driven through the real registerCallbackBoundary with process.stdout/stderr captured"
  found: "STDIO BYTES: 0. API CALLS: [answerCallbackQuery{callback_query_id}, answerCallbackQuery{callback_query_id, text:'stale', show_alert:true}] — TWO answers on the same callback_query_id, and zero bytes of log output."
  implication: "Decisive on both counts. (a) F-4 confirmed by execution, not inference: the callback boundary is byte-for-byte silent. (b) It simultaneously exhibits F-3's mechanism — callbacks.ts:111 answers the query bare, then callbacks.ts:147-150 tries to answer the SAME already-answered query with the alert, which Telegram ignores. F-4 is precisely why F-3 could not be diagnosed from the live run."

- timestamp: phase-3
  checked: "Dependency containers on the update path"
  found: "BotDependencies (create-bot.ts:22-29): botToken, botInfo, prisma, now, membershipGateway, timezoneResolver — no logger. ChatReadinessServices (handlers.ts:40-48): prisma, authorization, setup, settings, roster, timezoneResolver, now — no logger. CallbackBoundaryDependencies (callbacks.ts:71-75): prisma, authorization, now — no logger. main.ts:42-47 calls createBot({botToken, prisma, now, membershipGateway}) while `logger` is in scope from line 28 and is simply not passed."
  implication: "This is the structural root. No handler CAN log without a signature change to three interfaces plus the createBot call site. The omission is one missing argument at main.ts:42-47."

- timestamp: phase-3
  checked: ".planning/phases/01-chat-readiness/01-14-PLAN.md requirement scope"
  found: "must_haves.truths[3] is a property of the logger alone ('Structured logs redact ... while retaining bounded diagnostic identifiers'). key_links[0] is scoped from src/app/main.ts to src/shared/logger.ts only. Task 1 acceptance_criteria[0] is a unit test that 'injects representative ... and verifies none appears in JSON'. Task 2 how-to-verify step 2 says 'Inspect runtime logs ... to confirm neither the shared coordinates nor raw location/update payload were retained'."
  implication: "The plan never required emission from the update path. Every artifact it demanded was in fact delivered. But 01-UAT.md test 6 states the expectation as 'returns nothing, BECAUSE the update path logs through the redacting logger' — asserting a premise the plan never committed to. The check is a universally-quantified claim over an empty set: vacuously true, and true no matter how broken the redactor is."

## Resolution

root_cause: |
  Three simultaneously-necessary contributing causes (AND-gate confirmed):

  (1) STRUCTURAL — the redacting logger is never injected into the Telegram layer.
      `createLogger` is constructed at src/app/main.ts:28 and is in lexical scope at
      the `createBot(...)` call on src/app/main.ts:42-47, but is not passed. None of
      the three dependency containers on the update path declares a logger member:
      BotDependencies (src/app/create-bot.ts:22-29), ChatReadinessServices
      (src/telegram/handlers.ts:40-48), CallbackBoundaryDependencies
      (src/telegram/callbacks.ts:71-75). Consequently no handler *can* log.
      Verified: grep for `logger` across src/telegram, src/domain, src/infrastructure
      exits 1, and grep for console./process.stdout/process.stderr across all of src/
      returns zero hits — pino inside logger.ts is the process's only stream writer.

  (2) NEUTRALISED SEAM — exactly one update-path seam is wired, `bot.catch` at
      src/app/main.ts:50-59, and it is confirmed reachable under @grammyjs/runner
      (runner.js:41-48 routes the sink error handler to bot.errorHandler). It never
      fires because 12 bare `} catch {` blocks convert every exception into
      user-facing copy without binding the error: src/telegram/setup-handlers.ts:314,
      385, 418; src/telegram/settings-handlers.ts:235, 257, 308, 400;
      src/telegram/roster-handlers.ts:139, 210, 233, 260, 291. Separately, the
      callback boundary's four non-throwing early exits (src/telegram/callbacks.ts:114,
      131, 136, 139) and its stale branch (147-152) leave by normal return.

  (3) VERIFICATION DESIGN — 01-14-PLAN.md scoped its logging key_link as
      `src/app/main.ts -> src/shared/logger.ts` and its acceptance criterion as a
      redactor unit test. It never required emission from the update path. 01-UAT.md
      test 6 nonetheless asserted "returns nothing, because the update path logs
      through the redacting logger" — an existential premise no plan requirement
      backed. The grep is therefore a universally-quantified claim over an empty
      set: vacuously true, and equally true if the redactor were entirely broken.

  Remove any one of the three and finding F-4 does not occur. This is why F-4 is
  correctly filed as unrun-verify rather than a deviation: the implementation
  delivered exactly what the plan specified; the acceptance test asserted more.

fix: not applied — goal was find_root_cause_only
verification: not applicable
files_changed: []
