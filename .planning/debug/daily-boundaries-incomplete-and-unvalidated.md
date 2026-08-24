---
status: diagnosed
trigger: "daily-boundaries-incomplete-and-unvalidated — F-5 (broken window 6): daily end unreachable from UI after setup; F-6 (broken window 7): no defaultStart >= dailyStart validation, incoherent schedule committed in production DB"
created: 2026-08-24T00:00:00Z
updated: 2026-08-24T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED (both). F-5 is a single-line keyboard wiring gap at src/telegram/keyboards.ts:86 — the whole DAILY_END_MINUTE backend path already exists and works; only the dashboard button is absent. F-6 is a specification omission propagated verbatim into src/domain/chat/schedule-validator.ts:42-71 — the `defaultStart >= dailyStart` rule was never written in UI-SPEC/PATTERNS/PLAN, so the implementation faithfully implements an incomplete contract.
test: (1) grep every reference to DAILY_END_MINUTE across src/ and tests/; (2) execute the verbatim `validateSchedule` body against the exact committed row recorded in the runbook.
expecting: (1) DAILY_END_MINUTE appears in prompt/parse/property/validity code but never in a keyboard → dead end is wiring-only; (2) the production row is judged `valid: true` while `defaultStart >= dailyStart` is false → missing rule proven arithmetically.
next_action: DONE — goal is find_root_cause_only; return ROOT CAUSE FOUND. Do not fix.

bug_class: Bohrbug (both) — fully deterministic, reproduces on every `/settings` render and on every `validateSchedule` call with the recorded values.

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Every configured schedule value, daily end included, stays editable from /settings after setup. An incoherent schedule — rehearsal default start earlier than the daily window start, or start plus duration exceeding the daily end — is rejected with "That schedule does not fit inside the daily time boundaries. No changes were saved." and nothing is persisted.
actual: "Edit daily boundaries" collects only the start value; the daily end can never be changed again once setup completes. Separately, no defaultStart >= dailyStart check exists — a schedule whose rehearsal starts an hour before the daily window opens was accepted and is committed in the database.
errors: None — both are missing behaviour rather than failures.
reproduction: Test 8 in .planning/phases/01-chat-readiness/01-UAT.md; runbook step 3b. During the run, editing daily boundaries to 22:00 correctly hit the dailyStart >= dailyEnd rule and saved nothing (revision unchanged), so that one rule does work — it is the defaultStart >= dailyStart rule that is absent.
started: Discovered during the live Telegram group verification run on 2026-08-24.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: "F-5 needs a Prisma migration (a candidate-array or paired-value column) before daily end can be edited."
  evidence: `SettingsField` in prisma/schema.prisma:26-35 ALREADY contains `DAILY_END_MINUTE`, and every layer downstream of the button already handles it — renderers.ts:197-200 (prompt), settings-handlers.ts:181-186 (parse), settings-service.ts:113-114 (fieldProperty), settings-service.ts:136-138 (fieldValueIsValid), renderers.ts:213-219 (review display). tests/unit/settings.test.ts:84-99 already drives `beginEdit(..., "DAILY_END_MINUTE", ...)` green against the real service. Nothing in the persistence layer is missing.
  timestamp: 2026-08-24

- hypothesis: "F-5 is in src/telegram/settings-handlers.ts (the file named on broken window 6)."
  evidence: settings-handlers.ts:70-81 `createDashboard` loops `Object.values(SettingsField)` and mints a token for ALL EIGHT fields including DAILY_END_MINUTE. The handler is already correct and over-provisions. The token is orphaned because keyboards.ts:74-93 renders only seven buttons. Window 6's `file` attribution is off by one module.
  timestamp: 2026-08-24

- hypothesis: "F-6 is a divergence between the setup path and the settings-edit path — one validates, the other does not."
  evidence: There is exactly ONE validator and both paths call it. Setup: setup-service.ts:101 (`completeConfiguration`) and setup-service.ts:199 (`setScheduleField`). Settings: settings-service.ts:159 (`configurationIsValid`), reached from `getCommitted` (:191) and `configurationWithReplacement` (:178). Both surfaces render the same contract copy (settings-handlers.ts:52-53; setup-handlers.ts:43). The rule is missing from BOTH because it is missing from the single shared function.
  timestamp: 2026-08-24

- hypothesis: "The implementation drifted from an approved spec that did require defaultStart >= dailyStart."
  evidence: The rule is absent from the entire planning chain. 01-UI-SPEC.md:115 names only `daily start < daily end` and `default start + duration <= daily end`. 01-PATTERNS.md:121 repeats exactly those two plus positive duration. 01-06-PLAN.md:102 and its acceptance criterion :120 repeat exactly the same three. The code matches the spec precisely; the SPEC is what is incomplete.
  timestamp: 2026-08-24

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-08-24
  checked: .planning/debug/knowledge-base.md
  found: File does not exist — no prior resolved debug sessions.
  implication: No known-pattern shortcut; investigate from first principles.

- timestamp: 2026-08-24
  checked: src/telegram/keyboards.ts:74-93 (`settingsDashboardKeyboard`)
  found: Seven buttons for eight `SettingsField` members. Line 86 reads `.text("Edit daily boundaries", tokenFor(SettingsField.DAILY_START_MINUTE))` — a plural label bound to a single start-only field. `SettingsField.DAILY_END_MINUTE` appears nowhere in this function, nor in any other keyboard.
  implication: F-5 root cause located to one expression. The label promises a pair; the binding delivers one field. No `begin` action for DAILY_END_MINUTE is ever surfaced to Telegram, so the field is unreachable by construction.

- timestamp: 2026-08-24
  checked: `grep -rn "DAILY_END_MINUTE" src/` — all references
  found: Exactly four src references, none of them a keyboard: shared/callback-schema.ts:42 (enum literal in the target parser), settings-handlers.ts:184 (parseTextValue accepts it), renderers.ts:197-200 (a complete "<b>Daily end</b>\nCurrent: … Send a time in 24-hour HH:MM format." prompt) and renderers.ts:216 (review formatting).
  implication: The DAILY_END_MINUTE edit flow is fully implemented end to end and is dead code solely for want of an entry point. The fix surface is the keyboard, not the draft schema.

- timestamp: 2026-08-24
  checked: src/telegram/settings-handlers.ts:70-81 (`createDashboard`)
  found: `for (const field of Object.values(SettingsField))` mints a callback token for all eight fields, then hands `tokens.get(field)!` to the keyboard, which consumes seven. One valid DAILY_END_MINUTE token row is written to `callback_actions` and orphaned on every single `/settings` render.
  implication: Strong disconfirming evidence against any "schema/plumbing missing" theory — the handler already assumes eight buttons exist. Also a minor persistent side effect: one dead token per dashboard render.

- timestamp: 2026-08-24
  checked: prisma/schema.prisma:26-35 (`SettingsField`), :74-92 (`SettingsEditDraft`), :37-52 (`ChatConfiguration`)
  found: `SettingsField` already declares both DAILY_START_MINUTE and DAILY_END_MINUTE. `SettingsEditDraft.replacementPayload` is `Json?` — untyped, so any payload shape already fits. `ChatConfiguration` stores `dailyStartMinute Int` and `dailyEndMinute Int` as two separate columns, whereas `reminderMinutes Int[]` is ONE column.
  implication: (a) NO Prisma migration is required for F-5 under either candidate design. (b) The reminders "pair" works only because it is one array column mapping to one `fieldProperty`; daily boundaries are two scalar columns, so a genuine single-draft pair edit would need multi-column write support in the service, while two separate buttons need nothing at all.

- timestamp: 2026-08-24
  checked: src/domain/chat/settings-service.ts:101-120 (`fieldProperty`), :170-179 (`configurationWithReplacement`), :378-385 (`saveChange` write)
  found: The whole edit pipeline is single-property by construction: `fieldProperty` returns one key; `configurationWithReplacement` builds `{ ...active, [property]: value }`; `saveChange` writes `data: { [property]: candidate[property], revision: { increment: 1 } }`; the review carries `configuration[property]` (:269-270).
  implication: This is the exact mechanism that makes the recorded decision ("one SettingsEditDraft field plus replacement payload for every editable setting; no candidate-array schema") hold. Two independent buttons stay inside that decision untouched. A one-field-two-columns pair edit would strain it — one enum member would have to stand for two columns.

- timestamp: 2026-08-24
  checked: .planning/phases/01-chat-readiness/01-UI-SPEC.md:94, :115, :123, :137
  found: :94 requires "exactly one `Edit …` button for each editable value **or value-pair**". :115 names only two coherence rules. :123 caps labels at 24 visible characters. :137 fixes the invalid-schedule copy verbatim.
  implication: Two buttons ("Edit daily start" / "Edit daily end", 16 and 14 chars) satisfy :94 and :123 with zero further change. And the copy for the F-6 rejection already exists verbatim — the missing rule needs no new user-facing text.

- timestamp: 2026-08-24
  checked: src/domain/chat/schedule-validator.ts:42-71 (`validateSchedule`) — full rule enumeration
  found: Four checks, no more. :48-54 every minute of {defaultStart, dailyStart, dailyEnd} is an integer in [0,1440) → `invalid-minute`. :55-60 `durationMinutes` is a positive integer → `invalid-duration`. :61-63 `dailyStartMinute >= dailyEndMinute` → `invalid-boundaries`. :64-69 `defaultStartMinute + durationMinutes > dailyEndMinute` → `outside-boundaries`. There is NO lower-bound containment check.
  implication: The rehearsal is constrained against the daily window's CEILING only. Nothing anchors it to the window's FLOOR, so any `defaultStartMinute < dailyStartMinute` passes. This is F-6's exact mechanism.

- timestamp: 2026-08-24
  checked: Both call sites of the validator — setup-service.ts:7,101,199 and settings-service.ts:13,159 (reached from :178 and :191)
  found: One shared `validateSchedule` import in each service; no second or divergent implementation anywhere in src/.
  implication: Answers the hint directly — the SAME validator runs on the setup path and the settings-edit path. F-6 is one missing rule in one function, not a path asymmetry, and a single-site fix closes both surfaces at once.

- timestamp: 2026-08-24
  checked: .planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md steps 3a and 3b (lines ~152, ~159)
  found: Step 3a recorded `default_start_minute` 1140 → 1080 (19:00 → 18:00), revision 1 → 2. Step 3b Проба A set daily start 22:00 and was correctly rejected (revision unchanged at 3); Проба B set daily start 19:00 = 1140 and saved, revision 3 → 4.
  implication: The committed row is defaultStartMinute=1080 (18:00) with dailyStartMinute=1140 (19:00) — the rehearsal begins exactly one hour before the window opens, matching the report verbatim. dailyEndMinute is 1320 (22:00), consistent with Проба A's `1140 >= 1320` being false only for 22:00 as END (the fixture in tests/unit/settings.test.ts:17-18 uses the same 1320).

- timestamp: 2026-08-24
  checked: EXPERIMENT — executed the verbatim body of `validateSchedule` (schedule-validator.ts:42-71, extracted mechanically by `sed -n '42,71p'` with only the type annotations stripped) against the exact committed row {defaultStart:1080, duration:120, dailyStart:1140, dailyEnd:1320}
  found: |
    committed row verdict: {"valid":true}
      dailyStart < dailyEnd  : true
      start+dur <= dailyEnd  : true
      defaultStart >= dailyStart (UNCHECKED RULE): false
  implication: DECISIVE. The production row that the live run reports as incoherent is judged fully valid by the current validator, and the single predicate that would have caught it is the one predicate not implemented. F-6 confirmed arithmetically, not inferentially.

- timestamp: 2026-08-24
  checked: .planning/phases/01-chat-readiness/01-UI-SPEC.md:115, 01-PATTERNS.md:121, 01-06-PLAN.md:102 and :120
  found: All four independently enumerate the coherence rules and all four list the SAME three: positive whole duration, `dailyStart < dailyEnd`, `defaultStart + duration <= dailyEnd`. None mentions a lower bound. .planning/REQUIREMENTS.md:12 (CONF-03) states only "configure the rehearsal duration and daily time boundaries used to generate slots"; the containment obligation lives in CONF-04 (:13, Phase 2, still open): "Time slots ... never extend beyond the configured daily boundary."
  implication: F-6 is upstream of the code. The omission entered at the UI-SPEC, was copied into PATTERNS, then into the plan's acceptance criterion, then implemented faithfully. Fixing the code alone leaves the spec still wrong; UI-SPEC:115 and PATTERNS:121 must be amended in the same change or the defect can be re-derived from the contract.

- timestamp: 2026-08-24
  checked: tests/unit/schedule-settings.test.ts:25-57 ("rejects exact schedule boundary conflicts")
  found: Four assertions, all with `dailyStartMinute: 600` and `defaultStartMinute` 1080/1081 — i.e. default start is ABOVE daily start in every single case. The suite exercises the `defaultStart + duration > dailyEnd` boundary at ±1 minute and the `dailyStart >= dailyEnd` boundary, but never places defaultStart below dailyStart.
  implication: The gate that should have caught F-6. The unit suite mirrors the same spec omission, so the equivalence class "rehearsal before the window opens" has no representative anywhere in the test corpus.

- timestamp: 2026-08-24
  checked: `grep -n "settingsDashboardKeyboard" tests/` and tests/unit/settings.test.ts:84-99
  found: ZERO test references to `settingsDashboardKeyboard` — the dashboard keyboard is never asserted in any suite. Meanwhile tests/unit/settings.test.ts:84-99 drives `beginEdit(CHAT_ID, ACTOR_ID, "DAILY_END_MINUTE", NOW)` and asserts a rejected out-of-range edit, and passes.
  implication: The gate that should have caught F-5, and the reason it read as covered. The service-level test proves DAILY_END_MINUTE works, which is true — but it bypasses the keyboard entirely, so a green suite coexists with a field no user can reach. No test asserts the invariant "every SettingsField has exactly one dashboard entry point".

- timestamp: 2026-08-24
  checked: COLLATERAL — src/domain/chat/setup-service.ts:134-144 (`beginOrResume`) vs :328 (`saveConfiguration`), and prisma/schema.prisma:68 (`SetupDraft.expectedRevision Int @default(0)`)
  found: `beginOrResume` never populates `expectedRevision` (the `create` block omits it; the `update` block sets only `expiresAt`), and `grep -rn "expectedRevision" src/` shows setup-service.ts:328/:342 as the only readers — nothing ever writes it. So a fresh `/setup` draft on an already-configured chat carries expectedRevision=0 while `active.revision` is 4, and :328 `draft.expectedRevision !== (active?.revision ?? 0)` aborts with `{kind: "conflict"}`. `/setup` itself is unguarded (handlers.ts:165-172 → setup-handlers.ts:258) and happily walks all eight steps before failing at save.
  implication: MATTERS FOR THE FIX ORDER, not for the diagnosis. `getCommitted` (settings-service.ts:185-197) gates on `configurationIsValid` → `validateSchedule`. The moment the F-6 rule lands, the already-committed row stops validating and `/settings` degrades to "I couldn't load chat settings. Please try again." (renderers.ts:121-124), while `beginEdit` throws (:207). The obvious manual recovery — re-run `/setup` — cannot work either, because of this revision defect. The live chat's row must therefore be repaired directly (data migration or SQL) in the same change that tightens the validator.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  Two independent defects, deliberately NOT collapsed into one story.

  F-5 (daily end unreachable) — src/telegram/keyboards.ts:86. `settingsDashboardKeyboard`
  renders seven buttons for eight `SettingsField` members; the row labelled
  "Edit daily boundaries" (plural) is bound to `SettingsField.DAILY_START_MINUTE`
  alone, and `SettingsField.DAILY_END_MINUTE` is bound to no button anywhere.
  Every other layer of that edit already exists and works (prompt, parser,
  property map, validity check, review renderer, and a passing service-level
  test), and settings-handlers.ts:70-81 already mints a DAILY_END_MINUTE token
  on every render that the keyboard then discards. The dead end is one missing
  keyboard binding, not a schema, draft, or service limitation.

  F-6 (no lower-bound check) — src/domain/chat/schedule-validator.ts:42-71,
  originating at .planning/phases/01-chat-readiness/01-UI-SPEC.md:115.
  `validateSchedule` constrains the rehearsal against the daily window's
  ceiling (`defaultStart + duration > dailyEnd`) but never against its floor;
  the predicate `defaultStartMinute < dailyStartMinute` is unimplemented
  because it was never specified — UI-SPEC:115, 01-PATTERNS.md:121 and
  01-06-PLAN.md:102/:120 all enumerate the same three rules and all omit it.
  The code matches its contract exactly; the contract is incomplete.

fix: NOT APPLIED — goal was find_root_cause_only.
verification: n/a — diagnose-only mode.
files_changed: []

oracle_note: |
  A regression test for F-5 should assert the structural invariant (every
  SettingsField value appears exactly once in the dashboard keyboard), not just
  the two daily rows — a derived/contract oracle, so the next field added
  cannot repeat this. For F-6 the oracle is `specified` once UI-SPEC:115 is
  amended; boundary neighbours to cover are defaultStart == dailyStart (must
  pass), dailyStart - 1 (must fail) and dailyStart + 1 (must pass).
