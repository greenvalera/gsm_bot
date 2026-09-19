---
phase: quick
plan: 260919-fsg
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/08-localized-reminders-and-bilingual-verification/COVERAGE.md
autonomous: true
requirements: [LREM-01, LREM-02, L10N-02, L10N-03]
must_haves:
  truths:
    - Phase 8 has a source-grounded record of used and deliberately excluded external API capabilities.
    - The enabled api-coverage.verify-pre gate accepts the matrix without changing product scope or native acceptance results.
  artifacts:
    - path: .planning/phases/08-localized-reminders-and-bilingual-verification/COVERAGE.md
      provides: Telegram API capability decisions with implementation and scope evidence
  key_links:
    - from: COVERAGE.md
      to: api-coverage.verify-pre
      via: canonical capability/decision/reason table
---

<objective>
Repair the missing Phase 8 API coverage artifact so native verification can resume. This documentation task records existing implementation and scope decisions; it does not introduce API capabilities or claim native acceptance. Phase 8 currently has four pending scenarios and remains human_needed.
</objective>

<context>
@.codex/gsd-core/references/api-coverage.md
@.codex/gsd-core/workflows/verify-work.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/08-localized-reminders-and-bilingual-verification/08-CONTEXT.md
@.planning/phases/08-localized-reminders-and-bilingual-verification/08-VERIFICATION.md
@.planning/phases/08-localized-reminders-and-bilingual-verification/08-AUTOMATED-EVIDENCE.md
@.planning/phases/08-localized-reminders-and-bilingual-verification/08-UAT.md
</context>

<tasks>
<task type="auto">
  <name>Document the existing Phase 8 Telegram API surface and exclusions</name>
  <files>.planning/phases/08-localized-reminders-and-bilingual-verification/COVERAGE.md</files>
  <action>Inspect actual reminder-service, reminder-renderers, migration transport and outbound-inventory call sites plus Phase 8 evidence. Write English documentation with the canonical capability, decision, reason table. Give each capability a unique nonempty name and INTEGRATE or OPT-OUT decision. Link integrated rows to concrete current source/evidence; explain which existing Telegram methods, options, links and callback controls implement delivery and navigation. Document excluded capability families only with existing PROJECT, REQUIREMENTS, CONTEXT or prior scope evidence, explicitly distinguishing retained preexisting integration from Phase 8 changes. Include supported group navigation, current-language delivery, mention/escaping limits, migration and uncertain-delivery behavior where source supports them. Explain that the table describes this phase's application surface rather than claiming implementation of every Telegram method. Do not fabricate new product opt-outs or declare no external integration. Preserve D-01 through D-12 reminder behavior and D-13 through D-16 native acceptance boundaries; retain all historical waivers and 0/4 pending acceptance progress.</action>
  <verify><automated>Run the repository GSD launcher with: check api-coverage.verify-pre .planning/phases/08-localized-reminders-and-bilingual-verification</automated></verify>
  <done>COVERAGE.md contains a nonempty valid decision matrix with concrete evidence and a reason for every exclusion; the enabled API gate accepts it.</done>
</task>
<task type="auto">
  <name>Validate the actual verify-pre path and preserve acceptance status</name>
  <files>.planning/phases/08-localized-reminders-and-bilingual-verification/COVERAGE.md</files>
  <action>Use the local verify-work workflow and gate implementation to resolve the exact verify:pre invocation and validate Phase 8 with the matrix present. Correct only documentation/schema defects. Record the gate result and scope in the quick-task summary through the orchestrator. Review the diff for unrelated changes and confirm no gate toggle, runtime code, live Telegram action or acceptance result changed during this repair. Native UAT resumes separately through verify-work and telegram-web-uat, presenting scenarios one at a time per D-15 and recording user wording acceptance per D-16.</action>
  <verify><automated>Re-run the resolved verify:pre gate command; run git diff --check and inspect git diff -- .planning/phases/08-localized-reminders-and-bilingual-verification/COVERAGE.md.</automated></verify>
  <done>The real gate passes with coverage enforcement enabled; native scenarios remain pending and the repair is ready for the orchestrator's scoped commit and UAT continuation.</done>
</task>
</tasks>

<threat_model>
Documentation trust boundary: implementation evidence must not become a fabricated live result. Threat T-quick-01 (Repudiation, medium, mitigate): reference source/evidence and preserve native pending status. No package installation, secrets, outbound messages or runtime changes are required.
</threat_model>

<verification>
The canonical matrix passes the actual enabled verify-pre API coverage check. Documentation diff is scoped and whitespace-clean; automated evidence and native acceptance remain clearly separated.
</verification>

<success_criteria>
Missing coverage gate repaired without changed implementation or new scope decisions. Phase 8 can resume its four saved native scenarios without marking them passed prematurely.
</success_criteria>

<output>
Orchestrator creates 260919-fsg-SUMMARY.md with source evidence, exact validation command/result and native continuation status.
</output>
