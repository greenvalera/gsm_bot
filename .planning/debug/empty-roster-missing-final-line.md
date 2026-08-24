---
status: diagnosed
trigger: "Investigate issue: empty-roster-missing-final-line — The empty-roster surface is missing its final contract line. This is finding F-8, broken window id 10."
created: 2026-08-24
updated: 2026-08-24
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — the Copywriting Contract specifies ONE empty-state instruction line, not two. The "final line" in the runbook/UAT is a mis-transcription of the Surface-inventory paraphrase of that same sentence. The renderer is correct; the expectation is the defect.
test: (complete) Compared 01-UI-SPEC.md Surface inventory (L97) vs Copywriting Contract (L133-134) vs UI Considerations authority note (L152); traced the expectation back through the runbook plan to its source; audited all empty-state assertions in src/ and tests/.
expecting: (complete)
next_action: Report diagnosis. Fix belongs in the UAT/runbook expectation (and a spec de-duplication), NOT in src/telegram/roster-renderers.ts. Broken window 10 is misfiled against the source file.

bug_class: Bohrbug (deterministic, fully reproducible — a static string comparison). SBFL skipped: no failing automated test exists; the failure lives in a document, not in a code path.

reasoning_checkpoint:
  hypothesis: "The UI-SPEC states the empty-state instruction sentence twice — normatively in the Copywriting Contract ('...to add them.') and as an inline paraphrase in the Surface-inventory row ('...send /roster_add.'). They are the same sentence, not two required lines. The runbook-authoring plan concatenated both into a three-element expectation, which propagated into UAT Test 15."
  confirming_evidence:
    - "01-UI-SPEC.md L152 explicitly designates the Copywriting Contract as the authority for empty-state copy."
    - "The Copywriting Contract (L131-146) has exactly two empty-state elements — heading and body. There is no 'final line' element, while every other verbatim string in the spec does have its own row."
    - "The Surface-inventory row L97 defers copy first ('Use the copywriting empty state below') and only then restates it, which is the signature of a paraphrase, not an additional requirement."
    - "The original UI-SPEC commit bb77c76 introduced all three lines together and, in the same commit, recorded the state-coverage row 'Empty roster renders the documented heading and add-by-reply instruction' — heading + ONE instruction."
    - "Runbook plan 260821-q0p-PLAN.md L100 says the copy is 'all sourced from 01-UI-SPEC.md', then L113 mechanically merges both spec sentences into heading + body + final line."
  falsification_test: "Find a Copywriting Contract row (or any approved-spec statement outside L97) that names a distinct second instruction line for the empty state. None exists — L152, L163 and L179 all speak of 'the documented empty state' in the singular."
  fix_rationale: "N/A for src/. The rendered surface already matches the normative copy table exactly. Emitting the paraphrase as a third line would print the same instruction twice in one Telegram message, violating the spec's own Voice rule."
  blind_spots: "The spec author's private intent is unrecoverable from artifacts; the inference rests on the authority note, the absent contract row, and the near-verbatim overlap. Not tested: whether a human reviewer would still prefer the shorter L97 wording as the single body string."
  candidate_causes:
    - "code: renderRosterPage omits a third line (src/telegram/roster-renderers.ts:99-106) — REFUTED"
    - "data/documentation: 01-UI-SPEC.md carries the same sentence in two sections with different wording — CONFIRMED"
    - "process/config: the runbook transcription promoted a paraphrase to a distinct requirement — CONFIRMED as the propagation mechanism"
    - "environment: Telegram client trimming a duplicate line — REFUTED, the literal never exists in src/"
  and_gate: "yes — two conditions were both required. The spec duplication alone was harmless for four months (the implementation and its tests shipped against the contract table). It only became a reported failure once the runbook transcription step read the two overlapping sentences as two requirements. Either alone produces no F-8."

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: The empty roster renders header "No band members yet", body "Reply to a member's message, then send /roster_add to add them.", a final line "Reply to a member's message, then send /roster_add.", and no Remove buttons.
actual: Header, body and the absence of Remove buttons all match the contract. The final line "Reply to a member's message, then send /roster_add." is missing entirely.
errors: None — a missing string.
reproduction: Test 15 in .planning/phases/01-chat-readiness/01-UAT.md; runbook step 6a.
started: Discovered during the live Telegram group verification run on 2026-08-24.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: "renderRosterPage drops a third line that the contract requires (i.e. a code defect in src/telegram/roster-renderers.ts)."
  evidence: "The Copywriting Contract — which 01-UI-SPEC.md L152 names as the authority for empty-state copy — lists exactly two empty-state elements (heading L133, body L134) and no final-line element. The renderer emits exactly those two, verbatim."
  timestamp: 2026-08-24

- hypothesis: "A code path builds the final line but it is lost before send (conditional, trim, join, or Telegram-side collapsing)."
  evidence: "`grep -rn 'roster_add\\.' src/ tests/` returns NO MATCH. No string ending in '/roster_add.' exists anywhere in the source or the test suite, so nothing can be dropped at render or transport time."
  timestamp: 2026-08-24

- hypothesis: "The implementation drifted from a spec that once agreed with the runbook."
  evidence: "git log --follow on 01-UI-SPEC.md: the Surface-inventory row (L97) and both Copywriting Contract rows (L133-134) were all introduced in the SAME creating commit bb77c76 and were never edited afterwards. There is no drift — the duplication is original."
  timestamp: 2026-08-24

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-08-24 (phase 0)
  checked: .planning/debug/knowledge-base.md
  found: No knowledge base file exists yet (first debug session in this project).
  implication: No known-pattern shortcut available; investigated from scratch.

- timestamp: 2026-08-24
  checked: .planning/phases/01-chat-readiness/01-UI-SPEC.md L97 (Interaction Contract -> Surface inventory)
  found: "| Empty roster | `/roster` with no active members | Use the copywriting empty state below and no Remove controls. Show a final instruction line: `Reply to a member's message, then send /roster_add.` |"
  implication: This row defers the copy to the Copywriting Contract in its first clause and then restates the instruction in its own words. The restatement is the string the runbook treats as a separate line.

- timestamp: 2026-08-24
  checked: .planning/phases/01-chat-readiness/01-UI-SPEC.md L131-134 (Copywriting Contract)
  found: "| Element | Copy |" ... "| Empty state heading | `No band members yet` |" and "| Empty state body | `Reply to a member's message, then send /roster_add to add them.` |". There is NO 'Empty state final line' row anywhere in the table (L131-146).
  implication: The normative copy table defines exactly two strings for this surface. Every other verbatim string in the spec (denials, expiry, stale action, save error, invalid time...) has its own row here; a genuinely required third line would too.

- timestamp: 2026-08-24
  checked: .planning/phases/01-chat-readiness/01-UI-SPEC.md L152 (UI Considerations preamble, added at approval in 08e6eb7)
  found: "> Populated by the ui-phase UI-consideration probe after checker approval. Empty-state and error-state copy remains in the Copywriting Contract; this section references those rows and locks the state behavior that planning must preserve."
  implication: DECISIVE. The approved spec explicitly names the Copywriting Contract as the single source of empty-state copy. The Surface-inventory prose is layout/behavior, not the copy authority.

- timestamp: 2026-08-24
  checked: .planning/phases/01-chat-readiness/01-UI-SPEC.md L163 and L179
  found: L163 "Zero members uses the documented empty state with no removal controls"; L179 "This variant is selected only at zero active members".
  implication: Both post-approval statements speak of "the documented empty state" in the singular and add no third line.

- timestamp: 2026-08-24
  checked: git log -p --follow on 01-UI-SPEC.md
  found: All three lines (L97 surface row, L133 heading, L134 body) were added in one commit, bb77c76 "docs(01): UI design contract". The same commit also added a state-coverage row: "| empty | Roster list | ✅ covered | Empty roster renders the documented heading and add-by-reply instruction; it has no Remove controls. |" (that row was later replaced during approval in 08e6eb7).
  implication: The spec author's own coverage note reads the surface as heading + ONE instruction. The duplication at L97/L134 is a drafting artifact present from the first draft, not later drift.

- timestamp: 2026-08-24
  checked: src/telegram/roster-renderers.ts L98-106 (renderRosterPage, total === 0 branch)
  found: Emits exactly ["<b>No band members yet</b>", "Reply to a member's message, then send /roster_add to add them."].join("\n") and returns no reply_markup.
  implication: The renderer matches the Copywriting Contract heading and body byte-for-byte, and correctly omits Remove controls.

- timestamp: 2026-08-24
  checked: grep -rn "roster_add\." src/ tests/
  found: NO MATCH. No string terminating in "/roster_add." exists in the source tree or the test suite.
  implication: The "missing" line was never implemented and is not being lost at render or transport time.

- timestamp: 2026-08-24
  checked: tests/unit/roster-rendering.test.ts L26-29 (EMPTY_TEXT) and L340-341; tests/unit/roster-add.test.ts L128-134; tests/integration/chat-readiness.e2e.test.ts L735-737
  found: Three independent tests assert the empty state with EXACT-match matchers — `expect(renderRoster([])).toEqual({ text: EMPTY_TEXT })`, `expect(renderRoster([])).toEqual({ text: [...].join("\n") })`, and `expect(...payload.text).toBe("<b>No band members yet</b>\nReply to a member's message, then send /roster_add to add them.")`. All three encode the two-line form.
  implication: The tests pass because they were written against the Copywriting Contract, which the code satisfies. Because they are exact-match (not toContain), appending a third line to the renderer would FAIL all three. Code, tests, and the copy table are mutually consistent; only the runbook/UAT disagrees.

- timestamp: 2026-08-24
  checked: .planning/quick/260821-q0p-write-01-live-verification-runbook-md-op/260821-q0p-PLAN.md L100 and L113
  found: L100 "Copy required for the `Expect` blocks, all sourced from `01-UI-SPEC.md`:"; L113 "- Empty roster: heading `No band members yet`, body `Reply to a member's message, then send /roster_add to add them.`, final line `Reply to a member's message, then send /roster_add.`, and no Remove controls."
  implication: THE TRANSCRIPTION POINT. The runbook author harvested copy from both spec sections and, seeing two similar sentences in two places, listed them as two distinct elements. The three-element expectation is born here — not in the spec.

- timestamp: 2026-08-24
  checked: Propagation chain of the mis-transcribed expectation
  found: 260821-q0p-PLAN.md L113 -> 01-LIVE-VERIFICATION-RUNBOOK.md L257 (step 6a "Очікується") -> 01-UAT.md L110 (Test 15 expected) -> 01-UAT.md L212 (gap G-01-15 truth "The empty-roster surface ends with 'Reply to a member's message, then send /roster_add.'") -> WINDOWS.md window 10 (filed against src/telegram/roster-renderers.ts).
  implication: One drafting ambiguity propagated through five artifacts unchallenged and terminated as a source-code broken window. The window is filed against the wrong file.

- timestamp: 2026-08-24
  checked: .planning/phases/01-chat-readiness/01-12-PLAN.md L118 (the acceptance criterion the implementer built against)
  found: "<criterion>The empty roster shows no removal controls and ends with the exact `/roster_add` reply instruction.</criterion>"
  implication: The implementing plan also read the surface as ending with ONE instruction ("the exact ... instruction", singular). The implementation satisfies its own plan criterion.

- timestamp: 2026-08-24
  checked: src/telegram/roster-handlers.ts L41-42 (adjacent, not the reported bug)
  found: `const INVALID_REPLY = "Reply to a band member's message, then send /roster_add to add them.";` — note "band member's" vs the renderer's "member's".
  implication: A THIRD wording of the same sentence exists on the /roster_add-without-reply usage-error surface, which the Copywriting Contract does not document at all. Whoever fixes F-8 must not conflate these two strings. Flagged as a separate observation, out of scope for F-8.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: >
  Not a code defect. Two conditions combined (AND-gate). (1) DOCUMENTATION: 01-UI-SPEC.md states
  the empty-state instruction sentence twice — normatively as "Empty state body" in the Copywriting
  Contract (L134, ".../roster_add to add them.") and again as an inline paraphrase in the Surface-inventory
  row (L97, ".../roster_add."), the paraphrase merely dropping the trailing "to add them.". They are one
  sentence written twice, not two required lines; the spec's own authority note (L152) assigns empty-state
  copy to the Copywriting Contract, which contains no "final line" element. (2) PROCESS: the runbook-authoring
  plan (260821-q0p-PLAN.md L113) harvested copy from both sections and promoted the paraphrase to a distinct
  third required line, which propagated verbatim into the runbook (L257), UAT Test 15 (L110), gap G-01-15
  (L212), and finally broken window 10 filed against src/telegram/roster-renderers.ts.
  src/telegram/roster-renderers.ts:99-106 already renders the Copywriting Contract byte-for-byte and is correct.
fix: (not applied — diagnose-only mode). Correct the EXPECTATION, not the renderer.
verification: (n/a — no fix applied)
files_changed: []
