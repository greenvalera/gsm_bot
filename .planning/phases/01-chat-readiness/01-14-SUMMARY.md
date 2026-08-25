---
phase: 01-chat-readiness
plan: 14
subsystem: infra
tags: [pino, redaction, github-actions, ci, docker, geo-tz, prisma-migrate, live-verification]

# Dependency graph
requires:
  - phase: 01-13
    provides: The composed route registration and callback boundary the live run exercised end to end
  - phase: 01-04
    provides: The production Dockerfile and Compose stack the CI image gate builds and the live run started
provides:
  - A redacting structured logger (`src/shared/logger.ts`) built on an allow list rather than a deny list
  - Pull-request CI covering format, lint, typecheck, unit tests, committed migrations against fresh PostgreSQL 18, integration tests, the production image build, and a geo-tz runtime-data smoke gate
  - The executed live-verification record (`01-LIVE-VERIFICATION-RUNBOOK.md`) and its nine findings
  - The Phase 1 validation map with `nyquist_compliant` left `false` and its four evidence gaps named
affects: [01-16, 01-17, 01-18, 01-19, 01-20, 01-21, 01-22, live-verification, phase-verification]

# Actuals (#2632)
actuals:
  tokens: 24800
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Log redaction is an ALLOW list, not a deny list: a deny list must predict every field name a future handler might log and fails silently the first time it guesses wrong"
    - "An error is rendered structurally only under the `err`/`error` key — as name, message and code, with the stack dropped — so an error value can never be stringified into a message or an allow-listed key"
    - "CI installs from the approved lockfile with `npm ci` and installs no package; the production image is smoke-tested for geo-tz boundary data and a known-coordinate lookup before it can pass"
    - "A live-verification run records observed behaviour verbatim and never approves around a mismatch"

key-files:
  created:
    - src/shared/logger.ts
    - tests/unit/logger.test.ts
    - .github/workflows/ci.yml
    - .planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md
  modified:
    - src/app/main.ts
    - .planning/phases/01-chat-readiness/01-VALIDATION.md
    - .planning/WINDOWS.md
    - .gitignore

key-decisions:
  - "Redaction is an allow list of bounded identifiers, classifications and counters. Every other key is replaced without ever being read, so raw updates, coordinates, callback tokens, draft payloads and roster identity cannot leak through a field name nobody predicted."
  - "The IANA zone is deliberately absent from the allow list: a resolved zone is a proxy for the shared location, so recording it would defeat the coordinate-redaction guarantee by another route."
  - "CI is expected to report red on broken windows 2 and 3 rather than skip, filter or `continue-on-error` around them. Registering a failure and then hiding it from the gate defeats the point of registering it."
  - "The live run changed no code. It was executed against exactly the commits recorded in the phase so that the verification described the shipped tree, not a tree repaired mid-run."
  - "The run was recorded NOT approved with all nine discrepancies written down as observed. No finding was waived, softened or fixed inline to reach a green verdict."

patterns-established:
  - "Allow-list redaction: enumerate what may be logged, replace everything else unread"
  - "Findings from a live run become numbered broken windows before any fix is planned, so the fix order can be reasoned about across sessions"

requirements-completed:
  [
    CONF-01,
    CONF-02,
    CONF-03,
    CONF-05,
    ROST-01,
    ROST-02,
    ROST-03,
    AUTH-01,
    AUTH-02,
  ]

coverage:
  - id: D1
    description: Structured logs redact secrets, raw updates, coordinates, callback and draft payloads, and full roster identity while retaining bounded diagnostic identifiers
    requirement: CONF-01
    verification:
      - kind: unit
        ref: tests/unit/logger.test.ts#writes no secret, raw update, coordinate, callback, draft, or roster identity value
        status: pass
      - kind: unit
        ref: tests/unit/logger.test.ts#retains bounded diagnostic identifiers and action kinds
        status: pass
      - kind: unit
        ref: tests/unit/logger.test.ts#scrubs unregistered secrets that match a token or connection-URL shape
        status: pass
      - kind: unit
        ref: tests/unit/logger.test.ts#redacts a non-Error throw value instead of serializing it
        status: pass
    human_judgment: false
  - id: D2
    description: A clean-install CI run deterministically gates formatting, lint, types, unit and integration tests, and committed PostgreSQL migrations applied to a fresh service
    requirement: CONF-05
    verification:
      - kind: other
        ref: ".github/workflows/ci.yml — job 'Format, static checks, migrations, tests': npm ci, format:check, lint, prisma generate, typecheck, unit tests, migrate deploy, migrate status, integration tests"
        status: pass
    human_judgment: false
  - id: D3
    description: CI fails when the production image omits geo-tz boundary data or cannot resolve a known coordinate through geo-tz/dist/find-now
    requirement: CONF-01
    verification:
      - kind: other
        ref: ".github/workflows/ci.yml — job 'Production image and geo-tz runtime data': builds the image, then asserts node_modules/geo-tz/data exists and a known-coordinate dist/find-now lookup returns a non-empty candidate list"
        status: pass
    human_judgment: false
  - id: D4
    description: The Phase 1 validation map names the final plan/task/wave inventory and withholds Nyquist compliance until its evidence gaps are closed
    verification:
      - kind: manual_procedural
        ref: .planning/phases/01-chat-readiness/01-VALIDATION.md — nyquist_compliant remains false with four named, unwaived evidence gaps
        status: pass
    human_judgment: true
    rationale: "The map is a hand-authored document. What can be checked mechanically is only that the flag is still false; that every row names a real plan, task and wave, and that each cited command was actually green, was established by reading, not by any gate. Recording it as automated would claim a proof that does not exist."
  - id: D5
    description: A live private Telegram group confirms location sharing, callback acknowledgement, message hierarchy and copy, restart persistence, roster removal, and immediate demotion behaviour
    verification: []
    human_judgment: true
    rationale: "EXECUTED AND NOT APPROVED. The run happened on 2026-08-24 against a real bot in a real private group and returned a negative verdict: AC-5 failed, AC-2/AC-3/AC-4 partial, nine findings F-1..F-9. This deliverable is NOT satisfied. Nothing automated can stand in for it — Telegram client rendering and live getChatMember demotion timing are exactly what mocked updates cannot prove — so it must stay a human-judgment item until a re-run against the repaired build returns approved. See 01-LIVE-VERIFICATION-RUNBOOK.md."

# Metrics
duration: unrecorded
completed: 2026-08-24
status: halted
---

# Phase 01 Plan 14: CI, Redacted Observability, and Live Verification Summary

**Task 1 shipped allow-list log redaction and a pull-request CI pipeline gating format, migrations, every test tier, the production image and its geo-tz runtime data; Task 2 then ran the live Telegram verification and returned NOT APPROVED with nine findings, so the plan's live-verification truth is still open.**

> **This summary was written retroactively by plan 01-22**, on 2026-08-25, from the
> plan file, the three `01-14` commits and the evidence the run itself recorded.
> Plan 01-14 finished its work but never produced a SUMMARY, which left the phase
> history non-contiguous and its roadmap row unreconcilable. Nothing here is
> reconstructed from memory: every claim traces to a commit or to a recorded
> observation. Where the run failed, it is recorded as failed.

## Status: halted, not complete

`status: halted` is deliberate. Task 1 is delivered and committed. Task 2 — the
plan's blocking `checkpoint:human-verify` — **executed and returned a negative
verdict**. The plan's fourth `must_haves` truth ("A live private Telegram group
confirms location sharing, callback acknowledgement, exact message
hierarchy/copy, restart persistence, roster removal, and immediate demotion
behavior") is **NOT satisfied** and remains open pending a re-run against the
repaired build. Marking this plan `complete` would record a passed live gate that
never passed.

## Performance

- **Duration:** unrecorded (no SUMMARY was written at execution time; the two work
  sessions are dated 2026-08-21 and 2026-08-24)
- **Started:** 2026-08-21 (Task 1)
- **Completed:** 2026-08-24 (Task 2 run and findings recorded)
- **Tasks:** 2 (1 delivered, 1 executed with a not-approved verdict)
- **Files modified:** 12 across three commits (4 created, 8 modified)

## Accomplishments

- **Allow-list log redaction.** `src/shared/logger.ts` wraps Pino behind a
  `SafeLogger` whose `ALLOWED_FIELDS` set enumerates the bounded identifiers,
  classifications and counters that may be logged. Every other key is replaced
  with `[redacted]` **without being read**. An allowed key may carry scalars
  only — an object under a safe name is redacted rather than walked — and an
  error is rendered structurally only under `err`/`error`, as name, message and
  code, with the stack dropped and bot-token and connection-string shapes
  scrubbed out of the message.
- **`main.ts` moved onto the redacting logger** for runtime error and lifecycle
  events instead of serializing raw context.
- **Pull-request CI.** `.github/workflows/ci.yml` runs `npm ci` from the approved
  lockfile, then the pinned `format:check` before lint, Prisma Client generation,
  typecheck, unit tests, `migrate deploy` plus `migrate status` against a fresh
  PostgreSQL 18 service, and the integration tier — followed by a second job that
  builds the production image and smoke-tests it.
- **geo-tz runtime-data gate.** The built image must contain
  `node_modules/geo-tz/data` and must resolve a known coordinate through
  `geo-tz/dist/find-now` to a non-empty candidate list, or CI fails. This is the
  gate that stops a slimmed image from silently losing boundary data.
- **The live verification actually ran** — against a real bot, in a real private
  group, with a second human account — and its results were written down verbatim
  in `01-LIVE-VERIFICATION-RUNBOOK.md` rather than summarised into a verdict.
- **Nine findings registered as broken windows 4-12** so the repair order could be
  reasoned about in a later session.
- **`.gitignore` hardened** so the live-run `.env`, which holds a real bot token,
  cannot be committed.

## Task Commits

1. **Task 1: CI, redaction, and the validation map** — `f55e0f6` (feat)
   — `.github/workflows/ci.yml`, `src/shared/logger.ts`, `tests/unit/logger.test.ts`,
   `src/app/main.ts`, `01-VALIDATION.md`
2. **Task 2: live-run findings recorded** — `da2c208` (docs)
   — `01-LIVE-VERIFICATION-RUNBOOK.md`, `.planning/WINDOWS.md`, `.gitignore`
3. **Ledger correction** — `5076cbd` (docs) — closes superseded broken window 1

**Plan metadata:** this file, committed by plan 01-22 (`docs(01-22)`), 2026-08-25.

_No `docs(01-14): complete …` metadata commit exists, because no SUMMARY was
written at the time. That absence is the defect this file repairs._

## Files Created/Modified

- `src/shared/logger.ts` — **created.** `createLogger`/`SafeLogger`; the
  `ALLOWED_FIELDS` allow list, scalar-only allowed values, `safeError`, secret
  scrubbing and the 120-character bound on retained strings.
- `tests/unit/logger.test.ts` — **created.** Six cases feeding representative
  tokens, database URLs, coordinates (`50.4501`/`30.5234`), callback tokens,
  draft payloads and full Telegram user objects, asserting none survives.
- `.github/workflows/ci.yml` — **created.** Two jobs: static checks + migrations
  + tests, and production image + geo-tz runtime-data smoke.
- `.planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md` —
  **created.** The executed run: preparation, six steps, per-step observations,
  the AC table, the NOT-approved verdict, the nine findings, and a recommended
  repair order.
- `src/app/main.ts` — runtime events routed through the redacting logger.
- `.planning/phases/01-chat-readiness/01-VALIDATION.md` — final task map;
  `nyquist_compliant` left `false` with four named evidence gaps.
- `.planning/WINDOWS.md` — findings F-1…F-9 registered as windows 4-12.
- `.gitignore` — `.env` containing the live bot token kept out of git.

## Live Verification Result: NOT APPROVED

**Run date:** 2026-08-24. **Verdict:** not `approved`.

| Acceptance criterion | Result |
|---|---|
| AC-1 — real location update reaches the actor-bound step and yields a confirmable IANA candidate | ✅ PASS |
| AC-2 — every candidate has its own action, only the selected zone reaches review/save, no raw coordinates | ⚠️ PARTIAL — one candidate returned, so the multi-candidate branch was not observed (deliberately skipped by owner decision); the coordinate clause was satisfied constructively, **not** by step 2e — see F-4 |
| AC-3 — configuration and roster survive restart | ⚠️ PARTIAL — configuration verified against the database; the roster was not re-checked after a restart (deliberately skipped by owner decision) |
| AC-4 — demotion takes effect on the next protected action and discards the actor draft | ⚠️ PARTIAL — draft discard proven from data; the callback branch was not exercised, and the command branch is inconclusive because F-7 produced the same refusal without any demotion |
| AC-5 — message hierarchy, verbatim copy, inline buttons, immediate callback completion, wrapping, pagination, safe identity | ❌ FAIL — F-2, F-3, F-5, F-7, F-8, F-9 |

Discrepancies were recorded as observed and were not adjusted toward green.

## The Nine Findings and Where Each Was Closed

| Finding | What was observed | Gap | Window | Closed by |
|---|---|---|---|---|
| **F-1** | Wizard steps 3, 5 and 6 show an identical time hint that never says which time is being entered, while step 7 already uses the correct leading-sentence pattern | G-01-3 | 9 | **01-20** — `a5e96f2 feat(01-20): say which time each wizard step is asking for` |
| **F-2** | The setup wizard does not replace its card: each step appends a new one and leaves the previous buttons live | G-01-18 | 8 | **01-19** — `5841b47 feat(01-19): replace the setup card in place on every callback transition` |
| **F-3** | No private callback alert is ever shown, so four verbatim contract texts are unreachable — and the failure is silent | G-01-17 | 4 | **01-16** — `106f2ee feat(01-16): make the honoured callback answer the one carrying the outcome` |
| **F-4** | No logging at all on the update path, so runbook step 2e ("no raw coordinates in logs") passed only **vacuously** and silent failures like F-3 were undetectable | G-01-6 | 12 | **01-21** (logger wiring, route and boundary records, the non-vacuity guard) **and 01-22** (bound the twelve discarding catch clauses; rewrote step 2e and UAT test 6 to prove emission before absence) |
| **F-5** | `Edit daily boundaries` collects only the start value; the daily end is permanently unreachable from the UI after setup | G-01-8 | 6 | **01-18** — `10054d6 feat(01-18): give the daily end its own dashboard row` |
| **F-6** | No `defaultStart >= dailyStart` check; an incoherent schedule was already committed to the database as evidence | G-01-8 | 7 | **01-18** — `0a699b5 feat(01-18): anchor the rehearsal to the daily window floor` |
| **F-7** | The bot replies with the administrator-denial text to an ordinary non-administrator message — in a live group, to every one | G-01-14 | 5 | **01-17** — `1bce8f6 feat(01-17): establish route ownership before authorizing update branches` |
| **F-8** | The empty-roster surface appeared to be missing its final line | G-01-15 | 10 | **01-20** — `00e38c7 docs(01-20): correct the empty-roster expectation, not the renderer`. **Waived as misfiled:** the renderer matched the Copywriting Contract byte-for-byte; the defect was a duplicated sentence in `01-UI-SPEC.md` that the runbook transcription promoted into a third required line. The gap is recorded `status: invalid`. |
| **F-9** | Truncated label `Previous particip…` caused by three buttons in one row on setup step 8 | G-01-18 | 11 | **01-19** — `2b6f284 feat(01-19): give each planning-access choice its own full-width row` |

A tenth gap, **G-01-19** (every SUMMARY coverage block parses against the schema),
came from the same UAT pass but is not one of the nine live findings; it was closed
by **01-20** — `852060e docs(01-20): make every coverage block parse and every ledger row name its owner`.

**Ledger state at the time of writing:** windows 4-12 are all `fixed` or `waived`.
The two still open are windows 2 and 3, the inherited `chat-configuration.test.ts`
failures, which predate the live run and are not its debt.

## Decisions Made

- **Allow list over deny list for redaction.** A deny list has to predict every
  field name a future handler might log, and it fails silently the first time it
  guesses wrong. The allow list fails closed instead.
- **The resolved IANA zone is not allow-listed.** It is a proxy for the shared
  location; allowing it would reopen the coordinate leak through a different key.
- **CI reports red on windows 2 and 3 rather than routing around them.** No skip,
  no filter, no `continue-on-error`.
- **The live run modified no code.** It exercised exactly the commits recorded in
  the phase, so the verification describes the shipped tree.
- **The verdict was recorded as observed.** Nine discrepancies, no inline repairs,
  no approval around a mismatch.

## Deviations from Plan

The plan's Task 1 was executed as written. Task 2 was executed as written and
**failed**, which is a result, not a deviation.

One documented inconsistency remains from the original execution and is recorded
here rather than silently repaired:

**`01-VALIDATION.md` Evidence Gap #1 still reads "has not run".** The runbook's
closing section states that Evidence Gap #1 "closes as executed", but
`01-VALIDATION.md` was written during Task 1 (2026-08-21) and never revised after
the Task 2 run on 2026-08-24. The two documents therefore disagree about whether
the live verification has happened. `nyquist_compliant: false` is correct either
way — the gap is unclosed on the merits, because the run failed — but the stated
*reason* is stale. Repairing `01-VALIDATION.md` is outside plan 01-22's declared
file set and is left to the phase verification pass.

## Issues Encountered

- **The live run needed operator-only prerequisites** — a `@BotFather` token, a
  dedicated test bot, a private group, and a second human account — which is why
  Task 2 was a blocking checkpoint rather than an automated gate.
- **Two acceptance branches were deliberately not exercised** by owner decision
  during the run: the multi-candidate timezone branch (needs a location near a
  time-zone border) and a post-roster restart (persistence already proven by the
  configuration check against the same database). Both are recorded in the runbook
  as skipped-by-decision, not as passes.
- **F-7 made AC-4's command branch inconclusive.** Because the bot refused
  ordinary messages regardless of role, the demotion refusal could not be
  distinguished from the pre-existing defect. This is why AC-4 is partial rather
  than passed.

## User Setup Required

**Yes — and it is still required for the re-run.** See
[`01-USER-SETUP.md`](./01-USER-SETUP.md): `BOT_TOKEN` for a dedicated test bot,
a private group with the bot as administrator, and a second human test account.

## Next Phase Readiness

- **This plan's live gate is still open.** Its remaining work is the
  re-verification pass, now covered by the `<human-check>` in plan 01-22 and by
  the phase verification step — not by any further code change in this plan.
- **All nine findings are closed in code** by plans 01-16 through 01-22, as
  tabulated above. The re-run validates the repairs; it does not schedule new ones.
- **Runbook step 2e and UAT test 6 have been rewritten** by plan 01-22 to require
  proof of emission before any claim of absence, so the vacuous pass recorded in
  this plan's run cannot recur.
- **`nyquist_compliant` stays `false`** until the re-run returns approved and
  broken windows 2 and 3 receive a disposition.

### Owed to the orchestrator — ROADMAP.md reconciliation

This summary could not edit `ROADMAP.md`: the parallel-wave contract reserves that
file for the orchestrator. The required change is a single line. Replace:

```
- [ ] 01-14-PLAN.md — Enforce CI/observability gates and verify the final live Telegram flow.
```

with:

```
- [~] 01-14-PLAN.md — Enforce CI/observability gates and verify the final live Telegram flow. EXECUTED 2026-08-21/08-24; Task 1 delivered, Task 2 live run returned NOT APPROVED (F-1…F-9, all closed by 01-16…01-22). Summary written by 01-22. Remaining gate: the live re-run in phase verification. Not complete.
```

It must **not** be ticked `[x]`: its live-verification truth is unsatisfied. The
phase progress row (`| 1. Chat Readiness | 20/22 | In Progress|`) should count this
plan's summary as present while leaving the phase In Progress.

## Self-Check

- [x] `01-14-PLAN.md` read; both tasks accounted for against its `must_haves`.
- [x] All three `01-14` commits verified present and their file lists read:
      `f55e0f6`, `da2c208`, `5076cbd`.
- [x] Claimed created files verified on disk: `src/shared/logger.ts`,
      `tests/unit/logger.test.ts`, `.github/workflows/ci.yml`,
      `01-LIVE-VERIFICATION-RUNBOOK.md`.
- [x] Cited unit-test names verified to exist in `tests/unit/logger.test.ts`.
- [x] Cited CI job and step names verified to exist in `.github/workflows/ci.yml`.
- [x] All nine findings mapped to a gap id, a window id and a real closing commit,
      each verified in `git log`.
- [x] Ledger state verified: windows 4-12 `fixed`/`waived`; 2 and 3 open.
- [x] **No statement in this file claims the live verification passed.**
      `status: halted`, D5 carries `verification: []` with `human_judgment: true`,
      and the verdict is recorded as NOT APPROVED throughout.

**Result: PASSED.**

---
*Phase: 01-chat-readiness*
*Executed: 2026-08-21 / 2026-08-24 — Summary reconstructed 2026-08-25 by plan 01-22*
