---
name: telegram-web-uat
description: Run GSMBot acceptance tests through real Telegram Web controls, including clean-session continuation of gsd-verify-work, evidence recording and test-fixture restoration.
---

# GSMBot Telegram Web UAT

Use alongside `gsd-verify-work`, not as a replacement for its tracking workflow. This skill supports native UI testing; it does not deploy the product or mark unobserved behavior as passed. Resolve project paths from the repository root, not the current shell directory. Documentation is English; communicate with the user in Ukrainian unless requested otherwise.

## Resume from evidence

1. Read project instructions and the selected phase's `*-UAT.md`, latest live report, and verification report. Initialize/resume the installed GSD verify-work workflow. Do not restart its questionnaire or reset results.
2. For Phase 4, read [the continuation reference](references/phase-4.md). It records prior decisions and browser lessons; current UAT evidence and newer user instructions take precedence over this dated snapshot. STATE.md and the original verification report may lag the live reports.
3. Identify the remaining **subcases**, rather than treating a partially complete group as wholly untested. Report completed groups / total groups and the current subcase. Explain client limitations separately from product defects.

## Connect to Telegram

Read the browser-control skill available in the current runtime before browser actions. Follow its supported selection, setup and interaction API; do not copy a cached plugin path or browser handle from an earlier session. In Codex, discover the Node browser tool and use the browser skill's documented browser-client interface. In another agent runtime, use its available supported browser integration and equivalent visible UI interactions. If none is available, report the missing integration; do not substitute fabricated callbacks for native testing.

Honor an explicitly chosen browser. Otherwise locate the signed-in Telegram Web session according to the browser skill's selection rules. Claim an existing Telegram tab from a fresh tab listing, or open `https://web.telegram.org/k/` if no Telegram tab exists. An absent tab does not imply sign-out. Verify the current account and exact test group before sending commands. Reuse valid handles only within the live runtime; old numeric tab IDs and DOM node IDs are not portable.

Ground every action in fresh DOM or screenshot evidence. After an account switch or menu action, a second snapshot may be necessary while Telegram updates. Use semantic locators where practical and visible DOM node IDs for unlabeled menus. Do not read hidden app state, inject callbacks, alter page DOM, or use direct Telegram requests to simulate a human button press.

## Execute within scope

- A request to resume the authorized A/B test workflow covers routine test commands, answers and lifecycle cleanup in the named test group. Prior user decisions are recorded in the handoff; they are not an unlimited grant for new destructive or account-management actions. Follow current tool confirmation requirements.
- Capture the baseline relevant to the test: account, roster, active plan, settings and any property about to change. Do not overwrite an unexpected existing plan to recreate a historical fixture. Resolve unexpected state before conflicting mutations; continue independent read-only work.
- Keep the database volume and history. Use the existing local test service; never start a second long-poll worker. Inspect runtime status without printing `.env`, tokens, passwords or unrelated private chat content.
- Use actual visible buttons/commands. Browser evidence proves the observed client behavior; unit tests, integration tests and read-only database checks are supporting evidence with separate provenance.
- If Telegram removes retired keyboards, record that limitation. Do not invent a native stale-button pass. Do not change the system clock to force end-of-rehearsal or calendar-boundary cases.
- When a product defect is reproducible, record the trigger, expected/actual result and affected subcases, then enter GSD debug before code edits. Fix and retest within authorized scope. Delegate only when requested or otherwise authorized by applicable instructions.

## Restore and record

Restore every temporary setting, role, profile field and roster identity changed by the run, using the recorded original values. Cancel only the temporary plans created for that test. Confirm the resulting state through Telegram; if restoration fails, disclose exactly what remains changed. Preserve test history and do not delete messages merely for tidiness.

Write a dated `*-LIVE-TEST-YYYY-MM-DD.md` with local timezone, actor, commands/buttons, before/after behavior, supporting evidence and restoration. Update the existing UAT subcases and recompute group counts. Preserve earlier evidence as historical. A user-approved skipped variant is a waiver, not a pass; do not extend a narrow waiver to unrelated residuals. Do not infer phone sound/push prominence from a message visible in Web.

Commit only task-owned evidence through GSD. Keep `STATE.md` and the verification disposition consistent when actually closing or advancing the phase; do not claim phase completion while unresolved acceptance remains. Finish with progress, findings, restoration status and a concrete next action.
