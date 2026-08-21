---
phase: 01
slug: chat-readiness
status: executed
nyquist_compliant: false
wave_0_complete: true
created: 2026-08-19
last_executed: 2026-08-21
nyquist_blockers:
  - "Plan 01-14 Task 2 (live private-group Telegram verification) has not run: no BOT_TOKEN, no dedicated test bot, no private test group, and no second human test account are available to the executing session."
  - "Broken window 2 — tests/integration/chat-configuration.test.ts:175 still fails (stale keyboard-index expectation)."
  - "Broken window 3 — tests/integration/chat-configuration.test.ts:291 still fails (SettingsService.selectPlanningAccessPolicy resolves undefined instead of throwing)."
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 |
| **Config file** | `vitest.config.ts` — exists (`unit` and `integration` projects, no watch mode) |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm run format:check && npm run lint && npm run typecheck && npm test && npm run test:integration` |
| **Measured runtime** | Quick: **1 s** (52 unit tests, 10 files). Full: **≈22 s** (`format:check` 2 s + `lint` 2 s + `typecheck` <1 s + unit 1 s + integration 16 s). Measured 2026-08-21 on the Plan 01-14 working tree. |
| **Container gates** | `docker build -t gsmbot:phase-01 .` plus the in-image geo-tz data/lookup gate — the gate itself runs in <1 s once the image exists. |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit` — measured at 1 s.
- **After every plan wave:** Run `npm run format:check && npm run lint && npm run typecheck && npm test` — measured at ≈6 s.
- **Before `$gsd-verify-work`:** Run `npm run format:check && npm run lint && npm run typecheck && npm test && npm run test:integration` — measured at ≈22 s.
- **Max feedback latency:** **22 s**, far below the duration of one implementation task. Accepted.

---

## Per-Task Verification Map

Task IDs, plan numbers, and waves reflect the executed 15-plan chain. Historical halted Plan 01-01 kept its wave-1 slot; Plan 01-15 is the approved recovery that unblocked it. Every row names a concrete plan, wave, and task, an automated command, the file that command exercises, and the status observed when the command was last executed (2026-08-21).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 / 01-01-02 | 01-01 | 1 | CONF-01 | T-01-SC | Historical: the resolver dossier halted the phase and `tz-lookup@6.1.25` was rejected; nothing was installed | artifact gate + human | `test`/`rg`/`awk` gates in `01-01-PLAN.md` | ✅ `DEPENDENCY-AUDIT.md` | ✅ green (halt recorded, rejection preserved) |
| 01-15-01 / 01-15-02 | 01-15 | 1 | CONF-01 | T-01-SC / T-01-36 / T-01-37 | Every remaining direct root is independently audited and approved before an install artifact exists; the rejected resolver stays rejected | artifact gate + human | `awk` direct-root approval audit plus the no-install filesystem checks in `01-15-PLAN.md` | ✅ `DEPENDENCY-AUDIT.md` | ✅ green — geo-tz@8.1.8 approved with retained runtime data and mandatory candidate selection; tz-lookup@6.1.25 still rejected |
| 01-02-01 | 01-02 | 2 | CONF-01 / AUTH-02 | T-01-01 / T-01-23 | The `/setup` tracer applies committed migrations and binds drafts and callback actions to the acting administrator | integration | `npm run test:integration -- walking-skeleton` | ✅ `tests/integration/walking-skeleton.test.ts` | ✅ green (5/5) |
| 01-03-01 | 01-03 | 3 | CONF-01 | T-01-08 | Boot input is validated by name only; no secret value reaches an error, and the verification seams are strict and deterministic | unit | `npm run test:unit -- config` | ✅ `tests/unit/config.test.ts` | ✅ green (4/4) |
| 01-04-01 | 01-04 | 4 | CONF-01 | T-01-35 | The production image retains geo-tz boundary data and resolves a known coordinate through `geo-tz/dist/find-now` | container smoke | `docker build -t gsmbot:phase-01 .` plus the in-image gate: `docker run --rm gsmbot:phase-01 sh -c 'test -d node_modules/geo-tz/data && node --input-type=module -e "import { find } from \"geo-tz/dist/find-now\"; const zones = find(47.650499, -122.350070); if (!Array.isArray(zones) \|\| zones.length === 0) process.exit(1)"'` | ✅ `Dockerfile` | ✅ green — resolved `America/Los_Angeles`; a control image with `node_modules/geo-tz/data` deleted exits 1, so the gate is not vacuous |
| 01-05-01 / 01-09-01 | 01-05 / 01-09 | 5 / 9 | CONF-01 | T-01-11 / T-01-40 | Single and ambiguous results get one actor/chat-bound action per valid IANA candidate; invalid, empty, and throwing lookups and stale/duplicate/cross-actor actions are non-mutating | unit + integration | `npm run test:unit -- setup`, `npm run test:unit -- settings`, `npm run test:integration -- chat-configuration` | ✅ `tests/unit/setup.test.ts`, `tests/unit/settings.test.ts`, `src/infrastructure/time/timezone-resolver.ts` | ⚠️ unit green (5/5, 9/9); integration 10/12 — the 2 failures are broken windows 2 and 3, neither in the resolver path |
| 01-07-01 | 01-07 | 7 | CONF-01 | T-01-32 | Setup promotes a confirmed IANA timezone atomically after a fresh administrator check and expected-revision validation | unit + integration | `npm run test:unit -- setup` and `npm run test:integration -- chat-configuration` | ✅ `src/domain/chat/setup-service.ts` | ⚠️ unit green (5/5); integration 10/12 (broken windows 2 and 3) |
| 01-06-01 | 01-06 | 6 | CONF-02 | T-01-10 | Invalid weekday and `HH:MM` inputs never persist | unit | `npm run test:unit -- schedule-settings` | ✅ `tests/unit/schedule-settings.test.ts` | ✅ green (6/6) |
| 01-06-01 | 01-06 | 6 | CONF-03 | T-01-10 | Cross-field schedule invariants reject inconsistent boundaries, duration, and start time | unit + integration | `npm run test:unit -- schedule-settings` and `npm run test:integration -- chat-configuration` | ✅ `src/domain/chat/schedule-validator.ts` | ⚠️ unit green (6/6); integration 10/12 (broken windows 2 and 3) |
| 01-06-01 / 01-09-01 | 01-06 / 01-09 | 6 / 9 | CONF-05 | T-01-10 / T-01-14 | Reminder defaults and edits commit atomically | unit + integration | `npm run test:unit -- schedule-settings`, `npm run test:unit -- settings`, `npm run test:integration -- chat-configuration` | ✅ `src/domain/chat/settings-service.ts` | ⚠️ unit green (6/6, 9/9); integration 10/12 (broken windows 2 and 3) |
| 01-10-01 | 01-10 | 10 | ROST-01 | T-01-18 | Only an identifiable replied-to Telegram user can be added or reactivated | unit + integration | `npm run test:unit -- roster-add` and `npm run test:integration -- roster-repository` | ✅ `tests/unit/roster-add.test.ts`, `tests/integration/roster-repository.test.ts` | ✅ green (3/3, 6/6) |
| 01-11-01 | 01-11 | 11 | ROST-02 | T-01-19 | Removal is initiator-bound, confirmed by name, and idempotent | unit + integration | `npm run test:unit -- roster-remove` and `npm run test:integration -- roster-repository` | ✅ `tests/unit/roster-remove.test.ts` | ✅ green (5/5, 6/6) |
| 01-12-01 | 01-12 | 12 | ROST-03 | T-01-21 | Roster rendering falls back to a safe ID-free label and orders, pages, and fails deterministically | unit | `npm run test:unit -- roster-rendering` | ✅ `tests/unit/roster-rendering.test.ts` | ✅ green (15/15) |
| 01-08-01 | 01-08 | 8 | AUTH-01 | T-01-15 | Planning-start policy persists only supported values and always allows current admins | unit + integration | `npm run test:unit -- planning-access` and `npm run test:integration -- chat-configuration` | ✅ `tests/unit/planning-access.test.ts` | ⚠️ unit green (3/3); integration 10/12 — broken window 3 is exactly this route's unsupported-policy rejection |
| 01-09-02 / 01-13-01 | 01-09 / 01-13 | 9 / 13 | AUTH-02 | T-01-33 / T-01-23 | Every protected route rechecks current administrator status before protected state, and denial discards actor drafts | unit + integration | `npm run test:unit -- authorization` and `npm run test:integration -- chat-readiness.e2e` | ✅ `tests/unit/authorization.test.ts`, `tests/integration/chat-readiness.e2e.test.ts` | ✅ green (2/2, 7/7) |
| 01-14-01 | 01-14 | 14 | CONF-01…AUTH-02 (observability) | T-01-25 | Structured logs write no secret, raw update, coordinate, callback token, draft payload, or roster identity, and retain only bounded diagnostic identifiers | unit | `npm run test:unit -- logger` | ✅ `src/shared/logger.ts`, `tests/unit/logger.test.ts` | ✅ green (6/6) |
| 01-14-01 | 01-14 | 14 | CONF-01…AUTH-02 (pipeline) | T-01-26 / T-01-SC | A clean lockfile install checks pinned formatting first, then lint, types, unit tests, committed migrations against a fresh PostgreSQL 18, integration tests, and the production image | CI workflow | `.github/workflows/ci.yml` — `npm ci`, `npm run format:check`, `npm run lint`, `npm run db:generate`, `npm run typecheck`, `npm test`, `npm run db:migrate:deploy`, `npm run db:migrate:status`, `npm run test:integration`, `docker build` | ✅ `.github/workflows/ci.yml` | ⚠️ every step verified locally on 2026-08-21; the workflow will report red on `npm run test:integration` until broken windows 2 and 3 are closed — deliberately not suppressed |
| 01-14-01 | 01-14 | 14 | CONF-01 | T-01-35 | CI fails when the built image lost geo-tz boundary data or cannot resolve a known coordinate | container smoke in CI | the `image` job in `.github/workflows/ci.yml` (`geo-tz/data` test plus the `dist/find-now` lookup), then `docker compose config -q` | ✅ `.github/workflows/ci.yml` | ✅ green — the identical command run locally resolved `America/Los_Angeles`; `docker compose config -q` exits 0 |
| 01-14-02 | 01-14 | 14 | CONF-01 / ROST-01…03 / AUTH-01 / AUTH-02 | T-01-27 | A live private group confirms location sharing, candidate selection, callback acknowledgement, exact copy, restart persistence, roster removal, and immediate demotion | human (blocking) | `npm run format:check && npm run lint && npm run typecheck && npm test && npm run test:integration && docker compose config -q`, then the six-step script in `01-14-PLAN.md` | ✅ `01-UI-SPEC.md`, `01-USER-SETUP.md` | ⬜ **pending** — checkpoint precondition unmet (no `BOT_TOKEN`, dedicated test bot, private test group, or second human test account). Not attempted, not simulated, not approved. |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ green except a named registered defect*

---

## Executed Evidence — 2026-08-21

| Command | Result |
|---------|--------|
| `npm run format:check` | ✅ All matched files use Prettier code style |
| `npm run lint` | ✅ (alias of the pinned `format:check`) |
| `npm run typecheck` | ✅ `tsc --noEmit` clean |
| `npm run test:unit` | ✅ 52 passed / 52, 10 files |
| `npm run test:integration` | ⚠️ 28 passed / 30 — the only 2 failures are broken windows 2 and 3 |
| `docker build -t gsmbot:phase-01 .` | ✅ image built; the Dockerfile's own build- and runtime-stage geo-tz gates passed |
| in-image geo-tz data + `dist/find-now` lookup | ✅ resolved `America/Los_Angeles`; control image without `node_modules/geo-tz/data` exits 1 |
| `docker compose config -q` | ✅ exit 0 with placeholder `BOT_TOKEN` / `POSTGRES_PASSWORD` |
| Live six-step Telegram verification | ⬜ not run — see `nyquist_blockers` |

The Testcontainers integration suite **did run** in this session, which supersedes the "no container runtime" condition recorded as broken window 1; the ledger entry is left open for the phase gate to close deliberately rather than being closed here.

---

## Wave 0 Requirements

- [x] `package.json`, TypeScript configuration, and explicit `format`/`format:check`/`lint`/`typecheck`/`test` scripts — `package.json`, `tsconfig.json`, `tsconfig.build.json` (Plan 01-03).
- [x] `vitest.config.ts` and `tests/unit/` — 10 unit files, no watch-mode flag in any script.
- [x] PostgreSQL Testcontainers fixture and `tests/integration/` — `tests/helpers/postgres.ts` applies `prisma migrate deploy` then `migrate status`; never schema push.
- [x] Fake `TelegramMembershipGateway`, fake clock, and package-neutral `TimezoneResolver` fixture — `tests/fakes/chat-readiness.ts`; the resolver's `resolved` / `ambiguous` / `failure` contract lives behind `TimezoneResolver` so tests never depend on geo-tz data.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Status |
|----------|-------------|------------|-------------------|--------|
| Telegram group-chat location reply reaches the setup flow and produces the intended candidate confirmation card | CONF-01 | Telegram client affordance and live update shape require a real test chat | In a private test group, run setup as an administrator, attach a location, verify every returned IANA candidate has its own action, select one, save only at final review, inspect settings, and confirm logs/evidence contain no raw coordinates | ⬜ pending — Plan 01-14 Task 2 |
| A demoted administrator is denied immediately by Telegram-backed authorization | AUTH-02 | Final confidence requires Telegram's live `getChatMember` response | Start a protected flow as an administrator, demote that account, attempt the next protected command and callback, and verify denial plus draft removal | ⬜ pending — Plan 01-14 Task 2 |
| `geo-tz@8.1.8` and every remaining direct root are legitimate and maintained | CONF-01 | Package provenance, boundary-data provenance, runtime-data behavior, and maintenance are human supply-chain decisions | Execute Plan 01-15: preserve the tz-lookup rejection, review every pending row, and approve geo-tz's publisher, source, signed release, 2026c data, license, lifecycle hooks, dependency tree, multi-candidate API, and Docker data path before installation | ✅ complete — Plan 01-15, 2026-08-20 |

---

## Outstanding Evidence Gaps

These are the reasons `nyquist_compliant` remains `false`. None is waived here.

| # | Gap | Owner | Registered as |
|---|-----|-------|---------------|
| 1 | The six-step live private-group verification (Plan 01-14 Task 2) has not run. The environment has no `BOT_TOKEN`, no dedicated test bot, no private test group, and no second human test account. Telegram client rendering, live `getChatMember` demotion timing, and the UI-contract comparison are unproven by any automated gate. | Human operator, per `01-USER-SETUP.md` | Plan 01-14 blocking checkpoint |
| 2 | `tests/integration/chat-configuration.test.ts:175` fails: the test reads `inline_keyboard[0][0]` expecting the planning-access button, but the 01-08/01-09 dashboard renders `Edit time zone` first. Stale test expectation, not a routing bypass. | Phase regression gate | `.planning/WINDOWS.md` id 2 (open) |
| 3 | `tests/integration/chat-configuration.test.ts:291` fails: `SettingsService.selectPlanningAccessPolicy` resolves `undefined` for an unsupported policy instead of throwing `Unsupported planning access policy`. A real domain behavior gap on the AUTH-01 route. | Phase regression gate | `.planning/WINDOWS.md` id 3 (open) |
| 4 | `RosterService.addFromRepliedUser` stamps `activeAt` with `new Date()` rather than the injected clock (carried from Plan 01-10). | Phase regression gate | Recorded in `01-13-SUMMARY.md` |

CI does **not** skip, filter, or `continue-on-error` around gaps 2 and 3. The workflow is expected to report red until they are fixed, which is the point of registering them.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verification or a Wave 0 dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verification
- [x] Wave 0 covers all missing references
- [x] No watch-mode flags in any script or workflow step
- [x] Feedback latency is measured (22 s full suite) and acceptable
- [ ] `nyquist_compliant: true` set in frontmatter after validation — **blocked** by the four gaps above

**Approval:** blocked on the Plan 01-14 Task 2 live verification and broken windows 2 and 3.
