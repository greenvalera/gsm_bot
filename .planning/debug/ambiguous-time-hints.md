---
status: diagnosed
trigger: "ambiguous-time-hints — Setup wizard steps 3, 5 and 6 do not say which time is being entered. Finding F-1, broken window id 9, owner's original complaint during the live run."
created: 2026-08-24T14:41:52+03:00
updated: 2026-08-24T14:52:00+03:00
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — `renderSetupStep` in `src/telegram/renderers.ts` emits the bare shared `TIME_HINT` constant as the whole body for steps 3/5/6, so those messages carry the input *format* but never name the *subject*. Only the two step-7 branches prepend a subject sentence, because inside step 7 two consecutive prompts share the identical `Step 7 of 8` header and would otherwise be literally indistinguishable. The author treated `Step N of 8` as sufficient identification for 3/5/6; it is a progress indicator, not a semantic label.
test: grep for `TIME_HINT`; read `renderSetupStep` fully; read the UI-SPEC Copywriting Contract, Surface inventory and UI Considerations tables; check `setup-handlers.ts` for competing copy; check tests + git history for the gate that should have caught it
expecting: all setup step copy owned by one function; contract silent on verbatim per-step sentences but explicit on the behavior; no test asserting the prompt body
next_action: return ROOT CAUSE FOUND to the orchestrator (goal: find_root_cause_only — do not fix)

reasoning_checkpoint:
  hypothesis: "Steps 3/5/6 are ambiguous because renderSetupStep interpolates only the shared TIME_HINT format constant as their message body, with no subject sentence; the step-7 branches are the only ones that prepend a subject."
  confirming_evidence:
    - "renderers.ts:255,263,266 are literally `${TIME_HINT}` with nothing before it; renderers.ts:276,281 are `Send the first/second reminder time. ${TIME_HINT}`"
    - "grep confirms TIME_HINT has exactly one definition (renderers.ts:43) and five call sites — the three bare ones and the two prefixed ones"
    - "setup-handlers.ts contains no wizard prompt copy at all; it imports renderSetupStep (line 26) and calls it at line 164"
    - "01-UI-SPEC.md:92 fixes the hint text verbatim but the Copywriting Contract table (lines 128-146) has no row for any wizard step prompt"
  falsification_test: "If a second source rendered the step 3/5/6 body, or if the Copywriting Contract contained verbatim rows for these prompts, the diagnosis would be wrong. Both checked: single source, no contract rows."
  fix_rationale: "Prepending a subject sentence in the step-7 form addresses the actual mechanism (missing subject) rather than the symptom (three identical strings). Deduplicating or renaming TIME_HINT would not fix anything."
  blind_spots: "The exact wording of the three sentences is not fixed by any written contract, so it remains an owner copy decision constrained by the wizard-sequence field names. Not tested: whether the Telegram client renders the longer one-line prompt without awkward wrapping on narrow screens."
  candidate_causes:
    - "code: renderSetupStep emits a format-only body for three branches (renderers.ts:255,263,266)"
    - "documentation/contract: 01-UI-SPEC.md Copywriting Contract has no verbatim rows for wizard step prompts; the disambiguation requirement exists only as behavioral prose"
    - "process/test gate: the only renderSetupStep assertion for step 3 is stringContaining(\"Step 3 of 8\"); steps 5 and 6 have no rendering assertion at all"
  and_gate: "yes — two conditions had to hold simultaneously. (a) The contract fixed the shared hint verbatim but left the per-step subject unnamed, AND (b) the implementer assumed the `Step N of 8` header identified the field. Had the contract listed verbatim prompts, (b) would have been harmless; had the implementer generalized the step-7 pattern (which they wrote in the same commit, 8d8a670), (a) would have been harmless."

bug_class: Bohrbug — fully deterministic, reproduces on every run of the wizard. Pure static copy defect, no timing or state dependence.

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Each time-entry step in the setup wizard states which time it is asking for, the way step 7 already does with its leading sentence.
actual: Steps 3 (rehearsal start), 5 (daily start) and 6 (daily end) all render an identical TIME_HINT with no indication of which value is being entered. The user cannot tell the three prompts apart. Step 7 already uses the correct leading-sentence pattern.
errors: None — this is a UX/copy defect.
reproduction: Test 3 in .planning/phases/01-chat-readiness/01-UAT.md; runbook step 2b.
started: Discovered during the live Telegram group verification run on 2026-08-24.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: "src/telegram/setup-handlers.ts owns the ambiguous copy (per broken window 9's file attribution)."
  evidence: "setup-handlers.ts holds only error/timezone copy (INVALID_TIME at :41, location failure at :40, schedule conflict at :43, timezone candidates at :70,:82). It imports renderSetupStep at :26 and calls it once at :164 inside replyWithStep, then sends projection.text unchanged. No wizard step string exists in the file. WINDOWS.md:26 file field is wrong for window 9."
  timestamp: 2026-08-24T14:48:00+03:00

- hypothesis: "The Copywriting Contract already specifies verbatim leading sentences for steps 3/5/6, so this is a pure implementation gap and the fix is a transcription."
  evidence: "01-UI-SPEC.md:128-146 — the Copywriting Contract table has 14 rows: CTA, empty state x2, invalid time input, location failure, invalid schedule, expired draft, stale setup action, stale settings/roster action, generic save error, permission errors x2, destructive confirmation. None is a wizard step prompt. The only time-prompt string fixed anywhere is at :92 in the Surface inventory, and it is the hint that is already rendered verbatim."
  timestamp: 2026-08-24T14:50:00+03:00

- hypothesis: "The rendered hint text itself violates the contract."
  evidence: "01-UI-SPEC.md:92 requires `Send a time in 24-hour format, for example 19:30.` TIME_HINT (renderers.ts:43-44) is exactly that string with 19:30 in <code>. Runbook line 111 recorded step 3 showing it verbatim in the live run. The hint is compliant — the defect is the absent subject, so any fix must prepend, never replace."
  timestamp: 2026-08-24T14:50:30+03:00

- hypothesis: "The inconsistency is drift — the step-7 leading sentence was added later than steps 3/5/6."
  evidence: "git log -S on both strings returns the same single commit 8d8a670 'feat(01-06): collect validated setup schedule'. TIME_HINT and both reminder sentences were born together. The inconsistency was written in one sitting, not accumulated."
  timestamp: 2026-08-24T14:51:00+03:00

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-08-24T14:41:52+03:00
  checked: .planning/debug/knowledge-base.md
  found: Does not exist — no prior resolved sessions to match against.
  implication: No known-pattern shortcut; investigate from first principles.

- timestamp: 2026-08-24T14:44:00+03:00
  checked: grep -rn "TIME_HINT" across the tree
  found: One definition at src/telegram/renderers.ts:43-44 and exactly five call sites — :255 (step 3), :263 (step 5), :266 (step 6), :276 (step 7 first reminder), :281 (step 7 second reminder). The runbook's line numbers (255/263/266 and 276/281) match the current tree exactly.
  implication: The runbook note is accurate and current. Single source of truth for all setup prompt copy.

- timestamp: 2026-08-24T14:45:00+03:00
  checked: src/telegram/renderers.ts renderSetupStep (lines 242-306)
  found: Steps 3/5/6 return `Setup in progress\nStep N of 8\n\n${TIME_HINT}` — the interpolated hint is the entire body. Steps 7a/7b return `...\n\nSend the first|second reminder time. ${TIME_HINT}`. Steps 1, 2, 4 and 8 all carry a self-contained subject sentence ("Send a location in this group…", "Choose the default rehearsal weekday.", "Send the rehearsal duration as a positive whole number of minutes.", "Choose who can start rehearsal planning…").
  implication: Steps 3/5/6 are the only three prompts in the entire eight-step wizard with no subject. Six of eight steps already establish the naming convention they violate.

- timestamp: 2026-08-24T14:46:00+03:00
  checked: Why step 7 got the sentence and 3/5/6 did not
  found: Within step 7 two consecutive prompts share the identical `Step 7 of 8` header (renderers.ts:276 and :281). Without a subject they would be byte-identical. Steps 3/5/6 differ by step number, so the author evidently treated `Step N of 8` as sufficient identification.
  implication: Root mechanism — the disambiguating sentence was applied only where the header could not disambiguate at all, not where the header disambiguates position but not meaning. `Step 5 of 8` tells a user where they are, not what is being asked. 01-UI-SPEC.md:157 states this explicitly: "`Step X of 8` identifies progress".

- timestamp: 2026-08-24T14:47:00+03:00
  checked: src/telegram/renderers.ts renderSettingsEditPrompt (lines 172-208)
  found: The settings-edit flow prompts for the SAME three fields do disambiguate, with a bold field heading plus a Current line — `<b>Default start</b>` (:187), `<b>Daily start</b>` (:195), `<b>Daily end</b>` (:199), each followed by "Send a time in 24-hour HH:MM format."
  implication: Strong differential. The codebase already names these exact three fields correctly on a sibling surface. Two disambiguation patterns exist (settings bold heading; step-7 leading sentence); only the setup wizard's three time steps use neither. This also supplies canonical short labels: "Default start", "Daily start", "Daily end".

- timestamp: 2026-08-24T14:48:00+03:00
  checked: src/telegram/setup-handlers.ts (window 9's attributed file)
  found: replyWithStep (:155-186) calls renderSetupStep(draft) at :164 and sends projection.text unchanged with parse_mode HTML (:166, :181). All string literals in the file are error/timezone copy. No wizard step prompt.
  implication: WINDOWS.md:26 attributes window 9 to the wrong file. The owner is src/telegram/renderers.ts. (Window 8 / F-2, also attributed to setup-handlers.ts, IS correctly attributed — the reply-vs-editMessageText behavior lives there.)

- timestamp: 2026-08-24T14:50:00+03:00
  checked: .planning/phases/01-chat-readiness/01-UI-SPEC.md
  found: Copywriting Contract (:128-146) contains no wizard step prompt row — its only time-related row is the error copy "Invalid time input" → `Use 24-hour time in HH:MM format, for example 19:30.` The disambiguation requirement is written twice as behavior instead: Surface inventory :92 "Schedule input prompts … Ask for a single value per message. Time prompts show `Send a time in 24-hour format, for example 19:30.`" and UI Considerations :157 "An unfilled step always renders its current prompt and required input format … `Step X of 8` identifies progress". The wizard sequence (:104-113) names the three fields: 3 "Default rehearsal start time", 5 "Daily start boundary", 6 "Daily end boundary".
  implication: Answers the contract question directly — this is an implementation gap against a written BEHAVIORAL contract, not against verbatim copy. The requirement is written; the sentences are not. The subject names must be derived from the wizard-sequence field names, and the fix must PREPEND to the contract-fixed hint rather than replace it.

- timestamp: 2026-08-24T14:51:00+03:00
  checked: .planning/phases/01-chat-readiness/01-06-PLAN.md
  found: :125 instructs "Render one prompt per step, action-first buttons…" — it restates the UI-SPEC behavioral clause but supplies no strings for steps 3/5/6.
  implication: The plan inherited the contract's silence. The implementer had a behavioral requirement and no copy, and satisfied it for six of eight steps.

- timestamp: 2026-08-24T14:51:30+03:00
  checked: tests/unit/schedule-settings.test.ts (only file importing renderSetupStep)
  found: Three renderSetupStep assertions. The step-3 one (:68-80) asserts only `expect.stringContaining("Step 3 of 8")`. Steps 5 and 6 have no rendering assertion at all. The reminder-default test asserts the 10:00/16:00 substring.
  implication: Why not caught — no gate existed. The step-3 test asserts the progress header, which is exactly the part that was never broken, and is blind to the body. Nothing in unit tests, typecheck, lint or build can observe copy adequacy.

- timestamp: 2026-08-24T14:51:45+03:00
  checked: git log -S on "Send the first reminder time" and "const TIME_HINT" in renderers.ts
  found: Both strings originate in the same commit 8d8a670 "feat(01-06): collect validated setup schedule".
  implication: Not drift. The inconsistent treatment was authored in a single commit — an intra-commit consistency lapse, which review (not tests) was the natural gate for.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  Primary (code): src/telegram/renderers.ts renderSetupStep interpolates the shared TIME_HINT
  constant as the entire message body for the three time-entry branches — :255 (step 3,
  defaultStartMinute), :263 (step 5, dailyStartMinute), :266 (step 6, dailyEndMinute) — so those
  messages state the required input FORMAT but never the SUBJECT. Only the two step-7 branches
  (:276, :281) prepend a subject sentence, and only because two prompts there share an identical
  `Step 7 of 8` header. The author treated `Step N of 8` as adequate identification for 3/5/6;
  01-UI-SPEC.md:157 states that header "identifies progress", not content.
  ;
  Contributing (contract): 01-UI-SPEC.md's Copywriting Contract (:128-146) fixes no verbatim text
  for any wizard step prompt. The disambiguation requirement exists only as behavioral prose at
  :92 and :157, and 01-06-PLAN.md:125 inherited that silence.
  ;
  Contributing (gate): the sole step-3 rendering test asserts only stringContaining("Step 3 of 8");
  steps 5 and 6 have no rendering assertion. No automated gate could observe the missing subject.

fix: NOT APPLIED — diagnose-only mode (goal: find_root_cause_only).

verification: n/a — no fix applied.

files_changed: []
