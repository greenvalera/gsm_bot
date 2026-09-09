# Phase 4 — UI Review

**Audited:** 2026-09-09
**Baseline:** Phase 04 CONTEXT decisions and plans; no UI-SPEC.md
**Mode:** Telegram code-only interaction audit
**Screenshots:** Not captured. This application has no web frontend; native Telegram owns rendering. No Telegram account, external messages, browser, or app access was used. Dev-server detection and screenshot-storage setup were not applicable to this bounded audit; no screenshot directory was created.
**needs_human_review:** true

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4, code only | Named lifecycle confirmations, explicit same-week scope, and distinct historical-state advice; obsolete booking finality copy corrected during review. |
| 2. Visuals | N/A | Text hierarchy and row declarations inspected; actual native-client presentation unverified. |
| 3. Color | N/A | Telegram client controls palette, theme and accent distribution. |
| 4. Typography | N/A | Bot supplies HTML emphasis; Telegram controls font sizes, font family and accessible scaling. |
| 5. Spacing | N/A | Bot declares line breaks and keyboard rows; Telegram controls padding and rendered dimensions. |
| 6. Experience Design | 2/4 | Buried command confirmations, silent confirmation-edit failure, and acknowledgements delayed behind Telegram edits. |

**Overall: N/A /24. Applicable code-only subtotal: 6/8.** Client-owned pillars are excluded, not awarded automatic passing points. Experience defects need remediation; this is not live Telegram approval.

## Top 3 Priority Fixes

1. **Handle confirmation delivery failure** — a deleted control message leaves `/plan_cancel` or `/plan_change` without reachable confirmation buttons or failure advice — inspect the edit result and recover a fresh tracked confirmation or give an explicit recovery instruction. Preserve fresh authorization and one lifecycle control surface.
2. **Make command confirmations visible near the command** — a successful command currently edits a potentially days-old message silently — post/reanchor a fresh confirmation for command entry, or provide a visible navigable response. Preserve in-place confirmation for inline entry and D-11 control placement.
3. **Acknowledge successful callbacks before message delivery** — slow Telegram edits keep the spinner running unnecessarily — move the single empty acknowledgement to the beginning of each successful result branch, after the domain outcome is known, before editing/posting. Keep private refusal alerts as the sole acknowledgement on refusal branches.

## Detailed Findings

### Pillar 1: Copywriting (4/4, code only)

- **PASS:** Cancellation names the selected civil date/time, and Change names the same slot while stating that everyone answers again within the same week. Cross-week planning instructions explicitly say to cancel and send `/plan` (`src/telegram/planning-renderers.ts:613`, `:623`, `:634`). Generic draft wording is appropriate when no day has been selected.
- **PASS:** Blocked text states that the slot does not work, identifies unavailable members without blame, and names who can Replan (`src/telegram/planning-renderers.ts:687`, `:692`, `:697`). Terminal supersession points to `/plan_status`; cancellation has its own settled wording (`:608`, `:667`; `src/telegram/planning-handlers.ts:122`, `:125`).
- **CORRECTED WARNING UI-01:** Booking confirmation previously claimed the round closed “for good” and nothing could take it back, contradicting Phase 04 lifecycle controls. Commit `e9a0577` replaces that sentence with “Recording it marks this rehearsal as booked.” Current code verified at `src/telegram/planning-renderers.ts:790`. Root reports 34 renderer unit tests and scoped formatting passing for this correction; this auditor did not rerun them.
- The score assesses strings and their state mapping only. Tone, clarity under real chat traffic, and assistive-technology presentation remain human judgments.

### Pillar 2: Visuals (N/A)

- Bot-controlled hierarchy is present: bold status/date headings, a separate answer count, stable participant order, and a distinct italic legend (`src/telegram/planning-renderers.ts:514`, `:554`, `:559`, `:564`). All lifecycle controls have text labels; they are not icon-only controls (`src/telegram/keyboards.ts`, `PLANNING_LIFECYCLE_ROWS`).
- **HUMAN REVIEW:** Check long names, a realistic full lineup, the blocked announcement, and confirmation rows on narrow phones and desktop Telegram. Code-level row/label tests cannot establish absence of truncation, confusing scrolling, or adequate notification prominence.

### Pillar 3: Color (N/A)

- No Phase 04 CSS, Tailwind palette, or application theme exists. Telegram determines message/button colors. A 60/30/10 ratio and hardcoded-color counts would be meaningless here.
- Availability glyphs are paired with a textual legend and text-labelled answer controls (`src/telegram/planning-renderers.ts:500`; `src/telegram/keyboards.ts`, `PLANNING_AVAILABILITY_ROWS`). Verify their readability across native light/dark themes during UAT.

### Pillar 4: Typography (N/A)

- HTML bold headings and italic legends are the authored emphasis; there is no bot-controlled size/weight scale to count (`src/telegram/planning-renderers.ts:514`, `:546`, `:554`, `:687`).
- **HUMAN REVIEW:** Exercise Telegram's larger text settings and a screen reader. No code-only assertion proves native reading order or glyph pronunciation.

### Pillar 5: Spacing (N/A)

- Day selectors declare 4/3 rows; default time selectors declare 3/3/3/1 rows. Lifecycle actions and confirm/keep choices occupy separate rows (`src/telegram/keyboards.ts`, `PLANNING_DAY_ROW_SIZES`, `PLANNING_SLOT_ROW_SIZES`, `PLANNING_CANCEL_CONFIRM_ROWS`, `PLANNING_CHANGE_CONFIRM_ROWS`). `tests/unit/planning-keyboards.test.ts:66`, `:99`, `:196` inspect serialized keyboard structure.
- There is no app-owned pixel/rem spacing scale. Native button padding, hit targets and wrapping remain unverified. No spacing defect is invented from the absence of CSS.

### Pillar 6: Experience Design (2/4)

- **WARNING UI-02 — Silent confirmation delivery failure:** `showCancellationConfirmation` and `showChangeConfirmation` ignore `editRoundMessage`'s `failed` result (`src/telegram/planning-handlers.ts:3068`, `:3487`; helper returns failure at `:1457`). With an existing but deleted/uneditable control-message ID, neither helper posts a fallback, and the command's offered branch gives no error response (`:3140`, `:3559`). The requested confirmation is unavailable through that command attempt. This is code-proven error-path loss, not a claim that every lifecycle path is blocked: `/plan_status` is a possible separate recovery route. Add failure-result handling and focused transport tests for confirmation opening, rather than only for terminal edits.
- **WARNING UI-03 — Buried command confirmation:** Even a successful edit stays on the old control message. Command handlers issue no new visible acknowledgement or navigation on their offered branch (`src/telegram/planning-handlers.ts:3140`, `:3559`). D-10 explicitly motivates commands as the surface for rehearsals buried by days of chat traffic. Editing old content alone does not meet that discovery intent. Verify the proposed command recovery in a real busy test group. Do not treat missing BotFather menu registration as this defect: menu configuration is operator-managed and commands are registered in the application.
- **WARNING UI-04 — Delivery delays callback acknowledgement:** Cancel offered/kept/cancelled branches and Change offered/kept branches await message delivery before their single acknowledgement (`src/telegram/planning-handlers.ts:3220`, `:3262`, `:3290`, `:3639`, `:3681`). The cancelled path may perform two edits and a group post before clearing the spinner. Change apply already acknowledges before successor delivery (`:3700`). Apply that sequencing to the other successful branches after domain decisions. Do not add a blanket dispatcher acknowledgement: private refusal alerts must remain deliverable, as the existing dispatcher commentary explains at `:978`.
- **PASS:** Cancel and Change have explicit confirm/keep pairs; terminal cancellation and supersession remove controls. Both availability responses survive blocked state. Declining lifecycle confirmations restores applicable controls. Integration suites cover cancellation across lifecycle states, demoted-admin refusal, replay, both-message correction, and normalized replan/change replacement effects (`tests/integration/planning-cancel-telegram.test.ts:394`, `:463`, `:488`, `:551`, `:583`; `tests/integration/planning-change-telegram.test.ts:342`, `:550`). These tests were inspected, not rerun by this audit.
- **ACCEPTED LIMITATIONS:** Same-week change is explicit; today's whole-day selectability may still lead to a time selector with all hours unavailable. The UAT runbook records this residual honestly. Best-effort terminal-message correction after durable cancellation/supersession is distinct from the missing confirmation-open recovery above. `/plan_status` may recover an older booked rehearsal after cancellation; its dated heading requires real-client inspection.

## Human Verification Still Required

Run `04-UAT-RUNBOOK.md` in a test group after remediation. Observe old cards beneath newer traffic, both commands and inline entry, cancellation notification prominence, stale private alerts, long names, narrow screens, large text, and loss of a control message before confirmation. No live check is recorded as passed by this review. No full test suite was rerun or external message sent.

## Files Audited

- `AGENTS.md`
- `.codex/skills/gsd-ui-review/SKILL.md`
- `.codex/gsd-core/workflows/ui-review.md`
- `.codex/gsd-core/references/ui-brand.md`
- `.codex/gsd-core/references/agent-skills-bootstrap.md` and `.planning/config.json` (no configured auditor skills)
- `.planning/phases/04-replanning-and-rehearsal-lifecycle/04-CONTEXT.md`
- Phase 04 plans 01–05 and available execution summaries 01–04 (Plan 05 was finishing independently during audit)
- `.planning/phases/04-replanning-and-rehearsal-lifecycle/04-UAT-RUNBOOK.md`
- `src/telegram/planning-renderers.ts`
- `src/telegram/keyboards.ts`
- `src/telegram/planning-handlers.ts` (lifecycle dispatch, delivery, recovery and refusal sections)
- `src/telegram/handlers.ts` (route scan)
- `tests/unit/planning-availability-card.test.ts`
- `tests/unit/planning-keyboards.test.ts`
- `tests/integration/planning-cancel-telegram.test.ts`
- `tests/integration/planning-change-telegram.test.ts`
- `tests/integration/planning-replan-telegram.test.ts`

Registry audit was inapplicable: no `components.json`, third-party UI registry, or UI-SPEC exists.

**Recommendation count:** 3 open priority warnings; 1 corrected warning; 0 established blockers. Native rendering and notification checks remain human verification work, not additional invented defects.
