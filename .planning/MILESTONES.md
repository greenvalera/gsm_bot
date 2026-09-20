# Project Milestones: GSMBot

## v1.1 Localization and Ukrainian (Shipped: 2026-09-20)

**Delivered:** A complete Ukrainian Telegram interface with a durable, administrator-controlled per-group language, localized reminders in both streams, and retained English behavior throughout.

**Phases completed:** 6-8; 18 executable plans and 18 summaries; 42 recorded tasks.
**Requirements:** 17/17 satisfied (LANG-01-06, TEXT-01-04, LREM-01-02, LFMT-01-02, L10N-01-03).
**Closeout:** verified_closeout. All three phases carry `phase_complete: true` and `verification_status: passed`; the pre-close artifact audit reported no open items. Known verification overrides: 0 newly acknowledged, 12 carried forward from a prior close (see STATE.md Deferred Items).
**Audit:** status `tech_debt` - no blockers, cross-phase integration sound with zero broken connections, 3/3 E2E flows complete. See [audit](milestones/v1.1-MILESTONE-AUDIT.md).

**Key accomplishments:**

- Settings now reads independent chat language preferences from migrated PostgreSQL and renders a typed English or Ukrainian language row.
- Administrators can select English or Ukrainian before configuration, change language through settings, and continue their own setup draft without resetting its values.
- The complete setup wizard now renders English or Ukrainian from typed catalogs, retaining valid drafts and showing the current group language after each transition.
- Settings now render the current group language through edits, reviews, timezone lookup and recovery while preserving valid confirmations and schedule revisions across language changes.
- Roster pages and add/remove interactions now render the current group language while preserving member identity, action validity and exactly-once acknowledgement.
- English and Ukrainian preferences now move atomically with group migration, while database guards prevent delayed language selections from recreating retired identities.
- Onboarding boundaries now reply in the current group language, with real PostgreSQL flows proving bilingual setup and state-preserving language switches.
- Consumed planning selections now acknowledge in the durable group language, with separate safe-retry and committed-card-recovery messages.
- Planning cards now use Ukrainian civil-date labels, grammatical bilingual durations, and authoritative 24-hour ranges that survive DST and later timezone changes.
- Day, time, review and availability cards now render complete Ukrainian planning copy and live controls while preserving English output, token authority and durable participant snapshots.
- Readiness, manual booking, replanning, cancellation and recovery now render Ukrainian lifecycle facts and controls while retaining English behavior, current authority and durable announcement rules.
- Planning instructions, denials and recovery now resolve the current group language while retaining durable authority, result precedence and one delivered callback acknowledgement.
- Repeated planning selections and availability answers now repaint text and controls in the current group language without changing durable planning state or announcement entitlement.
- Durable planning reminders resolve the current chat locale before rendering, with Ukrainian calendar ranges and unchanged start capabilities.
- Pending reminders use the current chat language, the saved round timezone and authoritative end instant, while preserving durable claims and all real mention destinations.
- Real PostgreSQL tests prove language switches preserve reminder identity, recovery eligibility, current authorization, pending snapshots and consumed uncertain sends.
- Migrated-chat recovery uses the destination language; AST checks reconcile 477 output sites and strict samples verify all 222 English/Ukrainian catalog keys.
- The pruned Node 24.19 image verifies both catalogs and Ukrainian ICU as UID 999; 48 new bilingual handler cases close the explicit evidence handoff, and all full-suite failures have scoped passing correction reruns.

**Stats:**
- 3 phases; 18 plans (7 + 6 + 5); 42 recorded tasks.
- 83/83 must-haves verified across the three phase VERIFICATION reports, 0 behavior_unverified, 0 overrides applied.
- 67 handwritten source TypeScript files / 47,286 lines and 100 test files / 56,075 lines in the closing working tree, excluding generated code.
- Committed range v1.0 through HEAD: 182 commits, 178 files changed, 38,989 insertions and 2,035 deletions, including planning artifacts.
- Timeline: 2026-09-15 through 2026-09-20, 6 elapsed calendar days.

**Evidence limits:** Native UAT covered three scenarios; the historical morning-planning/Start waiver remains recorded as `skipped` with its reason, so Ukrainian planning-start wording is unobserved by design and is not claimed as passed. Phone-notification observation remains non-blocking and unobserved. The integration suite requires Testcontainers/PostgreSQL and was inspected rather than executed during the milestone audit; the unit suite ran clean (46 files, 757 tests). No public release or production deployment beyond the existing test service is claimed.

**Remaining debt:** Phase 8 has no VALIDATION.md (Nyquist coverage TODO) and its SUMMARY `requirements-completed` frontmatter was never reconciled after acceptance; four reminder-renderer maintenance findings are unreached in production. See [audit](milestones/v1.1-MILESTONE-AUDIT.md) and [backlog](BACKLOG.md).
**Archives:** [roadmap](milestones/v1.1-ROADMAP.md), [requirements](milestones/v1.1-REQUIREMENTS.md), [phase evidence](milestones/v1.1-phases/).
**Next:** Define the next milestone via /gsd-new-milestone.

---

## v1.0 Rehearsal Coordination (Completed: 2026-09-15)

**Delivered:** The complete Telegram rehearsal-coordination loop through manual booking, with durable state and useful reminders.

**Phases completed:** 1–5; 66 executable plans and 66 summaries.
**Requirements:** 43/43 dispositions (42 functional requirements plus PLAN-09 scope removal/replacement).
**Closeout:** override_closeout; the user selected completion after the tech-debt audit. Known verification overrides: 12 newly acknowledged artifact records, 0 carried forward from a prior close; 3 additional scanner flags resolved from existing evidence. See STATE.md Deferred Items and [closeout detail](milestones/v1.0-CLOSEOUT.md).

**Key accomplishments:**

- Persistent administrator-managed settings, timezone, access policy and band roster.
- Authorized week-aware planning with hourly slots, roster snapshots, takeover and restart recovery.
- Custom availability cards, pending/available/unavailable responses, unanimous readiness and manual booking.
- Safe replanning, date/time changes, cancellation, stale-button handling and prior-rehearsal defaults.
- State-aware planning and pending-member reminders with publication grace, spacing, durable recovery and obsolete-work suppression.
- Single-worker runtime and canonical chat migration with guarded schema deployment and recorded regression/security evidence.

**Stats:**

- 5 phases; 66 plans (30 + 11 + 9 + 6 + 10). The CLI's 67 includes a non-executable Phase 5 plan-check report.
- 137 recorded tasks from 64 summaries with usable task counts; 2 summaries lack a count. This is a partial metadata total, not a complete task census. The CLI's narrower parser reports 101.
- 38 handwritten source TypeScript files / 19,822 lines in the closeout working tree, excluding generated code.
- Committed range 6e6dce7 through c6e4a23: 422 files changed, 140,131 insertions and 38 deletions, including planning artifacts.
- Timeline: 2026-08-19 through 2026-09-15, 27 elapsed calendar days.

**Evidence limits:** Scoped native waivers remain valid. No fresh full-tree test run, public release or additional deployment is claimed. The local tag records committed history; pre-existing uncommitted application/tooling edits are excluded.

**Remaining debt:** [Audit](milestones/v1.0-MILESTONE-AUDIT.md) and [backlog](BACKLOG.md).
**Archives:** [roadmap](milestones/v1.0-ROADMAP.md), [requirements](milestones/v1.0-REQUIREMENTS.md), [phase evidence](milestones/v1.0-phases/).
**Next:** Define the next milestone via /gsd-new-milestone.
