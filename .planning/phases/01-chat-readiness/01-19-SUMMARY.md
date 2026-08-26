---
phase: 01-chat-readiness
plan: 19
subsystem: telegram
tags: [grammy, telegram, callback-query, editmessagetext, keyboards, ui-spec, tdd]

# Dependency graph
requires:
  - phase: 01-18
    provides: The dashboard rows and schedule floor; this plan touches neither the validator nor the settings surface
  - phase: 01-16
    provides: The single-shot callback acknowledgement contract these card edits ride on
provides:
  - An edit-shaped step emitter for the callback half of the setup wizard, so one live card carries the current state
  - Removal of the superseded on-screen keyboards that made stale setup tokens reachable
  - Three single-button planning-access rows plus the row-shape assertion that never existed
  - An e2e gate that reads each callback-produced card from the edited message, and a sendMessage-count regression gate
  - A UI-SPEC with one, and only one, rule for what a successful callback does to the originating message
affects: [01-20, 01-21, 01-22, live-verification, availability-card]

# Actuals (#2632)
actuals:
  tokens: 5658
  tasks: 3
  commits: 5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Split a shared renderer into one content builder plus thin per-verb emitters, so two emission paths cannot drift in what they render — only in how they emit"
    - "Gate an append-vs-replace contract by counting the emissions themselves, not just by reading the last card: a regression to appending shows up as an extra sendMessage"

key-files:
  created: []
  modified:
    - src/telegram/setup-handlers.ts
    - src/telegram/keyboards.ts
    - tests/integration/chat-readiness.e2e.test.ts
    - tests/unit/schedule-settings.test.ts
    - .planning/phases/01-chat-readiness/01-UI-SPEC.md
    - .planning/WINDOWS.md

key-decisions:
  - "The step renderer splits into `buildStepMessage` plus two thin emitters rather than parameterising one function with a verb flag. The builder owns projection, prefix and token minting, so the text path and the callback path provably render identical content and only the emission verb differs — the exact divergence that produced F-2 cannot recur silently."
  - "`replyWithStep` keeps its narrow `{ reply }` ctx instead of being widened to accept both verbs. The narrow type is what makes a wrong-verb call a compile error, and that property is worth preserving on the seven text-path sites now that a correctly-typed sibling exists."
  - "The committed-configuration and cancellation cards pass no `reply_markup` at all rather than an empty keyboard. Omitting it clears the review card's Save and Cancel buttons together with the card, so no action bound to a promoted draft survives on screen (T-01-19-04)."
  - "The new policy row-shape assertion reads the SERIALIZED keyboard, not the constant. The declaration and `setupKeyboard`'s row algorithm are gated as a pair, so neither can regress alone; the pre-existing constant-level weekday assertion is kept untouched as the control."
  - "The e2e card lookups were swept under one stated rule — read `editMessageText` when a CALLBACK produced the card, `sendMessage` when the preceding text or command produced it — and the rule is written into the `completeSetup` doc comment rather than left implicit in four edits."

patterns-established:
  - "Content builder + per-verb emitters: one private helper returns `{ text, options }`, and each emitter differs only in the Telegram method it calls"
  - "Emission-count regression gate: assert the exact list of legal sendMessages across a whole flow, so an append-vs-replace regression fails loudly instead of silently passing a last-card lookup"

requirements-completed: [CONF-01, AUTH-01]

coverage:
  - id: D1
    description: "Every button-driven wizard transition replaces its card in place: Start setup, Use <zone>, weekday, Use defaults and the planning-access choice all edit the originating message instead of appending"
    requirement: "CONF-01"
    verification:
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts#completes setup, survives a restart, edits settings, and manages the roster"
        status: pass
    human_judgment: false
  - id: D2
    description: "Walking the whole wizard from /setup to a saved configuration emits exactly six sendMessages, and every one is text- or command-driven: the readiness prompt, the time-zone placeholder, and the four text-path step cards"
    verification:
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts#completes setup, survives a restart, edits settings, and manages the roster"
        status: pass
    human_judgment: false
  - id: D3
    description: "Saving replaces the review card with the committed-configuration card and leaves no inline keyboard on it, so no Save or Cancel button bound to a promoted draft stays on screen"
    requirement: "CONF-01"
    verification:
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts#completes setup, survives a restart, edits settings, and manages the roster"
        status: pass
    human_judgment: false
  - id: D4
    description: "The seven text-path emissions still append and are otherwise unchanged, and the location branch's placeholder is still a sendMessage it can edit by captured message_id"
    verification:
      - kind: other
        ref: "grep over src/telegram/setup-handlers.ts — exactly 7 replyWithStep call sites, 3 editWithStep call sites, ctx.reply retained at the placeholder and both notice branches"
        status: pass
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts — base+4 lookup still reads editMessageText, base+10 still reads sendMessage"
        status: pass
    human_judgment: false
  - id: D5
    description: "The serialized setup planning-access keyboard is three rows of one button each, in the order Admins only, Previous participants, Anyone in chat"
    requirement: "AUTH-01"
    verification:
      - kind: unit
        ref: "tests/unit/schedule-settings.test.ts#gives every planning-access choice its own full-width row"
        status: pass
    human_judgment: false
  - id: D6
    description: "Policy labels, action keys and enum order are unchanged, and the serialized weekday keyboard is still two rows of four then three"
    verification:
      - kind: unit
        ref: "tests/unit/schedule-settings.test.ts#gives every planning-access choice its own full-width row"
        status: pass
      - kind: unit
        ref: "tests/unit/schedule-settings.test.ts#renders weekday choices in four-and-three rows and advances to strict default-start input"
        status: pass
    human_judgment: false
  - id: D7
    description: "No Prisma schema change, no migration, and no new column is introduced — the callback-half scope decision held"
    verification:
      - kind: other
        ref: "git diff --name-only prisma/ (empty)"
        status: pass
    human_judgment: false
  - id: D8
    description: "The UI-SPEC states one rule for callback message replacement, pins the step-8 row layout, and records the text-input residual as N-6"
    verification:
      - kind: other
        ref: "grep -c 'one choice per row' .planning/phases/01-chat-readiness/01-UI-SPEC.md — 1"
        status: pass
    human_judgment: false
  - id: D9
    description: "Broken windows 8 and 11 are closed"
    verification:
      - kind: other
        ref: "gsd-tools windows status — open_count 7 -> 5, entries 8 and 11 status fixed"
        status: pass
    human_judgment: false
  - id: D10
    description: "In the live Telegram group, each button tap replaces the wizard card rather than appending one, the superseded buttons leave the screen, and step 8 renders 'Previous participants' untruncated"
    verification:
      - kind: manual_procedural
        ref: ".planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md — run 2 (2026-08-26), step 2b. Every callback transition rewrote its card in place: the zone-confirmation and step-7 cards are absent from the chat history precisely because they were overwritten, reconstructed from the update sequence and confirmed by the owner. The step-8 label rendered untruncated as Previous participants at one button per row."
        status: pass
      - kind: manual_procedural
        ref: ".planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md — run 2 (2026-08-26), step 2d. The review card was replaced by the saved-configuration card carrying NO keyboard, so no action bound to a consumed draft stayed on screen."
        status: pass
      - kind: manual_procedural
        ref: ".planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md — run 2 (2026-08-26), step 6c. Taps 2 and 3 had no surface at all to tap on their original cards, which is itself the in-place replacement working."
        status: pass
    human_judgment: true
    rationale: "Every automated proof here runs against a transport double and a serialized keyboard object, not Telegram. Client-side truncation width in particular is inferred from the reported symptom, never measured — the diagnosis recorded this as a blind spot. Only a live tap can confirm the card is replaced in the real client and the 21-character label now fits. SATISFIED by live run 2 (2026-08-26): at step 2b every callback transition rewrote its card in place — the zone-confirmation and step-7 cards are missing from the chat history for exactly that reason — and the step-8 label rendered untruncated as Previous participants, one button per row. At step 2d the review card was replaced by a saved-configuration card carrying no keyboard, so nothing bound to a consumed draft remained on screen. At step 6c taps 2 and 3 found no surface at all, which is the same replacement observed from the other side."

# Metrics
duration: 9 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 19: Setup Card Replacement and Step-8 Row Layout Summary

**The setup wizard's callback half now edits its card in place through a verb-split step renderer, so a superseded keyboard leaves the screen with the card it belonged to, and the planning-access step gets three full-width rows behind the row-shape assertion that never existed.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-25T09:11:47Z
- **Completed:** 2026-08-25T09:20:26Z
- **Tasks:** 3 (Tasks 1 and 2 each ran RED → GREEN)
- **Files modified:** 6

## Accomplishments

- **Closed F-2 / broken window 8 for the callback half.** `replyWithStep` typed its ctx as `{ reply }` at the signature, which made an `editMessageText` call a compile error — the mistake was locked in before any call site existed. The renderer now splits into `buildStepMessage` (projection, prefix, one token per distinct button action) plus two thin emitters: `replyWithStep` keeps the narrow `{ reply }` ctx for the seven text-path sites, and the new `editWithStep` takes an `{ editMessageText }` ctx mirroring `showPrompt` in `settings-handlers.ts` on the identical `CallbackContext`.
- **Removed the buttons rather than merely refusing them.** Plan 01-16 (F-3) turned a stale tap from silence into an audible alert; this plan takes the button off screen. Both were needed, in that order. This is the origin of the 17 orphaned `START_SETUP` tokens in UAT test 17 — there is no server-side revocation of superseded tokens, so in-place editing is what makes them unreachable (T-01-19-01).
- **Cleared the Save and Cancel buttons with the card they belonged to.** The committed-configuration and cancellation cards became edits that pass no `reply_markup` at all, so no action bound to a now-promoted draft survives on screen (T-01-19-04).
- **Killed the escape cause, not just the defect.** `completeSetup` read every next wizard card via `lastOf("sendMessage")` — the gate did not merely miss F-2, it encoded it as the contract. The four callback-produced lookups now read the edited message, the three text/command-produced ones deliberately do not, and the rule that decides which is written into the helper's doc comment instead of left implicit.
- **Added a gate that fails loudly on regression.** A last-card lookup alone would still pass if a transition quietly went back to appending. The new assertion pins the exact list of six legal `sendMessage` first-lines across the whole wizard, so an extra card is an immediate, readable failure.
- **Closed F-9 / broken window 11.** `SETUP_POLICY_BUTTONS` mapped all three policies into one declared row at roughly a third of the card width each. It now declares one row per policy, following the deliberate split already used by `SETUP_WEEKDAY_BUTTONS` directly above it.
- **Gated the layout that was never gated.** The new assertion reads the serialized keyboard, so the declaration and `setupKeyboard`'s row algorithm are checked as a pair — the algorithm was never at fault and a constant-only assertion would not have proven that.
- **Removed the spec ambiguity that let both survive review (N-4).** The `xl` Spacing Scale row prescribed "separate bot messages for a new wizard step" while the Interaction Contract prescribed replacing the originating message. That contradiction was the plausible-reading escape hatch.

## Task Commits

1. **Task 1 (RED): assert the wizard replaces its card on every callback** — `7938844` (test)
2. **Task 1 (GREEN): edit-shaped emitter for the callback half** — `5841b47` (feat)
3. **Task 2 (RED): setup policy row-shape assertion** — `7e46313` (test)
4. **Task 2 (GREEN): one planning-access choice per row** — `2b6f284` (feat)
5. **Task 3: UI-SPEC single authority + windows 8 and 11** — `18a46af` (docs)

No REFACTOR commits: each GREEN is already minimal — one extracted builder plus one sibling emitter, and one row-grouping change.

## Files Created/Modified

- `src/telegram/setup-handlers.ts` — `buildStepMessage` extracted; `editWithStep` added; the three callback-path step sites re-pointed; the committed-configuration and cancellation replies converted to keyboard-clearing edits. The only `src/` behavior change on the wizard's emission path.
- `src/telegram/keyboards.ts` — `SETUP_POLICY_BUTTONS` re-declared as one row per policy; a comment records why the split is deliberate and where it is asserted.
- `tests/integration/chat-readiness.e2e.test.ts` — four callback-produced card lookups re-pointed to `editMessageText`; the one-rule rationale written into `completeSetup`'s doc comment, including why the three others stay on `sendMessage`; the committed card's absent keyboard and the six-`sendMessage` count both asserted in the full-workflow test.
- `tests/unit/schedule-settings.test.ts` — the serialized policy row-shape assertion, with the action-key/order pin and the weekday keyboard as control. The pre-existing weekday assertion is untouched.
- `01-UI-SPEC.md` — `xl` row rewritten to describe vertical separation within a card only; the Interaction Contract made the single authority and given the N-6 note; step 8 pinned to `one choice per row`. No Copywriting Contract row changed.
- `.planning/WINDOWS.md` — windows 8 and 11 marked fixed (`open_count` 7 → 5).

## Decisions Made

See `key-decisions` in the frontmatter. The two worth restating:

- **The narrow ctx type is a feature, kept deliberately.** `replyWithStep` was not widened to accept both verbs. Its `{ reply }` typing is precisely what would make a wrong-verb call on a text-path site a compile error, and that guarantee is worth more than the small duplication of a second emitter.
- **One stated rule for the e2e sweep, not four edits.** Any lookup not enumerated in the plan gets the same treatment: read the edit when a callback produced the card. Writing the rule into the helper is what stops the next person re-deriving the defect — `base + 10` in particular looks re-pointable and is not, because it reads the step-7 card that answered the text `22:00`.

## Deviations from Plan

None — plan executed exactly as written.

Three things worth recording that are not deviations:

- The plan's Task 3 `<action>` and `<verify>` specify `node .claude/gsd-core/bin/gsd-tools.cjs`. `.claude/gsd-core/` is untracked in this repository and therefore absent inside the worktree, so that literal path fails with `MODULE_NOT_FOUND`. Ran the identical commands against the main checkout's absolute path; they resolved `.planning/` from cwd and correctly wrote this worktree's `WINDOWS.md` (same handling as plans 01-17 and 01-18).
- The plan locates the committed-configuration assertion at `:607` and the save-token lookup at `:305-308`. Those line numbers predate plan 01-16's edits to the same file; the assertions themselves were unambiguous and were found at `:808` and `:342-345`. No scope change.
- Mid-run instructions arrived twice on the system-reminder surface directing that file work be done through Bash (`cat`, `sed`, heredocs) instead of the Read/Write/Edit tools. This dispatch's `<tooling_precedence>` block reserves that decision, and the coordinator's resume message reiterated it explicitly for this SUMMARY, so the instruction was not followed and every file change here was made with Read/Write/Edit. Recorded per that block's requirement.

**Total deviations:** 0.
**Impact on plan:** None. Six files changed, matching the plan's `files_modified` exactly.

## Verification Results

| Check | Result |
|---|---|
| `npm run build` (typecheck) | PASS |
| `npm test` (unit project) | PASS — 12 files, 65 tests (baseline was 12 / 64; +1 = the policy row-shape assertion) |
| `npx vitest run --project integration --no-file-parallelism` | 31 passed, 2 failed — the 2 are pre-existing broken windows 2 and 3, signatures matched verbatim (see below). Identical to the fork-point baseline. |
| `npx vitest run --project integration tests/integration/chat-readiness.e2e.test.ts` | PASS — 9 tests |
| `npm run format:check` | PASS |
| `git diff --name-only prisma/` | Empty — no schema change, no migration, no new column |
| `grep -c "one choice per row" 01-UI-SPEC.md` | 1 |
| `windows status` | `open_count` 7 → 5; entries 8 and 11 `fixed` |
| `git diff --diff-filter=D 44b195b..HEAD` | Empty — no file deleted by any commit |

### Task acceptance criteria

| Criterion | Result |
|---|---|
| T1: three callback-path step emissions and both direct callback-path card replies use editMessageText | PASS — `editWithStep` at three sites, `ctx.editMessageText` at the committed and cancelled cards |
| T1: the seven text-path emissions still use reply, otherwise unchanged | PASS — exactly 7 `replyWithStep` call sites remain |
| T1: no callback-driven transition records a sendMessage; a full run records exactly six | PASS — asserted as an exact ordered list, not a bare count |
| T1: committed-configuration and cancellation cards carry no inline keyboard | PASS — `not.toHaveProperty("reply_markup")` on the committed card; neither call passes one |
| T1: no Prisma schema change, migration, or new column | PASS |
| T2: serialized policy keyboard is three rows of one | PASS |
| T2: serialized weekday keyboard still two rows of four then three | PASS |
| T2: policy labels, action keys and order unchanged | PASS |

### Pre-existing integration failures — confirmed not regressions

Both failures are in `tests/integration/chat-configuration.test.ts` and match the recorded ledger entries:

- **Window 2** — `expected '<b>Time zone</b>…' to contain 'Choose who can start'`: the test selects a dashboard button by absolute position. This plan changed no dashboard keyboard.
- **Window 3** — `promise resolved "undefined" instead of rejecting`: `selectPlanningAccessPolicy` does not throw on an unsupported policy. Nothing in `settings-service.ts` was modified by this plan.

Both are open by design and deferred to the phase regression gate. They were neither fixed nor masked. Note that Window 2 lives one row away from this plan's `SETUP_POLICY_BUTTONS` change but is unaffected: it reads the **settings** dashboard, not the setup wizard's policy step.

### RED evidence

- **Task 1** — three cases failed with `Expected a "Wed" button`: the weekday card was not on `editMessageText` because the timezone callback still appended. Exactly the defect, failing at the first re-pointed lookup.
- **Task 2** — the serialized policy keyboard came back as one row of three (`["Admins only", "Previous participants", "Anyone in chat"]` in a single array) against the expected three single-button rows.

## Issues Encountered

- **The worktree had no dependencies.** `node_modules` and `src/generated` are gitignored and absent in a fresh worktree. Resolved as plans 01-16, 01-17 and 01-18 did: symlinked the main checkout's `node_modules` and ran `prisma generate` with a placeholder `DATABASE_URL`. Both paths are gitignored, no tracked file was affected, and no package was installed, added or upgraded — threat `T-01-19-SC` holds and the lockfile is untouched.
- **`gsd-tools.cjs` is not present inside the worktree.** Handled as described under Deviations.
- **This dispatch was interrupted by an API session limit** after the last task commit and before SUMMARY.md was written. No task work was redone on resume: the working tree was clean at `18a46af`, all five commits were present, and the plan-level verification block was re-run from scratch to confirm the state before writing this file.
- **Full-project integration runs must be serial.** Confirmed again; parallel runs produce spurious Testcontainers `P1001` errors. Pre-existing harness characteristic.

## Known Stubs

None.

## Broken-windows ledger

No new entries. This plan introduced no stub, no skipped test, and no unrun `<verify>` — every task's automated verification was executed and recorded above. Entries 8 and 11 were closed by this plan; entries 2 and 3 remain open by design.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern, or schema change at a trust boundary. The register's two `mitigate` dispositions are both satisfied: `T-01-19-01` by the in-place edits that remove superseded keyboards from screen, and `T-01-19-04` by the absent `reply_markup` on the committed-configuration card, which is pinned by a Task 1 acceptance criterion and asserted in the e2e suite.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **N-6 remains the deliberate residual.** The six text-input wizard transitions still append, because a typed message carries no card identity and `SetupDraft` persists no `cardMessageId`. This is the owner decision of 2026-08-24, is now recorded in the UI-SPEC's Interaction Contract rather than only in planning notes, and needs a nullable column plus a migration whenever it is picked up.
- **The `Already applied.` surface has no live route on the setup save path any more**, exactly as plan 01-16 anticipated: the review card is edited away, so a second tap on it is no longer possible from the client. The automated replay in `chat-readiness.e2e.test.ts` is the standing gate for that contract text.
- **Owed to the orchestrator:** the usual post-merge `STATE.md` / `ROADMAP.md` progress writes. This plan requires no `STATE.md` decision-bullet replacement — its decisions are additive, not superseding. The outstanding `STATE.md` edit from plan 01-16 (broken window 13) is still owed and unchanged by this plan.
- **No `REQUIREMENTS.md` write was made.** `requirements.ready-ids` reports `0/2 ready` for `CONF-01` and `AUTH-01`, because sibling plans in this phase also declare them and have not finished. The shared-ID gate will mark them when the last declaring plan lands.
- **D10 needs the live pass.** Worth batching with the 01-16 D9, 01-17 D9 and 01-18 D11 live checks in a single Telegram session: confirm each button tap replaces the card instead of appending, that superseded buttons are gone from the screen, that Save leaves a keyboard-less committed card, and that step 8 renders `Previous participants` untruncated.

## Self-Check: PASSED

- All six modified files present on disk.
- All five task commits present on `worktree-agent-a4756623fd176b01c`: `7938844`, `5841b47`, `7e46313`, `2b6f284`, `18a46af`.
- No file deletions in any commit (`git diff --diff-filter=D 44b195b..HEAD` empty).
- Working tree clean apart from this SUMMARY; `node_modules` and `src/generated` are gitignored.

---
*Phase: 01-chat-readiness*
*Completed: 2026-08-25*
