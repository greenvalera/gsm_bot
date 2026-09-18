# Phase 8 Native Acceptance Runbook

Prepared 2026-09-19. **Not executed. No native result or wording acceptance is pre-recorded.**

Use during a later `/gsd-verify-work 8` session with [telegram-web-uat](../../../.codex/skills/telegram-web-uat/SKILL.md). Follow D-13, D-14, D-15 and D-16: explain one explicit expected condition before its actions; observe the actual Telegram result; ask for Ukrainian wording acceptance or a correction immediately after that scenario. Do not batch the questionnaire or infer subjective acceptance from automated string matches.

## Preconditions and baseline

Read current UAT, latest dated live evidence, Phase 8 verification and `08-AUTOMATED-EVIDENCE.md`. Record exact running bot source revision and image ID; they must match the automated evidence's source snapshot (including any relevant dirty diff). A tag or successful earlier build alone is insufficient. This runbook does not authorize deployment. If the running version differs, record the mismatch and await an authorized runtime update before acceptance.

Use the supported browser integration available in the current agent runtime. Inspect the signed-in account and intended test group through visible Telegram UI. Use one existing polling worker and keep existing database history. No fabricated callbacks, direct Telegram API simulation, browser hidden-state reads, clock manipulation or second polling worker.

Capture before changing anything:

- Date/time and local timezone; current account, group and group type.
- Current roster identities and roles; active plan, selected slot/timezone and answers (or explicitly no active plan).
- Selected language; complete schedule, reminder times and planning access policy.
- Existing current card, relevant visible controls and whether an authorized normal pending/planning occurrence can actually happen.

Do not overwrite an unexpected existing plan or alter settings to invent an occurrence outside current authorization. Use normal visible commands and buttons. Keep earlier accepted Phase 6/7 wording unless the new reminder or language-switch implementation actually affects it.

## Scenario 1 — Queued planning reminder after en→uk

**Before actions, explain the expected condition:** an already eligible planning occurrence queued while English was selected must use the subsequently saved Ukrainian preference at its normal send. It must show the actual target week, one sentence and the existing start control. No mention or extra send is introduced; schedule and round state do not change merely because language changes.

**Feasibility gate:** Phase 5 waived morning planning reminder and Start native variants because of their time cost. Retain this waiver exactly. Observe this scenario only if there is a currently authorized feasible occurrence; do not schedule a forced morning test, unpause the prior morning UAT automation or manufacture delivery. Otherwise record **waived — existing morning/Start native waiver**, plus **new Ukrainian planning wording not observed**. Automated date and delivery checks support behavior but do not erase this wording-observation gap.

When feasible, record the baseline eligible occurrence, change English to Ukrainian using `/settings` → `Мова / Language` → `Українська`, and wait for its normal delivery. Compare the actual authoritative target week with:

> Час запланувати репетицію на 21–27 вересня.
>
> Почати планування

The date is illustrative: use the real week. Same-month form is `21–27 вересня`; cross-month form is `28 вересня – 4 жовтня` (D-01–D-04). Observe either natural date variant only when feasible; both variants have automated coverage. Do not mark an unobserved variant passed. If an already-authorized Start action is feasible, use the real button and check existing permissions/planning flow; otherwise preserve the original Start waiver.

**Immediately record:** observed text/button, actual dates, delivery count and unchanged schedule; behavior pass/fail/waived/unobserved; user's exact Ukrainian wording response (accepted/requested correction/not observed). Stop for an actionable correction rather than postponing all wording review.

## Scenario 2 — Ukrainian pending reminder and current-card navigation

**Before actions, explain the expected condition:** for a normal eligible rehearsal with at least one pending selected participant, the reminder must use Ukrainian, retain all and only currently pending user-ID links in existing order, and lead to the existing current availability card. The rehearsal date/time and saved timezone remain authoritative.

Leave at least one authorized participant pending using actual visible controls in a test-created rehearsal or a currently authorized existing scenario. Observe the next normal eligible reminder without manipulating clocks or claims. Expected copy (replace date, time, timezone and labels with real values):

> Репетиція — понеділок, 21 вересня, 19:00–21:00 (Europe/Kyiv).
> Нагадаймо про репетицію: [all pending participant links] — дай знати, чи зможеш прийти.

These are D-05–D-08: weekday/month in Ukrainian, 24-hour range, no repeated duration/year, timezone directly after the range; inline comma-separated real mentions, not illustrative @names. Verify no available/unavailable or unrelated roster member appears. Native line wrapping is acceptable. Follow the private-supergroup link `Відповісти щодо репетиції` (D-09), confirm the destination is the current card, and use its real answer button only when authorized.

**Group variants:** unavailable basic-group and public-supergroup navigation variants retain the exact Phase 5 waiver; do not call them passed and do not extend it to Ukrainian pending copy or the available private-supergroup path. If already feasible and authorized, a basic-group reminder replies to the card and has separate lines:

> Щоб відповісти щодо репетиції, відкрий картку, на яку відповідає це повідомлення.
> Не знаходиш картку? Скористайся /plan_status.

A feasible public supergroup uses its existing direct destination with `Відповісти щодо репетиції`. Do not create/migrate groups merely to lift waived variants. All routing variants remain required automated coverage.

**Immediately record:** actual reminder copy, pending set/order, link/reply destination and card behavior; behavior result; user's Ukrainian wording acceptance or requested correction. Phone push/sound is **unobserved and non-blocking** unless separately observed on the user's phone; Web delivery does not prove it.

## Scenario 3 — uk→en before the next normal reminder

**Before actions, explain the expected condition:** switching to English affects the next eligible reminder, preserves retained English copy, and changes no schedule, due time, occurrence identity, round, participant answer or permission. Unknown-delivery outcomes are not retried merely because language changed.

Capture current card/answers and visible settings; change via `/settings` → `Мова / Language` → `English`. Observe the next naturally eligible reminder only. Compare its complete body and navigation with the retained English catalog projection for that actual occurrence. No copied historical card is evidence of a new delivery; record the actual new message/time. Confirm pending-only links and navigation still work. If no authorized occurrence is feasible, leave this new check pending/unobserved; the morning waiver does not waive all later language-switch reminder behavior.

**Immediately record:** English output and destination, before/after state/timing evidence, behavior result, and user's response. Ukrainian wording is not newly evaluated in the English output; record that distinction explicitly.

## Scenario 4 — en→uk and next normal card update

**Before actions, explain the expected condition:** switching back to Ukrainian preserves current valid controls and existing answers; the next ordinary card update changes body and buttons together. It does not recreate the plan, clear answers or change who can act.

Capture active card, answers and control identities. Switch English to Ukrainian through settings. Use a currently valid, authorized normal availability action or `/plan_status` recovery, according to the existing plan state. Compare full text and keyboard in Ukrainian; verify previously stored answers and authoritative date/time remain valid, and no second acknowledgement/error appears. Do not fabricate a stale control if Telegram removed it; record that native limitation with automated evidence separately. Repeat prior planning/lifecycle scenarios only if implementation impact justifies it.

**Immediately record:** action, full resulting body/buttons, retained answers/controls, behavior result and user's Ukrainian wording acceptance/correction. Phase 7 H4 remains its historical **unclassifiable** disposition because no acceptance condition existed; it is neither a new scenario nor a behavioral pass/waiver.

## Evidence and restore

For each scenario create a dated entry in `08-LIVE-TEST-YYYY-MM-DD.md` and update `08-UAT.md` without erasing historical outcomes:

| Field | Required record |
| --- | --- |
| Scenario and expected condition | Stated before actions |
| Runtime provenance | Source revision, relevant diff/image, match to automated evidence |
| Local date/time, account, group type | Exact observed context without secrets |
| Commands/buttons | Actual visible UI interactions |
| Observed behavior | Message text, navigation, counts and state comparisons |
| Evidence | Screenshot/visible DOM references and separately labeled read-only supporting checks |
| Behavior disposition | Pending, passed, failed, scoped waiver, or unobserved |
| Wording response | User's response immediately after this scenario; never agent-inferred |
| Correction/retest | Exact changed copy, new revision and scoped automated/native rerun if needed |
| Restoration | Original versus final fixture, residual differences |

Restore every changed language, schedule, role, profile and roster field to the baseline through the normal UI; cancel **only test-created plans**. Preserve unrelated active plans, database volume/history and messages. Verify final settings, roster and active-plan state visibly; disclose any failed restoration. Leave the historic morning automation paused. Do not treat phone notification prominence/sound as blocking, passed, or a new scheduled task.

Current status: all four scenarios are **not run**. Historical waivers retain their exact scope; no new waiver, deployment, runtime change or native acceptance is created by this document.
