# Phase 4 continuation snapshot — 2026-09-12

All paths below are relative to the repository root. Read the current files before relying on this snapshot.

## Source of truth

Directory: `.planning/phases/04-replanning-and-rehearsal-lifecycle/`

- `04-UAT.md`: current subcases, user dispositions and counts.
- `04-LIVE-TEST-2026-09-12.md`: long-name test and third-account waiver.
- `04-LIVE-TEST-2026-09-11.md`: deleted draft, group migration fix and admin-demotion evidence.
- `04-LIVE-TEST-2026-09-10.md`: two-account lifecycle and real 31-minute cooldown evidence.
- `04-UAT-RUNBOOK.md`: detailed procedures; its older scope restrictions are historical.
- `04-VERIFICATION.md`: original requirements and code assessment; its pending human list predates the later acceptances.

## Recorded scope and decisions

Test group: `GSM_bot_test_group`. A is owner `@greensmilemind` (display name Валерій Погорєлов); B is ordinary member `@greenvaleratest` (original first/last name Valeriii / Phorielov). Only A/B are test actors. Other group members are not consenting test accounts and are not automatically bot roster members.

The group migrated from basic-group Bot API ID `-5576109925` to supergroup Bot API ID `-1004358185686`; Telegram Web K displayed peer `-4358185686`. These are different identifier namespaces. Verify the group in the UI; do not use the old ID to recreate setup. Migration defect G-04-2 was fixed in `e5dcc27`; stale-announcement defect G-04-1 was fixed by Plan 04-06. Both have live closure evidence.

The user explicitly accepted release without tests requiring a third account. Never request account C as a release prerequisite. This waiver does not cover other residuals. P01–P14 were individually accepted; do not ask them again.

The user authorized one specially created card deletion and temporary B administrator promotion/demotion followed by restoration. Both scenarios were executed; this is not permission for unlimited deletions or unrelated role changes. The user also authorized the B long-name test; it passed and the name was restored. Routine previously authorized A/B lifecycle tests may continue in this group. Any additional action must remain within the current user's authorization and tool policy.

## Last verified baseline, not a current-state assertion

At 00:35:36 Europe/Kyiv on 2026-09-12, `/plan_status` reported nobody planning. A/B were the roster; B's original Telegram and bot roster names were restored. No settings or rights changed during that run. Earlier baseline settings were Europe/Kyiv, Wed, 14:00, duration 120 minutes, daily 10:00–21:00, reminders 10:00/16:00, Admins only. One local Compose bot and preserved PostgreSQL were used. Recheck live state before the next mutation.

## Remaining work at this snapshot

| Group | Disposition | Residual |
|---|---|---|
| H1 | Passed in accepted two-account scope | Third-person variants waived; long-name/block/reversal passed |
| H2 | Partial | Actual notification prominence; observable cooldown and message correction already passed |
| H3 | Client-blocked | Native use of retained stale keyboards; Web removes them; automated tests are separate |
| H4 | Partial | Notification prominence; state matrix, ordinary refusals and admin demotion already passed |
| H5 | Partial | Booked-card deletion and retained-inline failed-edit recovery; deleted-draft recovery already passed |
| H6 | Partial | Exact end boundary, ended BOOKED history, Sunday/Monday rollover, exhausted-day and relevant timezone variants |
| H7 | Passed | All 14 individual user dispositions recorded |
| 8 | Passed | Group migration recovery |

Counts: 3 of 8 passed, 4 pending, 1 client-blocked, 0 open product defects. This is grouped acceptance, not a claim that only three scenarios work. Inspect current UAT for changes. If a residual is infeasible, give the user the concrete coverage and limitation for a scoped acceptance decision; never silently waive it.

## Telegram Web interaction lessons

- Account selector: top-left menu, then account entry. Labels can gain unread counts or be truncated after renaming; use a fresh visible DOM instead of assuming an empty button name.
- After switching accounts, open the group from its visible chat-list link. Only then resolve the composer. There can be two contenteditable elements; inspect the active chat's `data-peer-id` and use it to scope the composer when present. Do not blindly fill the first contenteditable.
- Typical controls include Confirm rehearsal, Can attend, Cannot attend, Replan, Cancel rehearsal, Change date or time, Yes/Keep. Labels may contain emoji. Use the exact current label and current card; old cards may remain in the DOM.
- Commands: `/plan`, `/plan_status`, `/plan_cancel`, `/plan_change`, `/settings`, `/roster`. `/roster_add` must reply to the intended member's message. Verify the reply preview before sending.
- Bot roster names are persisted. Changing a Telegram profile or sending `/plan_status` alone did not refresh the stored name. A reply-based `/roster_add` to the already-active B updated identity without adding a duplicate. Use the same method after profile restoration when such a test is authorized.
- Name editing was under Settings → menu → Edit Profile. Record first and last fields separately, save, verify. Tested literal name: `Valeriii <Test> & Very Long Rehearsal Participant Phorielov LongName [QA] _literal_`. The name test is already complete; do not repeat by default.
- Stale keyboard removal and no Web K location attachment were observed client limitations. Do not force these through hidden APIs. A rendered Web message does not prove an OS push/sound.

## Local tooling portability

Use installed tools found on the current host. On the previous Windows host, Node was `C:/Program Files/nodejs/node.exe`, Docker was under `C:/Program Files/Docker/Docker/resources/bin`, and Git under the Codex cached runtime. These are fallback hints, not required paths. PowerShell diagnostics may need Windows/System32 on PATH. `rg` was unavailable; scoped Get-ChildItem/Select-String was used, excluding generated sources.

The GSD CLI was `.codex/gsd-core/bin/gsd-tools.cjs`; other installations may use `.claude/gsd-core/bin/gsd-tools.cjs`. Use the installed workflow's resolver. Never read credentials into tool output. There is no need for a browser automation script, raw Bot API replay or database reset to resume this skill.
