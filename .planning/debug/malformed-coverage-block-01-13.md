---
status: diagnosed
trigger: "malformed-coverage-block-01-13 — The coverage block in 01-13-SUMMARY.md fails schema validation, so a deliverable silently fell back to a human checkpoint instead of being deterministically auto-classified. Found during UAT transcription, not during the live run. No F-number or broken-window id yet."
created: 2026-08-24T00:00:00Z
updated: 2026-08-24T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — `.planning/phases/01-chat-readiness/01-13-SUMMARY.md:127` declares `kind: manual`, a shorthand of the schema's `manual_procedural` that is not in `VALID_KINDS`. The single invalid enum demotes the whole D8 entry to `present`/`validation_failed` even though its other verification entry is valid and passing.
test: Reproduced `uat.classify-coverage` on 01-13; read `VALID_KINDS` and the auto-pass gate in `coverage.cjs`; swept every `kind:` occurrence in `.planning/`; ran classify-coverage across all 14 phase summaries.
expecting: (complete — all tests executed)
next_action: NONE — goal is find_root_cause_only. Return ROOT CAUSE FOUND. Do not fix.

bug_class: Bohrbug — fully deterministic, reproduces on every invocation, no timing or environment dependence. Static data-validation defect in a planning artifact.

reasoning_checkpoint:
  hypothesis: "verification[1].kind on coverage entry D8 of 01-13-SUMMARY.md is the literal string `manual`, which is absent from the classifier's VALID_KINDS enum (unit, integration, e2e, automated_ui, manual_procedural, other), so validateEntry emits invalid_kind and the zero-errors precondition of the auto-pass gate fails, routing D8 to `present` with reason validation_failed."
  confirming_evidence:
    - "Direct read: line 127 of 01-13-SUMMARY.md is `      - kind: manual`."
    - "Direct read: coverage.cjs:64-66 defines VALID_KINDS as exactly the six values in the error message; `manual` is not one of them."
    - "Direct execution: classify-coverage emits exactly one error — index 7, id D8, code invalid_kind, field verification[1].kind — and places D8 in `present` with reason validation_failed."
    - "Direct read of the auto-pass gate: auto-pass requires zero validation errors AND strict human_judgment:false AND non-empty verification AND every status pass. D8 satisfies the last three; only the zero-errors clause fails."
  falsification_test: "If `manual` were a valid kind, or if `kind` were not part of validateEntry, classify-coverage would emit zero errors and place D8 in auto_passed. It does neither — one invalid_kind error, D8 in present."
  fix_rationale: "(diagnosis only, not applied) Editing line 127 to `manual_procedural` removes the sole validation error, and because kind is not itself an auto-pass criterion, D8 then meets every auto-pass condition and is deterministically auto-classified — the stated intent."
  blind_spots: "Whether `human_judgment: false` is truthful for a hand-inspected planning document is a judgment call outside this defect. The COVERAGE.md-row half of D8 has NO automated assertion behind it (verified: the e2e test references COVERAGE.md only in a comment), so auto-passing D8 records a human doc inspection as deterministically covered."
  candidate_causes:
    - "data/artifact (CONFIRMED): the SUMMARY frontmatter carries an out-of-enum literal at 01-13-SUMMARY.md:127."
    - "config/template (REFUTED): gsd-core/templates/summary.md documents the enum correctly twice — line 58 inline comment and line 188 contract table. The template never suggests `manual`."
    - "code/validator (REFUTED): coverage.cjs models this case correctly; `manual_procedural` exists precisely for human-followed procedures. The validator is not too narrow."
    - "environment (REFUTED): deterministic, reproduces from a clean checkout at the pinned base commit."
  and_gate: "no — a single condition is sufficient and necessary. The one out-of-enum literal alone produces the observed error and the human-checkpoint fallback; no second contributing condition is required. Verified by the auto-pass gate having exactly one failing clause."

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Every SUMMARY `coverage:` block parses against the schema, so `gsd-tools query uat.classify-coverage` can deterministically classify each deliverable as auto-covered or human-needed.
actual: Running `node .claude/gsd-core/bin/gsd-tools.cjs query uat.classify-coverage --summary .planning/phases/01-chat-readiness/01-13-SUMMARY.md` reports an error at index 7, id D8, code invalid_kind, field verification[1].kind — "verification kind must be one of unit, integration, e2e, automated_ui, manual_procedural, other". Entry D8 ("No undocumented external Telegram surface is used and every COVERAGE.md INTEGRATE row names its handler and test") is reported with reason validation_failed and falls back to a human checkpoint.
errors: invalid_kind on verification[1].kind of coverage entry D8 in .planning/phases/01-chat-readiness/01-13-SUMMARY.md
reproduction: Run the classify-coverage command above. Test 19 in .planning/phases/01-chat-readiness/01-UAT.md.
started: Found on 2026-08-24 while building the UAT file from the phase summaries.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: The SUMMARY template or GSD guidance told the author to write `manual`, making this a template-level defect that would recur across projects.
  evidence: `gsd-core/templates/summary.md` documents the enum correctly in two places — line 58 (`# unit | integration | e2e | automated_ui | manual_procedural | other`) and line 188 (field-semantics table). Neither mentions `manual`. The template is correct; the artifact deviates from it.
  timestamp: 2026-08-24

- hypothesis: The verification is genuinely of a kind the schema does not model, so the enum is too narrow (hint possibility (b)).
  evidence: verification[1] is a human reading `.planning/phases/01-chat-readiness/COVERAGE.md` and confirming each INTEGRATE row's third column names a handler and a test. That is a defined procedure with a mechanical pass/fail — exactly what `manual_procedural` denotes. The schema models it; no new kind is needed.
  timestamp: 2026-08-24

- hypothesis: Other summaries in the phase carry the same out-of-enum kind and simply were not surfaced because classify-coverage was never run on them.
  evidence: Ran classify-coverage against all 14 phase-01 SUMMARY files. Only 01-13 produced any validation error (1). Independently, a grep of every `kind:` occurrence in `.planning/` found exactly one out-of-enum coverage kind, at 01-13-SUMMARY.md:127.
  timestamp: 2026-08-24

- hypothesis: The whole coverage block of 01-13 is malformed / fails to parse.
  evidence: classify-coverage returns `mode: coverage`, `total: 8`, and 7 of 8 entries in `auto_passed`. The block parses correctly; the defect is one enum value in one nested verification item.
  timestamp: 2026-08-24

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-08-24
  checked: .planning/debug/knowledge-base.md and active debug sessions
  found: No knowledge base exists yet; no active debug sessions.
  implication: No known-pattern shortcut available. Investigated from first principles.

- timestamp: 2026-08-24
  checked: .planning/phases/01-chat-readiness/01-13-SUMMARY.md lines 120-130 (the D8 coverage entry)
  found: D8 has TWO verification items. verification[0] is `kind: integration` -> `tests/integration/chat-readiness.e2e.test.ts#completes setup, survives a restart, edits settings, and manages the roster`, status pass. verification[1] at line 127 is `kind: manual` -> `.planning/phases/01-chat-readiness/COVERAGE.md`, status pass. `human_judgment: false` at line 130.
  implication: The invalid literal is `manual` on line 127 — the only defective field. Everything else in D8 is schema-valid and passing.

- timestamp: 2026-08-24
  checked: Reproduction — `node .claude/gsd-core/bin/gsd-tools.cjs query uat.classify-coverage --summary .../01-13-SUMMARY.md`
  found: Reproduces exactly as reported. `mode: coverage`, `total: 8`, `all_auto_covered: false`. D1..D7 in `auto_passed`; D8 in `present` with `reason: validation_failed`. errors[] contains exactly one entry: index 7, id D8, code invalid_kind, field verification[1].kind.
  implication: Deterministic, single-error Bohrbug. The tool binary must be invoked from the main checkout — the worktree does not carry the untracked `.claude/gsd-core/` install.

- timestamp: 2026-08-24
  checked: /home/pogorelov/projects/bots/gsmbot/.claude/gsd-core/bin/lib/coverage.cjs lines 64-66
  found: `const VALID_KINDS = Object.freeze(['unit','integration','e2e','automated_ui','manual_procedural','other'])`. `manual` is absent. validateEntry pushes INVALID_KIND for any verification item whose `kind` is not in that list.
  implication: The validator is behaving as designed. `manual_procedural` — the nearest allowed value, sharing the `manual` prefix — already covers the intended meaning.

- timestamp: 2026-08-24
  checked: coverage.cjs auto-pass gate documentation and implementation
  found: Auto-pass requires FOUR conditions: zero validation errors, strict-boolean `human_judgment: false`, a NON-EMPTY verification list, and every verification status === 'pass'. `kind` is NOT itself an auto-pass criterion. The module header states the fail-safe asymmetry: "a structurally surprising entry degrades to `present` + an error".
  implication: D8 satisfies three of the four conditions. Only the zero-errors clause fails, and it fails solely because of line 127. Correcting the enum is sufficient to flip D8 to auto_passed — no other edit is needed.

- timestamp: 2026-08-24
  checked: Full sweep — `grep -rn "kind:" .planning/` filtered against the allowed enum
  found: 74 total `kind:` occurrences in .planning/. Exactly ONE is an out-of-enum coverage kind: 01-13-SUMMARY.md:127 `- kind: manual`. Every other non-matching hit is TypeScript discriminated-union prose, not coverage schema: 01-RESEARCH.md lines 260, 261, 398, 403, 404 and 01-05-PLAN.md line 109 (`{ kind: "resolved" | "ambiguous" | "failure" }` etc.).
  implication: The defect is a single isolated instance, not a systemic pattern. Distribution of valid coverage kinds across the tree: unit 34, integration 28, other 5, manual 1.

- timestamp: 2026-08-24
  checked: classify-coverage run against all 14 phase-01 SUMMARY files
  found: 01-13 is the only file with any validation error (errors=1). Results — 01-01 coverage/0 entries/all_auto=true; 01-02 3/false/0 errors/1 present; 01-03 2/true; 01-04 2/true; 01-05 mode=LEGACY (no coverage block at all); 01-06 2/true; 01-07 3/true; 01-08 3/true; 01-09 3/false/0 errors/1 present; 01-10 3/true; 01-11 5/true; 01-12 8/true; 01-13 8/false/1 error/1 present; 01-15 1/true.
  implication: Confirms a single defect. The two other non-auto files are INTENTIONAL human checkpoints with zero validation errors, not the same bug — 01-02 D3 has `verification: []` + `human_judgment: true` (a real Telegram group test), and 01-09 D3 has `status: unknown` + `human_judgment: true`. Both are correct schema usage.

- timestamp: 2026-08-24
  checked: /home/pogorelov/projects/bots/gsmbot/.claude/gsd-core/templates/summary.md lines 58 and 188
  found: Line 58 carries the inline enum comment `# unit | integration | e2e | automated_ui | manual_procedural | other`; line 188's field-semantics table repeats it verbatim. Neither mentions `manual`.
  implication: The template is correct and unambiguous. The author shortened `manual_procedural` to `manual` while writing the SUMMARY rather than following a bad instruction — an artifact-authoring slip, not a template defect. No cross-project fix is warranted.

- timestamp: 2026-08-24
  checked: Semantic intent of D8 verification[1] — 01-13-SUMMARY.md acceptance-criteria row 4 (line 253), Deviation 5 (lines 205-211), and `grep -n COVERAGE tests/integration/chat-readiness.e2e.test.ts`
  found: D8's description bundles two halves. Half (a) "no undocumented external Telegram surface" IS asserted by the e2e test (verification[0]). Half (b) "every COVERAGE.md INTEGRATE row names its handler and test" is NOT asserted anywhere — the only occurrence of COVERAGE in the 753-line test file is a code COMMENT on line 26 ("Every Telegram method this phase is allowed to call (COVERAGE.md INTEGRATE rows)"). Deviation 5 records the author hand-filling all 13 rows.
  implication: verification[1] genuinely is a human-followed document inspection with a mechanical pass/fail — precisely `manual_procedural`. `other` (5 precedents in this phase) is defensible but less precise: in this phase `other` is used for command invocations such as "npm ls --depth=0 and exact-root manifest check", not for human document inspections.

- timestamp: 2026-08-24
  checked: Adjacent artifacts — 01-05-SUMMARY.md coverage block, phase file listing
  found: 01-05-SUMMARY.md has NO `coverage:` key, so classify-coverage returns `mode: legacy` and falls through to prose extraction. Separately, `01-14-PLAN.md` exists with no corresponding 01-14-SUMMARY.md.
  implication: Two ADJACENT gaps, out of scope for this defect and deliberately not folded into it. Both deserve their own tracking items; neither causes the D8 invalid_kind error.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: `.planning/phases/01-chat-readiness/01-13-SUMMARY.md` line 127 declares `- kind: manual` on the second verification item of coverage entry D8. `manual` is not in the classifier's VALID_KINDS enum (`unit, integration, e2e, automated_ui, manual_procedural, other` — coverage.cjs:64-66); it is a shorthand of the intended `manual_procedural`. Because the auto-pass gate requires ZERO validation errors, this single out-of-enum literal demotes the entire D8 entry to `present` with `reason: validation_failed`, discarding the fact that D8 otherwise meets every auto-pass condition (strict `human_judgment: false`, non-empty verification, both statuses `pass`).
fix: (not applied — goal is find_root_cause_only)
verification: (n/a — diagnosis only)
files_changed: []
