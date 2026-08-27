# Phase 1 — Manual verification in a live Telegram group

**Purpose:** closes the blocking checkpoint `01-14-PLAN.md` Task 2 and Evidence Gap #1 in `01-VALIDATION.md`.
**Contract source:** `01-UI-SPEC.md` (sections `Interaction Contract`, `Copywriting Contract`).
**Status:** 🟥 two runs executed, both **NOT APPROVED**. Run 3 is in progress; no verdict has been recorded.
**Run 1, 2026-08-24:** NOT APPROVED — 9 findings (F-1…F-9), AC-5 failed, AC-2/AC-3/AC-4 partial. All nine findings were closed by the 01-16…01-22 wave and confirmed closed live in Run 2.
**Run 2, 2026-08-26:** NOT APPROVED — 2 **NEW** findings, **F-10** and **F-11**, both inside AC-5's own domain. AC-1/AC-2/AC-3/AC-4 pass, AC-5 stays FAIL. See "Run 2 findings" below.
**Run 3:** **in progress**. The bounded F-10 text- and location-input observations are complete; all other human rows and the verdict remain pending.

> Bot texts are quoted **verbatim in English** — that is exactly how they must be compared against the screen. Surrounding explanation is documentation prose and carries no contractual weight.

---

## 0. Preparation (one-time)

- [x] `@BotFather` → `/newbot` → save the token. Privacy mode is **left alone** (stays ON).
- [x] Create a private group.
- [x] Add the bot to the group **and make it an administrator**. Without this, `getChatMember` will not return other members' roles and Step 5 cannot work.
- [x] Add a **second live account** (not a bot) to the group — required for Steps 4 and 5.
- [x] Confirm the primary account is a group administrator.

### Environment variables

Create a `.env` file at the repository root. Docker Compose picks it up automatically from the directory holding `compose.yaml` — nothing needs to be passed on the command line.

```dotenv
# Password for the local Compose Postgres. Any value.
POSTGRES_PASSWORD=devpass

# Token of the dedicated test bot from @BotFather.
BOT_TOKEN=123456789:AA...

# Optional. "debug" when log redaction behaviour needs inspecting.
LOG_LEVEL=info
```

- [x] `.env` created and filled in.
- [x] Confirmed `.env` does **not** reach git: `git check-ignore -v .env` must print the rule from `.gitignore`.

> 🔐 `.env` holds a live bot token. It is in `.gitignore` — never add it with `git add -f`, and never paste its contents into planning evidence.

### Startup

```bash
docker compose up --build bot
```

Compose brings up Postgres, waits for the healthcheck, runs migrations, and only then starts the bot. Keep the logs open — Step 2 needs them.

- [x] The bot reported startup in the logs and began long polling.

---

## ⚠️ Two traps to know before starting

**1. Send the location only as a reply.**
The bot listens on `bot.on("message:location")` (`src/telegram/handlers.ts:201`), i.e. an **ordinary** message carrying a location. But with privacy mode enabled, a bot in a group receives only commands, service messages, and **replies to its own messages**. So in Step 2 the location must be sent **as a reply to the bot's prompt** — otherwise the update never reaches it, and it looks like "the bot froze".

**2. Restart the bot service only.**
Use **exclusively** `docker compose restart bot`. Do not run `docker compose down -v` — that destroys the `gsmbot-postgres-data` volume, which is precisely the persistence Step 2 verifies.

---

## Step 1 — Entering setup

**Action:** from the admin account send `/setup` to the group, then press `Start setup`.

**Expected:**

- Bold heading `Set up rehearsal planning`
- Body: `This chat is not configured yet.`
- Exactly **one** button `Start setup` and nothing else
- After the tap the message begins with `Setup in progress`, shows `Step 1 of 8` and the instruction to send a location

- [x] Result: ✅ PASS — observed: bold heading, body `This chat is not configured yet.`, exactly one `Start setup` button, and after the tap `Setup in progress` with `Step 1 of 8` and the instruction to send a location (2026-08-24)
- [x] Run 2 result (2026-08-26): ⬜ N/A — the chat was already configured, so the setup entry surface was not re-walked. The step passed on 2026-08-24 and no edit in the 01-16…01-22 wave touched it. Separately: it is exactly this surface on which Run 2 found **F-11** — on a **configured** chat `/setup` still returns `This chat is not configured yet.`

---

## Step 2 — Time zone, full wizard, restart

### 2a. Location → candidates

**Action:** attach a location **as a reply to the bot's prompt**.

**Expected:** bold `Time zone found`, then:

- one candidate → `Candidate: <IANA zone>` and one button `Use <IANA zone>`
- several candidates → `Candidates:` + **every** zone in monospace + a **separate** `Use <zone>` button for each
- last line — `Send another location`

❗The bot **must not** pick the first zone itself or offer to type a zone as text.

If no zone is resolved: `I couldn't determine a time zone from that location. Send a more precise location or another location in this group.`

- [x] Result: ✅ PASS — observed: bold `Time zone found`, one candidate `Candidate: Europe/Athens` in monospace, exactly one button `Use Europe/Athens`, closing line and a `Send another location` button. The bot did not pick the zone itself and did not offer text entry of a zone (2026-08-24)
- [x] Run 2 result (2026-08-26): ✅ PASS — location sent as a reply → candidate card with a single `Use Europe/Athens` button; the bot did **not** pick the zone itself and did not offer text entry. The tap was confirmed by the owner and by a callback record in the log (13:05:01). The "several candidates" branch remains out of scope by owner decision — it is neither a pass nor a debt.

### 2b. All eight steps

**Action:** pick exactly one zone and walk the wizard to the end.

| # | Step | What is expected |
|---|------|------------------|
| 1 | Time zone | from the location, confirmed explicitly |
| 2 | Weekday | inline `Mon`…`Sun`, **two rows: 4 and 3** |
| 3 | Start time | text `HH:MM`; hint `Send a time in 24-hour format, for example 19:30.` |
| 4 | Duration | whole minutes, as text |
| 5 | Daily start | `HH:MM` |
| 6 | Daily end | `HH:MM` |
| 7 | Reminders | default `10:00 and 16:00`, buttons `Use defaults` / `Edit times` |
| 8 | Planning access | `Admins only` / `Previous participants` / `Anyone in chat`, default `Admins only` |

Additionally enter `19:5` deliberately → must return `Use 24-hour time in HH:MM format, for example 19:30.`

- [x] Result: ✅ PASS (with a note) — observed: step 2 inline `Mon`…`Sun` in two rows of 4+3; step 3 verbatim `Send a time in 24-hour format, for example 19:30.`; step 4 `Send the rehearsal duration as a positive whole number of minutes.`; step 7 defaults `10:00` and `16:00` with `Use defaults` / `Edit times`; step 8 `Admins only` / `Previous particip…` / `Anyone in chat`, default Admins only. **The `19:5` probe was deliberately skipped — moved to Step 3.** **NOTE (UX, not a contract violation):** steps 3, 5 and 6 show an identical `TIME_HINT` without naming which time is being entered (`src/telegram/renderers.ts:255,263,266`), whereas step 7 already applies the correct pattern with a leading sentence (`:276,281`). (2026-08-24)
- [x] Run 2 result (2026-08-26): ✅ PASS — **F-1 closed live:** step 3 `Send the default rehearsal start time.`, step 5 `Send the daily start boundary.`, step 6 `Send the daily end boundary.` — each names the value **before** the format, and start and end are distinguishable. **F-9 closed live:** the label `Previous participants` is not truncated, one button per row. **F-2 closed live:** every callback transition rewrites the card in place — the zone-confirmation and step-7 cards are absent from the chat history precisely because they were rewritten (reconstructed from a sequence of 5 callback + 5 text updates, confirmed by the owner). Step 2 — `Mon`…`Sun` in two rows of 4+3; step 4 per contract. The `19:5` probe, deliberately skipped in Run 1, was performed this time and returned verbatim `Use 24-hour time in HH:MM format, for example 19:30.` — i.e. the 01-20 fix added the leading sentence and left the shared format hint unchanged.

### 2c. Review screen

**Expected:** bold `Review configuration`; values **in exactly this order**: time zone, default day, default start, duration, daily start, daily end, reminder times, planning access. Buttons: `Save configuration`, then `Cancel setup`.

❗Before `Save configuration` is pressed the active configuration **must not** change.

- [x] Result: ✅ PASS — observed: bold `Review configuration`; value order exactly per contract — Time zone `Europe/Athens`, Default day Mon, Default start `19:00`, Duration 120 minutes, Daily start `10:00`, Daily end `21:00`, Reminder times `10:00` and `16:00`, Planning access Admins only; buttons `Save configuration` with `Cancel setup` beneath it (2026-08-24)
- [x] Run 2 result (2026-08-26): ✅ PASS — value order exactly per contract: time zone, default day, default start, duration, daily start, daily end, reminder times, planning access; `Save configuration` above `Cancel setup`. **Data-level proof:** before saving, the committed configuration is unchanged (`revision` 4, `default_start` 1080, `daily_start` 1080) while the new values live only in the draft (`1140`, `600`, `expected_revision` 4) — the review screen genuinely does not mutate the active configuration.

### 2d. Persistence across a restart

**Action:** press `Save configuration` → `docker compose restart bot` → send `/settings`.

**Expected:** bold `Chat settings`, sections strictly `Schedule` → `Availability reminders` → `Planning access`, saved zone in place.

- [x] Result: ✅ PASS — observed: after `docker compose restart bot`, bold `Chat settings`, sections strictly `Schedule` → `Availability reminders` → `Planning access`, `Europe/Athens` and all values in place, 7 `Edit …` buttons for 7 editable units (daily boundaries and reminders collapsed pairwise). Incidentally: `Edit time zone` renders first — confirming Evidence Gap #2 is a stale test expectation rather than a product defect (2026-08-24)
- [x] Run 2 result (2026-08-26): ✅ PASS — **together with 01-18 D11.** The repair migration `20260824000000_repair_schedule_window_floor` applied against the **live** volume (5 earlier ones were already there): `daily_start` 1140→1080 with `revision` still 4 — the 01-18 promise confirmed on a concrete row. `/settings` loads for the previously stuck chat, sections strictly `Schedule` → `Availability reminders` → `Planning access`, and `Daily start: 18:00` is visible **in the UI**, not only in the database. Then `Save configuration` replaced the review card with `Chat configuration saved` **without a keyboard** — no action bound to the consumed draft remained on screen; in the database `revision` 4→5, `default_start` 1080→1140, `daily_start` 1080→600, `setup_drafts` 0. After `docker compose restart bot` a repeat `/settings` showed the saved values. This closes the third part of **01-18 D11** (a repeat `/setup` on a stuck chat persists) and all of **01-19 D10**.

### 2e. Update-path logs: existence first, then absence

**The order of the two parts is the substance of this step.** Part 1 runs first and is blocking: if it produced empty output the step is an **immediate FAIL**, and part 2 **must not be run at all**. The claim "there are no coordinates in the logs" made over an empty log is a claim over an empty set: it is vacuously true, and would be equally true if redaction were completely broken. That is exactly how this step passed on 2026-08-24 (F-4). First prove the logs contain anything at all, and only then earn the right to state what they do not contain.

Run both parts **after** the bot has processed at least one update in the live group (steps 2a–2d above suffice), at `LOG_LEVEL=info`.

**Part 1 — existence (positive existential proof, blocking).**

```bash
docker compose logs bot | grep -E '"updateId":[0-9]+' | grep -E '"route":"[a-z]+:[A-Za-z_:]+"'
```

**Expected:** **at least one** structured line carrying both an update identifier and a bounded route identifier.

- Empty output → **step FAIL**. Do not run part 2: the update path is silent, and any conclusion about absent coordinates would be vacuous. This is the state the step was in before plan 01-22.
- Non-empty output → proceed to part 2.

**Part 2 — absence (run only over a non-empty log).**

```bash
docker compose logs bot | grep -inE 'latitude|longitude|[0-9]{2}\.[0-9]{4,}'
docker compose logs bot | grep -inF '<the selected IANA zone>'
```

Run the second command with the **actual** zone confirmed in step 2b and saved in step 2d (in the 2026-08-24 run this was `Europe/Athens`). The zone is absent from the redactor's allow-list precisely because it is a proxy for the location.

**Expected:** empty output from both commands.

> If a match is found — **do not copy coordinates or the zone into the report**. Record the **field name and line number**, or we file them into planning evidence ourselves.

- [x] Run 2 result (2026-08-26): ✅ PASS — both parts executed **in the correct order**, at `LOG_LEVEL=info`. **Part 1 (existence, blocking):** the runbook's literal command returned non-empty output — a line carrying both an update identifier and a bounded route identifier (`"route":"update:message:text"`), with exactly one route record per update. This is **01-21 D8**. **Part 2 (absence):** run **only after** part 1 returned non-empty — 14 lines with `updateId`, among them `"route":"update:message:location"`, so the bot really did process a location. Both greps (coordinate patterns and the actual zone substituted per the step's rule) returned empty. **The pass is not vacuous, unlike 2026-08-24.** This closes **01-22 D8** and satisfies AC-2's coordinate clause **by this step itself** rather than constructively.
- [x] ~~Result: ✅ PASS (vacuous)~~ — **RETRACTED AS NON-PROBATIVE, REPLACED.** Observed 2026-08-24: the grep was empty at `info` and at `LOG_LEVEL=debug`. But it was empty **vacuously**: there was no logging on the update path at all (all 6 logger calls sat in `src/app/main.ts`, lifecycle only), so coordinates had nowhere to come from. Diagnosis — `.planning/debug/no-update-path-logging.md`. Update-path logging was added by plan 01-21, twelve "black holes" in catch clauses were closed by plan 01-22, and the step was rewritten so part 1 no longer permits a recurrence. The redaction guarantee itself was and remains real: `tests/unit/logger.test.ts:105-144` feeds `50.4501/30.5234` and expects `[redacted]`, and the allow-list in `src/shared/logger.ts:21-50` contains no `latitude`/`longitude`. AC-2's coordinate clause was satisfied constructively, but **not by this step**. (2026-08-24)

---

## Step 3 — Editing a setting and a conflicting schedule

### 3a. Valid change

**Action:** in `/settings` press any `Edit …` and enter a valid value.

**Expected:** bold `Review change`, lines `Current: <old>` and `New: <new>`, buttons `Save change` and `Keep current value`.

- [x] Result: ✅ PASS — observed: the `19:5` probe returned verbatim `Use 24-hour time in HH:MM format, for example 19:30.`; after a valid `18:00` the bot showed `Review change`, and after `Save change` the message was **replaced in place** with the updated dashboard (`Default start: 18:00`). The database confirms a two-phase revisioned save: `default_start_minute` 1140 → 1080, `revision` 1 → 2, `settings_edit_drafts` consumed. The settings flow **matches** contract `01-UI-SPEC.md:119` — F-2 is localised to the setup wizard. (2026-08-24)
- [x] Run 2 result (2026-08-26): ✅ PASS — covered by the wizard walk: `19:5` rejected with the verbatim text, `19:00` accepted. The standalone `/settings` flow was verified in Run 1 (PASS) and did not regress in Run 2.

### 3b. Conflicting schedule

**Action:** enter a deliberately conflicting value — daily start later than the end, or start + duration overflowing the daily boundary.

**Expected:** `That schedule does not fit inside the daily time boundaries. No changes were saved.` No saved value changed. **Only** the offending field is re-asked; the rest of the draft is not lost.

- [x] Result: ⚠️ PASS partial — the step was rewritten because the original is unexecutable due to F-5 (the daily end is unreachable from the UI). **Probe A:** `Edit daily boundaries` → `22:00` (rule `dailyStart >= dailyEnd`) produced the conflict; `revision` stayed 3 — "No changes were saved" confirmed at the data level, not only in text. **Probe B:** `19:00` saved, `revision` 3 → 4. **The clause "only the offending field is re-asked; the rest of the draft is not lost" remains UNVERIFIED** — because of F-5, daily-boundary editing is single-field, so no multi-field draft that could be partially lost exists in this flow. (2026-08-24)
- [x] Run 2 result (2026-08-26): ⬜ not repeated — the conflict rule was not changed by plans 01-16…01-22, and Run 1 already proved it at the data level (`revision` did not move). F-6 (lower boundary) was verified by another route: the repair migration against the live volume plus `expected_revision`. The clause "only the offending field is re-asked; the rest of the draft is not lost" remains **unverified** — no multi-field draft exists in this flow, exactly as recorded in Run 1.

### 3c. Editing the daily end

**Action:** open `/settings` and confirm that the daily end has its own, UI-reachable `Edit daily end` button.

**Expected:** separate rows `Edit daily start` and `Edit daily end`, one button per row.

- [x] Run 2 result (2026-08-26): ✅ PASS (existence) — the dashboard has **8** buttons, one per row, including **separate** `Edit daily start` and `Edit daily end`. In Run 1 there were 7: the boundaries were collapsed into a pair and the daily end was permanently unreachable (F-5). **This is an existence result:** completing an edit end-to-end through `Edit daily end` itself was **not observed** — the "edit completion" half is proven on neighbouring fields in step 3a. **01-18 D11 part 1.**

---

## Step 4 — Roster: adding, confirmation, idempotency

### 4a. Adding

**Action:** ask the second account to write something in the group, then reply to that message with `/roster_add`.

**Expected:** `✅ Added <member> to the band roster.` With no extra confirmation click.

- [x] Result: ✅ PASS — observed: `/roster_add` as a reply to the member's message returned `✅ Added <name> — @<username> to the band roster.` immediately, with no confirmation step. Exactly one `chat_memberships` row (active) and one `telegram_users` row in the database. The name contains decorative characters and renders without breaking markup. (2026-08-24)
- [x] Run 2 result (2026-08-26): ✅ PASS — `✅ Added <name> — @<username> to the band roster.` immediately, with no confirmation step. The name contains decorative characters and renders without breaking HTML markup.

### 4b. Adding again

**Action:** repeat `/roster_add` with the same reply.

**Expected:** `✅ <member> is already in the band roster.`

- [x] Result: ✅ PASS — observed: `✅ <member> is already in the band roster.` instead of a second `Added`. Still exactly one `chat_memberships` row in the database — idempotency confirmed by both text and data. (2026-08-24)
- [x] Run 2 result (2026-08-26): ✅ PASS — text `✅ <member> is already in the band roster.`, plus **stronger data-level proof:** exactly one `chat_memberships` row, carrying **the same `id`** as in Run 1. So the add→remove→add cycle reactivated the soft-deleted record rather than inserting a duplicate.

### 4c. Safe rendering

**Action:** `/roster`.

**Expected:** bold `Band roster`, alphabetical ordering, every entry in one of these forms:

- `• <name> — @username`
- `• <name>` — when there is no username
- `• Telegram user ••••<last 4 digits of the ID>` — when both are unreadable

❗The full numeric ID must not be shown in any form.

- [x] Result: ✅ PASS — observed: bold `Band roster`, entry in the form `• <name> — @<username>`, one `Remove member` button. The full numeric ID is nowhere visible. Decorative characters in the name did not break HTML markup. (2026-08-24)
- [x] Run 2 result (2026-08-26): ✅ PASS — bold `Band roster`, entry in the form `• <name> — @<username>`, one `Remove member` button. The full numeric ID is nowhere visible.

### 4d. Confirmation, declined

**Action:** press `Remove member`, then choose `Keep member` in the dialog.

**Expected:** bold `Remove <member>?`, body `They will no longer be selected for future rehearsals.`, buttons `Remove member` / `Keep member`. After `Keep member` the member stays in the roster.

- [x] Result: ⚠️ PASS partial — observed: after `Keep member` the bot returned `Removal cancelled.` (card replaced in place) and the member stayed in the roster; the `chat_memberships` row stayed active in the database. **The dialog's verbatim text was not checked** — the operator did not recall whether the bold `Remove <member>?` heading and the body `They will no longer be selected for future rehearsals.` with two buttons were exactly as specified. The behavioural half of the contract holds; the copywriting half stays unconfirmed. (2026-08-24)
- [x] Run 2 result (2026-08-26): ✅ PASS — **closes the Run 1 debt: the dialog's verbatim copy is now checked, not only its behaviour.** Bold heading `Remove <member>?` (`roster-renderers.ts:142`), body `They will no longer be selected for future rehearsals.` (`roster-renderers.ts:143`), buttons `Remove member` / `Keep member`. After `Keep member` — `Removal cancelled.` (`roster-handlers.ts:456`), and the member stayed active in the database.

### 4e. Removal and a second tap

**Action:** press `Remove member` again → confirm → **press the same button once more**.

**Expected:** private alert `Already applied.` and no second mutation.

- [x] Result: ⬜ N/A — **unexecutable in the roster flow.** After confirmation, `roster-handlers.ts:337-338` calls `editMessageText` and replaces the card **together with its buttons**, so a second tap is physically unreachable. There is exactly one mutation: one `chat_memberships` row in the database, `active_at=null`, `deactivated_at` set (soft delete). Idempotency holds at the data level; the `Already applied.` scenario does not exist in this flow. F-3 verification was moved to step 6c — the only surface where a button stays live after an action is the setup wizard's cards, via F-2. (2026-08-24)
- [x] Run 2 result (2026-08-26): ✅ PASS — the card was replaced with bold `Roster updated` + `They will no longer be selected for future rehearsals.`, with no buttons left. Database: `is_active = f`, one row, soft delete. A second tap is physically unreachable, so `Already applied.` **has no live route by construction** — plan 01-19 replaces the card together with its buttons. The text is covered by automated replay in `chat-readiness.e2e.test.ts` (01-16 D4). This is a design decision, not a gap.

### 4f. Restart with a populated roster (AC-3 remainder)

**Action:** with a **populated** roster run `docker compose restart bot`, then send `/settings` and `/roster`.

**Expected:** both configuration and roster survive the restart and match the saved projection, not the stale card on screen.

- [x] Run 2 result (2026-08-26): ✅ PASS — **closes the Run 1 debt** ("deliberately skipped 2026-08-24"). After `docker compose restart bot` with a populated roster, `/settings` showed the saved 19:00 / 10:00 / 21:00, and `/roster` showed the member. The configuration was checked against the **saved projection**, not the stale card on screen. This closes the **AC-3** remainder.

---

## Step 5 — Live demotion

The most important step: it verifies that authorization rests on the **current** Telegram role rather than on a previous success.

### 5a. Unfinished draft

**Action:** from the admin account start `/setup` or an edit in `/settings` and **leave the draft unfinished**.

- [x] Done — the draft was created from the second account, temporarily made an administrator (the primary account is the group owner, and Telegram does not allow removing its rights).

### 5b. Demotion

**Action:** in the Telegram group settings remove administrator rights from that account.

- [x] Done

### 5c. The next protected action

**Action:** from the same account send a protected command (`/settings`) **and** press an inline button on an old bot message.

**Expected:**

- to the command — a group reply: `Only current chat administrators can change chat setup, roster, or planning access.`
- to the callback — a **private alert**: `Only current chat administrators can do that.`
- the draft is deleted **before** the denial is shown

- [x] Result: ⚠️ PASS partial — **command:** the denial `Only current chat administrators can change chat setup, roster, or planning access.` was shown. But because of F-7 this fact **is not evidence**: the bot gives the same denial without any demotion, to any non-admin message. **Draft:** the real AC-4 proof came from the data — `settings_edit_drafts` and `setup_drafts` were both 0 after the demotion and the configuration `revision` stayed 4, so no mutation went through. **Callback:** ⬜ NOT VERIFIED — by the time of the demotion the button had already been consumed (the message had turned into a text value prompt), so there was no inline button left to tap. The private alert `Only current chat administrators can do that.` stays unverified; F-3 verification was moved entirely to 6c. (2026-08-24)
- [x] Run 2 result (2026-08-26): ✅ PASS — **the branch Run 1 never verified at all.** The workaround that made it reachable: `Edit weekday` leaves a **live** `Mon`…`Sun` keyboard instead of a text prompt, so there is something to tap after the demotion. **Callback:** a private modal alert reading verbatim `Only current chat administrators can do that.` (`callbacks.ts:31`). **Log:** `"outcome":"denied","reason":"permission-denied","callbackKind":null` — the denial happened **before** token parsing, verbatim per the 01-16 contract. **Data:** the actor's draft disappeared, `revision` 5 and `default_weekday` 1 unchanged; the four successful callbacks before the demotion carried no rights forward. **Command:** `/settings` produced `Only current chat administrators can change chat setup, roster, or planning access.` in the chat — and this branch is now probative, because step 5e shows that an ordinary message from the same demoted actor produces complete silence.

### 5d. Restoring rights

**Action:** restore administrator rights and send `/setup`.

**Expected:** the previous draft is **not** restored; setup starts from the beginning.

- [x] Result: ✅ PASS — observed: after rights were restored the previous draft was not resumed, and the database held 0 drafts of either type. (2026-08-24)
- [x] Run 2 result (2026-08-26): ⚠️ PASS with a defect — the contract clause holds: the draft was **not** resumed and the wizard started over. But the entry surface showed `This chat is not configured yet.` on a **configured** chat (`revision` 5, the same values simultaneously visible in `/settings`) → **F-11**. The copy lies; the data is intact.

### 5e. An ordinary message from a demoted actor

**Action:** from the same demoted account send an ordinary reply to the group that is neither a command nor part of any draft.

**Expected:** complete silence in the chat, and in the logs a separate, distinguishable record showing the route had nothing to execute.

- [x] Run 2 result (2026-08-26): ✅ PASS — the reply from the demoted actor produced **complete silence in the chat**, and in the log `"outcome":"no-in-flight-action"` (specifically not `denied`). Route ownership is established **before** authorization, so the bot no longer answers every non-admin message with a denial (**F-7**). One line embodies both fixes: silent for the user (F-7), loud for the operator (F-4). **This is what makes step 5 probative in retrospect** — in Run 1 the same denial appeared without any demotion, so it proved nothing.

---

## Step 6 — Edge states and rendering safety

### 6a. Empty roster

**Action:** remove everyone from the roster → `/roster`.

**Expected:** heading `No band members yet`, body `Reply to a member's message, then send /roster_add to add them.`, and **no** Remove buttons. Those two lines are the entire surface: the Copywriting Contract defines no third instruction line, so nothing further is expected.

- [x] Result: ✅ PASS (re-adjudicated 2026-08-25) — observed 2026-08-24 while clearing the roster at step 4e: heading `No band members yet` ✅, body `Reply to a member's message, then send /roster_add to add them.` ✅, no Remove buttons ✅. Originally recorded as ❌ FAIL (partial) against a third expected line `Reply to a member's message, then send /roster_add.`. **That expectation was a mis-transcription, not a product defect.** 01-UI-SPEC.md stated the same instruction sentence twice — normatively in the Copywriting Contract and again as a paraphrase in the Surface-inventory row — and the runbook-authoring step promoted the paraphrase to a distinct required line. `src/telegram/roster-renderers.ts` renders the Copywriting Contract byte-for-byte and is correct; three exact-match tests would fail if a third line were appended. See `.planning/debug/empty-roster-missing-final-line.md`. F-8 closed as misfiled; broken window 10 waived, not fixed.
- [x] Run 2 result (2026-08-26): ✅ PASS — `No band members yet` + `Reply to a member's message, then send /roster_add to add them.` Exactly two lines, no Remove buttons. Verified against the **corrected** expectation, which finally confirms F-8 was a mis-transcription rather than a renderer defect.

### 6b. Long roster and pagination

**Action:** if 20+ entries can be assembled — open `/roster`.

**Expected:** pages of 20 in alphabetical order, footer `Showing <start>–<end> of <total>`, `Previous` / `Next` buttons, and `Remove member` actions preserved on every page.

- [x] Result: ⬜ N/A — a live run cannot assemble 20+ real accounts. Basis for N/A: pagination rendering is covered by unit tests exactly at the boundary — `tests/unit/roster-rendering.test.ts:352-399` checks 1, 20 and 21 members and the verbatim footers `Showing 1–20 of 21` / `Showing 21–21 of 21`, and that 20 members carry no footer. **Residual gap:** live wiring of the `Previous` / `Next` buttons and preservation of `Remove member` actions on each page are not covered by renderer unit tests — that is keyboard and callback behaviour, not rendering. (2026-08-24)
- [x] Run 2 result (2026-08-26): ⬜ N/A — the live run again cannot assemble 20+ real accounts. Rendering remains covered by unit tests exactly at the boundary (`tests/unit/roster-rendering.test.ts:352-399`). **The residual gap is still OPEN:** live wiring of `Previous` / `Next` and preservation of `Remove member` on each page is keyboard and callback behaviour rather than rendering, and neither run has verified it. This is UAT test 16, deferred by the owner.

### 6c. Stale actions

**Action:** press a button on an old bot message (for example after setup has already completed).

**Expected:** `This setup action is no longer available. Send /setup to start again.` or, for settings/roster, `This action is no longer available. Open /settings or /roster and try again.`

If a draft is left untouched for 30 minutes: `This setup expired after 30 minutes of inactivity. Send /setup to start again.`

- [x] Result: ❌ FAIL — **tap 1** (`Start setup` from the first message, 1:18 PM): no reaction at all. This is a clean hit on the stale-action branch — in the database `START_SETUP` had 0 valid and 17 expired tokens. The expected private alert `This setup action is no longer available. Send /setup to start again.` was **not shown**. **Tap 2** (an old `Edit …`, 1:42 PM) did not test staleness: the token was still live (18 of 56 `SETTINGS_EDIT` valid), the tap created a `DEFAULT_START_MINUTE` draft at 11:11:28 UTC, and the dashboard correctly turned into a prompt — correct behaviour, different path. The 30-minute draft expiry scenario was not tested. (2026-08-24)
- [x] Run 2 result (2026-08-26): ✅ PASS — **two taps, two different branches.** **Tap 1:** on an old `Start setup` button → a private modal alert reading verbatim `This setup action is no longer available.` / `Send /setup to start again.`, matching `setup-handlers.ts:38-39`; in the log `"outcome":"stale","reason":"stale-or-mis-bound-action","callbackKind":"START_SETUP"`. In Run 1 the same tap produced **complete silence** — **F-3 closed live**, the 1st of the four 01-16 D9 texts. **Tap 2, at 15:01:** a `/settings` dashboard deliberately created at 13:03 and left untouched as a timer, tapped after all 72 `SETTINGS_EDIT` tokens had passed the 30-minute TTL (`settings-service.ts:15`) → a private modal alert reading verbatim `This action is no longer available. Open /settings or /roster and try again.`, matching `settings-handlers.ts:47-48` / `roster-handlers.ts:46-47`. That is the 2nd of the four texts. **The two alerts are worded differently**, and that difference is what proves the boundary reaches the correct branch **per surface** rather than emitting one universal stub. Incidentally: the expired card still showed pre-save values (`Default start 18:00`, `Daily start 18:00`) while the committed configuration already held 19:00/10:00 — an expired token grants no action on stale state. **Tap 3 (roster)** had no separate surface: its card is replaced in place. That is the same `editMessageText` path and the same contract text already proven by tap 2.

### 6d. Client nativeness

**Action:** inspect visually in the Telegram client.

**Expected:**

- text wraps natively, nothing truncated or misaligned
- **no** reply keyboard and **no** WebView
- after each callback the original bot message is **replaced** with the current state rather than duplicated by a new one

- [x] Result: ❌ FAIL — **text wrapping:** native, message bodies not truncated ✅. **No reply keyboards and no WebView** ✅ — all surfaces are inline. **Message replacement:** in settings and roster the card is replaced in place ✅, but in the setup wizard every step appends a new card and leaves the previous one with live buttons ❌ — see F-2. **Label truncation:** on setup step 8 the button appeared as `Previous particip…` — see F-9. (2026-08-24)
- [x] Run 2 result (2026-08-26): ✅ PASS — confirmed by the owner across the whole session: text wraps natively, nothing truncated; no reply keyboard appeared at any point; no WebView opened. Card replacement after each callback was confirmed separately (**F-2 closed**), and the `Previous participants` label is not truncated (**F-9 closed**). In Run 1 this step was a FAIL precisely because of F-2 and F-9.

---

## Conformance with the acceptance criteria of plan 01-14 Task 2

| # | Criterion | Covered by steps | Run 1 status — 2026-08-24 |
|---|-----------|------------------|---------------------------|
| AC-1 | A real location update reaches the correct actor-bound step and yields a confirmable IANA candidate | 1, 2a | ✅ PASS |
| AC-2 | Every candidate has its own action, only the selected zone reaches review/save, and no raw coordinates appear in logs or evidence | 2a, 2b, 2c, 2e | ⚠️ PARTIAL — the location produced **one** candidate, so the "several candidates, one button each" branch was not observed live. **Deliberately skipped 2026-08-24** by owner decision: the multi-candidate branch needs a location near a time-zone boundary, and the cost is not justified at this stage. Not a debt of this run. **Coordinate clause:** satisfied constructively (allow-list + `tests/unit/logger.test.ts`), but **not** by step 2e — its 2026-08-24 pass was vacuous (F-4). Step 2e was rewritten by plan 01-22 and reset to PENDING; the live coordinate clause stays unproven until a repeat run against the corrected build. |
| AC-3 | Configuration and roster survive a bot restart and match the saved projection | 2d, 4a–4e | ⚠️ PARTIAL — configuration fully verified (restart + database comparison, 2d). **The roster was not verified across a restart**: the restart happened before the roster operations, and the bot was not restarted afterwards. **Deliberately skipped 2026-08-24** by owner decision: database persistence is already proven by the configuration (2d), the roster lives in the same database, so a separate restart would prove nothing new. Not a debt of this run. |
| AC-4 | Demotion takes effect from the next command/callback, discards the actor's draft, and is not bypassed by a previous success | 5a–5d | ⚠️ PARTIAL — draft discard proven from data (0 drafts, `revision` unchanged). **The callback branch was not verified** (no button existed at the moment of demotion). The command branch is non-probative: because of F-7 the bot gives the same denial without a demotion. |
| AC-5 | Message hierarchy, verbatim texts, inline buttons, immediate callback completion, wrapping, pagination and safe identity match the UI contract | 1, 3a, 4c, 4d, 6a–6d | ❌ FAIL — F-2 (the wizard does not replace its card), F-3 (no private alert is ever shown), F-5 (the daily end is unreachable), F-7 (a denial to an ordinary message), F-8 (missing final line of the empty roster), F-9 (a truncated label). |

### Run 2 status (2026-08-26)

| # | Criterion | Run 2 status (2026-08-26) |
|---|-----------|---------------------------|
| AC-1 | A real location update reaches the correct actor-bound step and yields a confirmable IANA candidate | ✅ PASS — steps 2a and 2b: the location sent as a reply produced a candidate card with its own confirmation button, the bot did not pick the zone itself, and the wizard was walked to the end. |
| AC-2 | Every candidate has its own action, only the selected zone reaches review/save, and no raw coordinates appear in logs or evidence | ✅ PASS — **the coordinate clause is now satisfied by step 2e itself, not constructively.** The order is the reason: part 1 returned a non-empty log with routes, and **only then** was part 2 executed to assert absence; on 2026-08-24 the same assertion was vacuous (F-4). The "several candidates" branch remains **deliberately skipped by owner decision** — neither a pass nor a debt. |
| AC-3 | Configuration and roster survive a bot restart and match the saved projection | ✅ PASS — **the Run 1 remainder is closed:** at step 4f the roster was verified across a restart **for the first time** (`docker compose restart bot` with a populated roster), and the configuration was compared against the saved projection rather than the stale card. |
| AC-4 | Demotion takes effect from the next command/callback, discards the actor's draft, and is not bypassed by a previous success | ✅ PASS — **the Run 1 remainder is closed:** the callback branch was walked **for the first time** at step 5c, with the verbatim private alert `Only current chat administrators can do that.` and denial before token parsing. The command branch is now probative too, because step 5e shows an ordinary message from the same demoted actor produces **complete silence** — it was the absence of that observation that made the command branch non-probative on 2026-08-24. |
| AC-5 | Message hierarchy, verbatim texts, inline buttons, immediate callback completion, wrapping, pagination and safe identity match the UI contract | ❌ **FAIL** — all six Run 1 causes (F-2, F-3, F-5, F-7, F-8, F-9) are closed and confirmed live, but **two new** violations were found inside this very criterion's domain: **F-10** (an expired settings draft is swallowed silently, with no expiry copy at all) and **F-11** (`/setup` unconditionally claims the chat is not configured). |

---

## Run 2 findings (2026-08-26)

Both findings are **recorded, not fixed** by that run. The fix belongs to a separate GSD session against a separate plan.

### F-10 — an expired settings draft is swallowed silently

**Status:** CONFIRMED by the live run on 2026-08-26 (predicted by reading the code before acting).

**Symptom.** An administrator replies with text to a bot message while holding an expired `settings_edit_drafts` row. The bot stays silent. No expiry copy is shown at all.

**Evidence.** A log line from the live run: route `update:message:text` with `"outcome":"authorized-and-dispatched"` — and no bot reply in the chat. `authorized-and-dispatched` proves the boundary **accepted** the update and handed the turn to the wizard. This is not "the update never arrived": the bot decided it owned this message and then did nothing.

**Call chain.**

1. `handlers.ts:337-343` `hasInFlightAction` — the row exists → `true` (deliberate: expiry is ignored so the expiry copy stays reachable)
2. `authorize` → passes
3. `settings-handlers.ts:303` `findSettingsDraft` — `expiresAt <= now` → **null**
4. `handlers.ts:566` → `handleSetupText`
5. `setup-service.ts:180` `requireActive` — `setup_drafts` empty → `{kind:"missing"}`
6. `setup-handlers.ts:539` `if (active.kind !== "active") return;` → silence

**Contract violated.** `01-UI-SPEC.md:122`: `A draft expires after 30 minutes of inactivity. The next attempt shows the documented expiry copy and starts no mutation.` The rule is stated generally ("A draft") and covers **both** draft types.

**Second aspect — the contract's own silence.** The only expiry copy (`01-UI-SPEC.md:138`, `setup-handlers.ts:39-40`) is worded for setup: `Send /setup to start again.` For a settings-edit draft it is **semantically wrong**, and no settings variant exists in the Copywriting Contract. This is the same class of contractual silence plan 01-20 already closed once for time hints.

**Why it was not caught earlier.** The comment at `handlers.ts:314-316` justifies counting an expired row as in-flight precisely because "a lapsed draft still hands the turn to the wizard, which reports DRAFT_EXPIRED". For a **setup** draft that is true. For a **settings** draft the turn goes to the same setup wizard, which finds nothing of its own and exits silently. The justification is exactly half right — and that half was the untested one.

**Not to be fixed during that run.**

### F-11 — `/setup` always claims the chat is not configured

**Status:** CONFIRMED by the live run on 2026-08-26.

**Symptom.** `/setup` on a chat with an active configuration replies with bold `Set up rehearsal planning` and the body `This chat is not configured yet.` The statement is false. Two surfaces of the same bot contradict each other: `/settings` shows the configuration, `/setup` says there is none.

**Evidence.** Screen and database state simultaneously: `chat_configurations` — exactly one row, `revision` 5, saved values in place, and those same values visible in `/settings`. No data was destroyed — the copy is what lies.

**Root cause.** `setup-handlers.ts:443-448` emits this text **unconditionally**. `handleSetupCommand` never reads `chat_configurations` and never inspects draft state. The route `handlers.ts:357-378` is linear with no branch.

**Contract violated — two clauses, one root.**

- `01-UI-SPEC.md:89` restricts this surface to the trigger `/setup` **in a chat without active configuration**. The condition was ignored.
- `01-UI-SPEC.md:90` defines a **second** trigger for the same command: `/setup` **by the draft owner within 30 minutes** → the reply must begin with `Setup in progress` and show `Step X of 8`. The owner of a live draft is told "not configured" as well. The contract describes two surfaces; the implementation has one.

**Not a regression of the 01-16…01-22 wave** — that wave never changed this code path.

**Why Run 1 did not catch it.** Run 1 started from a genuinely unconfigured chat and never called `/setup` again on an already-configured one. The defect is structurally unreachable from a clean start.

**Not to be fixed during that run.**

---

## Run outcomes

**Run 1 executed 2026-08-24. Verdict: NOT `approved`.**

Evidence Gap #1 (`01-VALIDATION.md`) **closes as performed** — the live check happened and produced a result. But the result is negative: AC-5 failed, AC-2/AC-3/AC-4 partial, 9 findings recorded (F-1…F-9).

Discrepancies were recorded as observed and were not massaged towards green.

### Run 2 (2026-08-26)

**Run 2 verdict: NOT APPROVED.**

All nine Run 1 findings (F-1…F-9) were confirmed closed **live**. AC-1, AC-3 and AC-4 pass fully — the Run 1 remainders were closed by steps 4f (roster across a restart) and 5c (the callback branch). AC-2 passes, with the "several candidates" branch deliberately skipped by owner decision. **AC-5 stays FAIL** — on two **new** findings, F-10 and F-11, both inside AC-5's own domain.

The phase stays **pending**. The blocking checkpoint `01-14-PLAN.md` Task 2 is **not satisfied**. A third live run against a build that fixes F-10 and F-11 is required.

**Methodological note.** Both new findings are structurally unreachable for a clean-slate run: F-10 required a two-day-old expired draft, F-11 an already-saved configuration. Run 2 found them only because it walked Run 1's **preserved** Postgres volume. A regression run over inherited state finds a different class of defect than a run from scratch — worth recording as practice.

**Adjacent observation.** The structural gate `tests/unit/update-path-logging.test.ts:357` scans **only `src/telegram`**, which is exactly why CR-01 could survive in `src/domain/auth`: the gate that catches silent catches does not look there. Widening the scan root would move a count-based threshold, so the CR-01 planner deliberately left it out of scope. Raised as a separate item, not a debt of that run.

---

## Handoff to the next session — order of fixes

Fixes are performed **separately, through the GSD workflow, in a fresh session**. During a run the code is deliberately not changed, so that exactly the code recorded in the phase's commits is what gets verified.

Recommended order:

| Priority | Finding | Why here |
|---|---|---|
| 1 | **F-3** — private alerts are not shown | Widest radius: 4 contract texts, a silent failure, blocks AC-5. Isolated fix in one file (`callbacks.ts`). |
| 2 | **F-7** — a denial to an ordinary message | The only defect that is noisy in a live group on every non-admin message. The fix is check ordering in two `handlers.ts` branches. Careful: do not break AC-4 (the draft must be deleted **before** the denial is shown). |
| 3 | **F-5** — the daily end is unreachable | A functional dead end: the value cannot be changed after setup. |
| 4 | **F-6** — no `defaultStart >= dailyStart` check | An incoherent schedule already sits in the database as evidence. |
| 5 | **F-2** — the setup wizard does not replace its card | Coupled to F-3: once F-3 is fixed the old buttons stop being silent but remain superfluous. |
| 6 | **F-1** — ambiguous time hints | The owner's original complaint on the live run. |
| 7 | **F-8**, **F-9** | Minor divergences from the copywriting and UI contracts. |
| 8 | **F-4** — no logging on the update path | ✅ **CLOSED in code.** Plan 01-21 gave the update path a logger and one record per route and per terminal exit of the callback boundary; plan 01-22 bound twelve catch clauses that had been swallowing exceptions silently, so `bot.catch` can finally fire. Step 2e was rewritten: existence is proven **before** absence. What remains is a repeat live run — that, not the code, is what confirms step 2e. |

**Common trait of F-1, F-2, F-5, F-8, F-9:** these are not missing solutions but the project's own pattern left unapplied. The correct variant already exists in a neighbouring file every time — the leading sentence in wizard step 7, `editMessageText` in settings/roster, the field pair in reminders, one button per row in the dashboard. Fixes must follow the existing pattern rather than invent a new one.

**Working-tree state at the time of Run 2:** this file was **untracked** (`??`) and uncommitted. No live code edits were made during the run — `src/` and `tests/` were clean.

---

# Run 3 protocol — prepared 2026-08-26, AUTOMATED PREFLIGHT COMPLETE; HUMAN MATRIX PENDING

**Status: the exact candidate was built, launched, and restarted successfully on 2026-08-27. The human operator confirmed the participant-role prerequisites on 2026-08-27; the Telegram behaviour matrix has not been executed. The verdict field below is deliberately empty and must not be pre-filled.**

This section is the complete protocol for the third live run. Runs 1 and 2 above are **immutable historical evidence** — do not edit their rows. Record Run 3 observations only inside this section.

## Run 3 — preconditions

Run 3 must not start until all of these hold. Each is objectively checkable.

| # | Precondition | How to check | Status at preparation time |
|---|---|---|---|
| P-1 | Broken windows 2, 3, 14 and 15 read `fixed` in `.planning/WINDOWS.md` | `gsd-tools windows status` | ✅ met — closed by plan 01-26 Task 1 on the automated gate below |
| P-2 | The full automated gate is green from one commit | `npm run format:check && npm run build && npm test && npm run test:integration` | ✅ met — 83/83 unit, 36/36 integration, format and `tsc --noEmit` clean |
| P-3 | The build under test contains the F-10 fix (plan 01-23) and the F-11 fix (plan 01-24) | `git log --oneline` shows the 01-23 and 01-24 commits reachable from the deployed commit | ✅ met at preparation time |
| P-4 | Docker is available and the Postgres volume from Run 2 is preserved | `docker volume ls` lists `gsmbot-postgres-data` | ✅ met 2026-08-27 — preserved volume created 2026-08-20; one configuration row remains at revision 5 |
| P-5 | `.env` exists, is gitignored, and holds a live token for a dedicated test bot | `git check-ignore -v .env` | ✅ met 2026-08-27 — file and both required non-empty variables confirmed without reading or recording their values |

❗**Do not run `docker compose down -v`.** F-10 and F-11 were both found only because Run 2 walked Run 1's inherited volume. Run 3 must inherit Run 2's volume for the same reason: a clean slate cannot reach either defect, and a clean-slate Run 3 would therefore prove nothing about them.

## Run 3 — reproducibility metadata

Fill in before the first Telegram action. Record identifiers that make the run reproducible, and **nothing that is a secret or a private identity**.

| Field | Value |
|---|---|
| Date of run | 2026-08-27 — automated launch complete; human Telegram matrix in progress |
| Commit SHA under test | `7845edb23d56d0f6afd079bda95fd21583922adb` |
| Working tree clean at that SHA | ✅ yes — `git status --short` produced zero lines before launch and after the automated gate |
| Docker image built from that SHA | ✅ `docker compose up --build --force-recreate -d bot` completed at 2026-08-27 07:20:48Z |
| Postgres volume | `gsmbot-postgres-data`, created 2026-08-20T12:29:43+03:00 and preserved across the bot-only restart |
| Migrations applied on startup | 6 migrations found; no pending migrations; latest applied `20260824000000_repair_schedule_window_floor` |
| `LOG_LEVEL` | `info` |
| Group identity | Private supergroup; the bot is an administrator; administrator and non-administrator human roles are available. Confirmed by the operator on 2026-08-27; no private identity recorded. |
| Operator role | Administrator available; exact identity not recorded. |
| Second account role | Non-administrator available; exact identity not recorded. |

> 🔐 **Privacy rule for this whole section.** Never commit: the bot token, `POSTGRES_PASSWORD`, any Telegram chat ID, any username, any display name, any raw coordinate, or the resolved IANA zone in a context that pairs it with the location. Where a real value would otherwise be needed, record the **field name and the line number** instead. Bot texts that contain a member's name are recorded with the name replaced by `<member>`, exactly as Runs 1 and 2 did.

## Run 3 — automated preflight (Claude runs these, not the operator)

Record the actual output. All five must pass before any Telegram interaction.

| # | Command | Expected | Result |
|---|---|---|---|
| A-1 | `npm run format:check` | All matched files use Prettier code style | ✅ PASS — exact-candidate worktree clean |
| A-2 | `npm run build` | `tsc --noEmit` exits clean | ✅ PASS |
| A-3 | `npm test` | Unit suite fully green, no skipped test | ✅ PASS — 83/83 tests in 13 files |
| A-4 | `npm run test:integration` | Integration suite fully green against real PostgreSQL | ✅ PASS — 36/36 tests in 5 files |
| A-5 | `gsd-tools windows status` | Windows 2, 3, 14, 15 read `fixed` | ✅ PASS — all four read `fixed`; unrelated window 16 remains separately tracked |

## Run 3 — restart and preserved-volume checks

| # | Check | Expected | Result |
|---|---|---|---|
| R-1 | The volume is the one Run 2 used | `chat_configurations` still holds the Run 2 row at `revision` 5 or higher, with its saved values | ✅ automated portion PASS — preserved named volume contains one configuration row at revision 5; Telegram projection pending |
| R-2 | Startup migrations applied to the inherited volume | The bot starts, migrations report success, and no earlier data is destroyed | ✅ PASS — migration exit 0, PostgreSQL healthy, bot reached long polling |
| R-3 | `docker compose restart bot` mid-run | Configuration and roster survive and match the saved projection, not the card on screen | ✅ configuration portion PASS — bot-only restart changed `StartedAt`, preserved PostgreSQL/container/volume identities, kept PostgreSQL healthy, and emitted one fresh post-boundary startup record. Afterward `/settings` loaded the newly saved configuration from PostgreSQL with the saved values and required section order. The populated-roster portion remains tracked separately by row 3-16. |
| R-4 | No `docker compose down -v` was run at any point | Operator attests | Automation did not run `docker compose down -v`; human operator attestation remains pending |

Sanitized automated restart evidence:

- Launch boundary: `2026-08-27T07:20:31.363450987Z`
- Restart boundary: `2026-08-27T07:20:48.678229882Z`
- Bot `StartedAt`: `2026-08-27T07:20:48.147387264Z` before restart; `2026-08-27T07:20:48.899256395Z` after restart
- PostgreSQL container identity: unchanged across restart (identifier intentionally omitted)
- Named-volume identity: unchanged across restart
- Exact structured `Telegram long-poll runner started` record: present after launch and again after the restart boundary

## Run 3 — required behaviour checklist

Every row below is **required** for approval unless its Deferred column says otherwise. Rows marked deferred are explicitly **not** approval conditions.

| Row | Behaviour | Runbook step | UAT | Deferred? | Result |
|---|---|---|---|---|---|
| 3-01 | Setup entry on an unconfigured chat: bold `Set up rehearsal planning`, body `This chat is not configured yet.`, exactly one `Start setup` button | 1 | — | no | ✅ PASS — direct Telegram evidence recorded in H-2d; the separate never-configured disposable group showed exactly the readiness card and one `Start setup` button, with no in-progress response before the button was pressed. |
| 3-02 | Location sent as a reply yields `Time zone found` with one confirmation button per candidate; the bot never picks a zone itself | 2a | — | no | ✅ PASS — a real Telegram location sent as a reply at Step 1 produced one `Time zone found` card with one candidate, exactly one matching confirmation action, and a separate `Send another location` action. No zone was selected automatically: an immediate sanitized aggregate found one active unconfigured-chat draft at expected revision 0 and zero active drafts with a confirmed time zone. The screenshot was inspected but not retained; the map, candidate value, identities, group name, notification, and unrelated chat-list content were excluded from evidence. |
| 3-03 | All eight wizard steps render per contract, including the distinct step 3/5/6 leading sentences and the untruncated `Previous participants` label | 2b | — | no | ✅ PASS — the administrator walked all eight steps. Step 1 accepted a replied location only after explicit candidate confirmation; Step 2 rendered weekdays in rows of four and three; Step 3 named the default rehearsal start before the format hint; Step 4 requested positive whole minutes; Steps 5 and 6 distinctly named daily start and daily end before the same format hint; Step 7 showed both default reminder times with `Use defaults` and `Edit times`; Step 8 stated the default policy and rendered `Admins only`, the full untruncated `Previous participants`, and `Anyone in chat` on separate rows. Callback transitions replaced the current card. Screenshots were inspected but not retained, and location/time-zone and identity data were excluded. |
| 3-04 | `19:5` is rejected with verbatim `Use 24-hour time in HH:MM format, for example 19:30.` | 2b | — | no | ✅ PASS — at Step 3 the administrator sent `19:5`; the bot replied verbatim `Use 24-hour time in HH:MM format, for example 19:30.`, then repeated `Setup in progress`, `Step 3 of 8`, and the default-start prompt. A sanitized aggregate immediately afterward found the live draft still had its confirmed time zone and weekday but no default-start value, proving the invalid input did not advance or mutate that field. The screenshot was inspected but not retained, and its map and identities were excluded from evidence. |
| 3-05 | Review screen order per contract; committed configuration unchanged until `Save configuration` | 2c | — | no | ✅ PASS — after selecting planning access, the in-place card showed bold `Review configuration`, then time zone, default day, default start, duration, daily start, daily end, reminder times, and planning access in the required order, followed by `Save configuration` and `Cancel setup`. Before save, a sanitized aggregate still found only the one previously configured chat plus one active, complete, revision-0 draft for the new chat; no second committed configuration existed. The screenshot was not retained and the displayed zone was excluded from evidence. |
| 3-06 | Configuration survives `docker compose restart bot`; `/settings` sections strictly `Schedule` → `Availability reminders` → `Planning access` | 2d | — | no | ✅ PASS — `Save configuration` replaced the review with a keyboard-free saved projection; a sanitized aggregate changed to two committed configurations, revisions 1 through 5, and zero active setup drafts. Root then restarted only the bot and verified its start time changed while PostgreSQL stayed healthy with the same container and named volume and one fresh long-poll startup record. A post-restart `/settings` showed the saved values with sections strictly `Schedule` → `Availability reminders` → `Planning access` and all eight edit actions. The screenshot was inspected but not retained, and its selected zone and identities were excluded. |
| 3-07 | Update-path logs: part 1 (existence) non-empty **first**, then part 2 (absence) empty. If part 1 is empty the step is an immediate FAIL and part 2 must not be run | 2e | — | no | ✅ PASS — at `LOG_LEVEL=info`, the blocking positive check ran first and found 23 structured lines carrying both an update identifier and bounded route identifier, including 6 location-route records. Only then did the two absence checks run: coordinate-field/decimal-pattern matches = 0 and selected-zone matches = 0. The selected zone was read into a shell variable solely for the comparison and was neither printed nor recorded. The result is non-vacuous and contains no update, chat, user, coordinate, or zone value. |
| 3-08 | A valid settings edit shows `Review change` with `Current:` / `New:` and saves in place | 3a | — | no | _to be filled_ |
| 3-09 | A conflicting schedule returns `That schedule does not fit inside the daily time boundaries. No changes were saved.` and mutates nothing | 3b | — | no | _to be filled_ |
| 3-10 | `Edit daily start` and `Edit daily end` are separate, UI-reachable rows, and an edit **completes end-to-end through `Edit daily end`** — the half Run 2 left as existence-only | 3c | — | no | _to be filled_ |
| 3-11 | `/roster_add` as a reply adds the member immediately, with no confirmation click | 4a | — | no | _to be filled_ |
| 3-12 | A repeat `/roster_add` returns `✅ <member> is already in the band roster.` and inserts no duplicate row | 4b | — | no | _to be filled_ |
| 3-13 | `/roster` renders safely; the full numeric ID is nowhere visible | 4c | — | no | _to be filled_ |
| 3-14 | Removal dialog verbatim copy, and `Keep member` leaves the member active | 4d | — | no | _to be filled_ |
| 3-15 | Confirmed removal replaces the card together with its buttons; soft delete in the database | 4e | — | no | _to be filled_ |
| 3-16 | Restart with a populated roster: both configuration and roster match the saved projection | 4f | — | no | _to be filled_ |
| 3-17 | Demotion: command denial, private callback alert `Only current chat administrators can do that.`, draft deleted **before** the denial | 5c | — | no | _to be filled_ |
| 3-18 | After rights are restored the previous draft is **not** resumed | 5d | — | no | _to be filled_ |
| 3-19 | An ordinary message from a demoted actor produces complete silence in the chat and `"outcome":"no-in-flight-action"` in the log | 5e | — | no | _to be filled_ |
| 3-20 | Empty roster shows exactly `No band members yet` + `Reply to a member's message, then send /roster_add to add them.`, no Remove buttons | 6a | — | no | _to be filled_ |
| 3-21 | Long-roster pagination: live `Previous` / `Next` wiring and per-page `Remove member` | 6b | test 16 | **YES — owner-deferred. Not a Run 3 approval condition.** | _optional; record only if 20+ accounts happen to be available_ |
| 3-22 | Stale actions: the setup alert and the settings/roster alert are worded differently and each reaches its own branch | 6c | — | no | _to be filled_ |
| 3-23 | Client nativeness: native wrapping, no reply keyboard, no WebView, cards replaced rather than duplicated | 6d | — | no | _to be filled_ |
| 3-24 | Multi-candidate time zone branch | 2a | — | **YES — deliberately skipped by owner decision since Run 1. Neither a pass nor a debt.** | _optional_ |
| 3-25 | "Only the offending field is re-asked" on a conflicting multi-field draft | 3b | test 8 clause | **YES — no multi-field draft exists in this flow; unverified since Run 1 and carried forward.** | _optional_ |

## Run 3 — high-attention rows

These three are the reason Run 3 exists. Each gets its own explicit observation; none may be inferred from a neighbouring row.

### H-1 — F-10: the 30-minute settings-draft expiry

**What Run 2 observed:** an expired `settings_edit_drafts` row was authorized and dispatched, and the bot said **nothing at all**.

**Setup.** Open `/settings`, press any `Edit …` so a `settings_edit_drafts` row is created, then **leave it untouched for more than 30 minutes**. The TTL is defined at `settings-service.ts:15`. Do not tap anything else on that card while waiting. Then reply with a text value to the bot's prompt.

**Expected now (after plan 01-23):**

- The bot replies with the settings-specific sentence, verbatim: `This settings change expired after 30 minutes of inactivity. Open /settings to start again.`
- It must **not** be the setup sentence `This setup expired after 30 minutes of inactivity. Send /setup to start again.` — per `01-UI-SPEC.md:122` there is no fallback between surfaces, and an administrator who never opened `/setup` must never be told to send `/setup`.
- Silence is a **FAIL**. That silence is the whole of F-10.
- The lapsed draft row is gone afterwards; committed configuration and its `revision` are unchanged.
- The same must hold when the lapsed edit is answered with a **location** instead of text.

| Sub-row | Observation | Result |
|---|---|---|
| H-1a | Exact sentence shown after a text reply to a lapsed settings edit | ✅ PASS — after the administrator replied `19:30` to the old default-start prompt, one bot reply showed exactly `This settings change expired after 30 minutes of inactivity. Open /settings to start again.`; the captured view shows neither silence nor a duplicate reply |
| H-1b | The setup-worded sentence did **not** appear | ✅ PASS — the operator-supplied Telegram screenshot does not show `This setup expired after 30 minutes of inactivity. Send /setup to start again.` |
| H-1c | Same behaviour when the lapsed edit is answered with a location | ✅ PASS — after the administrator replied to the old time-zone prompt with a Telegram location, exactly one bot reply showed `This settings change expired after 30 minutes of inactivity. Open /settings to start again.`; the captured view shows neither the setup-worded sentence, silence, nor a duplicate reply |
| H-1d | Database: lapsed draft removed, committed `revision` unchanged | ✅ PASS — an immediate read-only PostgreSQL check found zero settings-edit drafts and one committed configuration whose minimum and maximum revision both remained 5, matching the preserved pre-probe revision |

Evidence for H-1a/H-1b: operator-supplied Telegram screenshot visually inspected on 2026-08-27; the image was not copied into the repository. Evidence for H-1c/H-1d: a second operator-supplied Telegram screenshot was visually inspected on 2026-08-27 and followed immediately by the sanitized read-only database counts above; the image was not copied into the repository. No map, coordinate, resolved zone, credential, or private Telegram identity was recorded.

**This row is UAT test 23.** All four sub-rows now pass, so test 23 is recorded as passed in `01-UAT.md`; this does not imply any other Run 3 row or the final verdict.

### H-2 — F-11: `/setup` on a configured chat, resume and restart

**What Run 2 observed:** `/setup` on a chat at `revision` 5 replied `This chat is not configured yet.` while `/settings` simultaneously showed the saved values.

**Expected now (after plan 01-24), four distinct entry states:**

| State | Trigger | Expected |
|---|---|---|
| Configured, no draft | `/setup` on a chat with a committed configuration | Reply begins with `Setup in progress` and shows `Step 1 of 8`. The sentence `This chat is not configured yet.` must **not** appear. |
| Live draft, same owner | `/setup` again by the draft owner within 30 minutes | Reply begins with `Setup in progress` and shows the draft's **exact current step**, with previously collected values preserved — not a reset to step 1. |
| Lapsed draft | `/setup` after the draft's TTL | The setup expiry sentence `This setup expired after 30 minutes of inactivity. Send /setup to start again.` and no replacement draft created in that same update. |
| Unconfigured, first entry | `/setup` on a chat with no configuration | The original readiness card: bold `Set up rehearsal planning`, body `This chat is not configured yet.`, exactly one `Start setup` button. |

**Restart clause.** After a `docker compose restart bot`, `/setup` on the configured chat must still open the wizard from PostgreSQL alone — the state must not depend on anything held in process memory.

| Sub-row | Observation | Result |
|---|---|---|
| H-2a | Configured chat, no draft → `Setup in progress` / `Step 1 of 8` | ✅ PASS — `/setup` produced exactly one bot reply beginning `Setup in progress`, showing `Step 1 of 8`, and asking for a location; `This chat is not configured yet.` did not appear. Sanitized read-only aggregates changed from one expired and zero active drafts to one expired and one active draft, with one configured chat but two distinct draft actors. The inherited expired draft therefore belonged to a different actor, while this administrator had no draft and created the new active draft. This observation does not adjudicate the lapsed-draft branch. |
| H-2b | Live draft → resumes at its exact current step, values preserved | ✅ PASS — after reaching Step 2, the same administrator sent `/setup` within two minutes. Exactly one bot reply began `Setup in progress`, showed `Step 2 of 8`, repeated `Choose the default rehearsal weekday.`, and rendered the same seven weekday buttons in rows of four and three; it did not reset to Step 1. A sanitized read-only aggregate found one active draft with its previously selected time-zone value still saved, no weekday selected, and expected revision still 5. |
| H-2c | Lapsed draft → setup expiry sentence, no replacement draft | ✅ PASS — after the administrator left the Step 1 draft untouched for more than 30 minutes and sent `/setup`, exactly one bot reply showed `This setup expired after 30 minutes of inactivity. Send /setup to start again.` No replacement `Setup in progress` reply appeared. Sanitized read-only aggregates changed from two drafts (one expired, one active, two distinct actors) to one draft (expired, zero active, one actor), with zero rows holding any collected value. The administrator's formerly active row was therefore deleted without a replacement; only the earlier actor-distinct blank expired row remained. |
| H-2d | Unconfigured chat → the original readiness card is still correct here | ✅ PASS — in a separate disposable private group that had never been configured, an administrator sent `/setup` once and received exactly one readiness card with bold `Set up rehearsal planning`, body `This chat is not configured yet.`, and exactly one `Start setup` button. No `Setup in progress` response appeared, and the button was not pressed. |
| H-2e | After `docker compose restart bot`, the configured-chat behaviour is unchanged | ✅ PASS — after a bot-only restart, the same administrator sent `/setup` and received exactly one `Setup in progress` response at `Step 2 of 8` with `Choose the default rehearsal weekday.` and the same seven weekday buttons. It did not reset to Step 1 or show `This chat is not configured yet.` The bot start time changed, PostgreSQL stayed healthy and unchanged, the named volume stayed unchanged, and a fresh long-poll startup record appeared. A sanitized read-only aggregate still found one active draft with its previously selected time-zone value saved, no weekday selected, and expected revision 5. |

**This row is UAT test 22.** All five sub-rows now pass, so test 22 is recorded as passed in `01-UAT.md`; this does not imply any other Run 3 row or the final verdict.

Evidence for H-2a/H-2b/H-2c/H-2d/H-2e: operator-supplied Telegram screenshots were visually inspected on 2026-08-27 and were not copied into the repository. The aggregate comparisons selected no identifiers or setup values. No location, coordinate, resolved zone, credential, private Telegram identity, group name, or unrelated chat-list content was recorded.

### H-3 — UAT test 24: product wording matches shipped behaviour

**What this is.** An administrator acknowledgement, not an automated check. `01-16-SUMMARY.md` coverage D8 declared it a human checkpoint because only the `PROJECT.md` half of the decision landed inside the parallel wave — `STATE.md` writes are reserved for the orchestrator, and the superseded bullet was tracked as broken window 13 (now `fixed`).

**Expected.** Both `PROJECT.md` and `STATE.md` carry the plan 01-16 wording — a callback is acknowledged exactly once per `callback_query.id`, deferred to the branch that owns the outcome, with a boundary-level fallback — and **neither** still carries the superseded "protected callbacks acknowledge before a live role lookup" bullet. The administrator confirms the two documents agree with each other **and** with what they just observed in the live chat.

| Sub-row | Observation | Result |
|---|---|---|
| H-3a | `PROJECT.md` carries the superseding wording and not the superseded bullet | _to be filled_ |
| H-3b | `STATE.md` carries the superseding wording and not the superseded bullet | _to be filled_ |
| H-3c | Administrator confirms the shipped behaviour matches that wording | _to be filled_ |

**This row is UAT test 24.** It stays `[pending]` in `01-UAT.md` until filled in here.

## Run 3 — acceptance criteria roll-up

Fill in only after every non-deferred row above has an observation.

| # | Criterion | Run 3 status |
|---|---|---|
| AC-1 | A real location update reaches the correct actor-bound step and yields a confirmable IANA candidate | _to be filled_ |
| AC-2 | Every candidate has its own action, only the selected zone reaches review/save, and no raw coordinates appear in logs or evidence | _to be filled_ |
| AC-3 | Configuration and roster survive a bot restart and match the saved projection | _to be filled_ |
| AC-4 | Demotion takes effect from the next command/callback, discards the actor's draft, and is not bypassed by a previous success | _to be filled_ |
| AC-5 | Message hierarchy, verbatim texts, inline buttons, immediate callback completion, wrapping, pagination and safe identity match the UI contract | _to be filled_ |

## Run 3 — verdict

**Approval is a human outcome.** It is recorded here only after every non-deferred row and all three high-attention rows carry an observation, and only by the administrator who performed the run. This runbook does not pre-fill it, and a green automated gate does not authorize it: Runs 1 and 2 were both NOT APPROVED against suites that were green at the time.

| Field | Value |
|---|---|
| Run 3 verdict | _empty — to be recorded by the human operator_ |
| Recorded by | _empty_ |
| Recorded on | _empty_ |
| New findings, if any | _empty — record as F-12, F-13, … and file each as a broken window_ |

**If any required row fails:** record the observation as-is, do not massage it towards green, open a broken window for it, and leave the verdict NOT APPROVED. That is precisely how Runs 1 and 2 produced the evidence this phase now stands on.
