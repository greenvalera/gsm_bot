---
phase: 01-chat-readiness
plan: 13
subsystem: chat-readiness
tags: [telegram, grammy, routing, authorization, callbacks, integration, e2e]
requires:
  - phase: 01-12
    provides: Deterministic safe roster projection with opaque page and retry actions
  - phase: 01-11
    provides: Initiator-bound roster removal actions
  - phase: 01-09
    provides: Actor-bound settings edit drafts with expected-revision saves
provides:
  - Single Phase 1 command/update registration point (`registerChatReadinessHandlers`)
  - Single versioned callback boundary (`registerCallbackBoundary` / `registerChatReadinessCallbacks`)
  - Declarative route inventory (`CHAT_READINESS_ROUTES`) that a test can enumerate
  - Chat-key sequentialization installed ahead of every handler
  - Full setup → restart → settings edit → roster add/list/remove integration flow on committed migrations
affects: [chat-readiness, rehearsal-proposal, availability, authorization]
actuals:
  tokens: 26316
  tasks: 1
  commits: 2
tech-stack:
  added: []
  patterns:
    - One registration point owns each Telegram filter; feature modules export handlers, not registrations
    - Acknowledge, reauthorize, parse opaque token, load row, dispatch by stored kind — in that order
    - The update router loads the actor's live edit draft once and decides which surface owns the turn
    - Middleware that must wrap handlers is installed by the composition root, never after registration
key-files:
  created:
    - src/telegram/handlers.ts
    - src/telegram/callbacks.ts
    - tests/integration/chat-readiness.e2e.test.ts
  modified:
    - src/app/create-bot.ts
    - src/app/main.ts
    - src/shared/callback-schema.ts
    - src/telegram/setup-handlers.ts
    - src/telegram/settings-handlers.ts
    - src/telegram/roster-handlers.ts
    - tests/unit/roster-rendering.test.ts
    - .planning/phases/01-chat-readiness/COVERAGE.md
key-decisions:
  - "The callback boundary authorizes before parsing the token, so a demoted actor is denied even when the token is malformed or unresolvable."
  - "Stale copy is chosen per stored action kind; an unresolvable token uses the generic settings/roster copy because no surface owns it."
  - "`message:location` and `message:text` are each owned by exactly one router that authorizes once and then routes to the settings edit surface if a live edit draft exists, otherwise to the setup wizard."
  - "`sequentialize` moved from `main.ts` into `createBot`, ahead of handler registration, because middleware registered after non-terminating handlers never runs."
  - "`registerRosterHandlers` moved to `handlers.ts` so the focused roster registration reuses the shared boundary without an import cycle."
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
    description: Every Phase 1 command, update, and callback registers once and reaches the current-administrator boundary before protected state
    requirement: AUTH-01
    verification:
      - kind: integration
        ref: tests/integration/chat-readiness.e2e.test.ts#registers every Phase 1 route once and gates each protected route on the current administrator
        status: pass
    human_judgment: false
  - id: D2
    description: Same-chat updates are serialized so two taps cannot interleave inside a draft transition
    requirement: CONF-05
    verification:
      - kind: integration
        ref: tests/integration/chat-readiness.e2e.test.ts#serializes concurrent updates for the same chat
        status: pass
    human_judgment: false
  - id: D3
    description: Every callback query receives exactly one answer and it is the answer carrying the outcome, while the fresh current-role lookup still precedes every token parse and durable read
    requirement: AUTH-02
    verification:
      - kind: integration
        ref: tests/integration/chat-readiness.e2e.test.ts#answers every callback exactly once, after a fresh role lookup, with the answer that carries the outcome
        status: pass
    human_judgment: false
  - id: D4
    description: Every issued token is a short opaque versioned value carrying no identity, label, or claim
    requirement: AUTH-02
    verification:
      - kind: integration
        ref: tests/integration/chat-readiness.e2e.test.ts#issues only short opaque versioned tokens that carry no identity or claim
        status: pass
    human_judgment: false
  - id: D5
    description: Malformed, missing, expired, cross-chat, cross-actor, duplicate, and demoted callbacks preserve authoritative state and return approved copy
    requirement: AUTH-02
    verification:
      - kind: integration
        ref: tests/integration/chat-readiness.e2e.test.ts#rejects malformed, missing, expired, cross-chat, cross-actor, duplicate, and demoted callbacks without changing authoritative state
        status: pass
    human_judgment: false
  - id: D6
    description: A failing durable roster read never shows a partial page and offers a bound retry
    requirement: ROST-03
    verification:
      - kind: integration
        ref: tests/integration/chat-readiness.e2e.test.ts#keeps the roster projection authoritative when the durable read fails
        status: pass
    human_judgment: false
  - id: D7
    description: The complete setup, restart, settings edit, and roster lifecycle works against freshly applied committed migrations
    requirement: CONF-01
    verification:
      - kind: integration
        ref: tests/integration/chat-readiness.e2e.test.ts#completes setup, survives a restart, edits settings, and manages the roster
        status: pass
    human_judgment: false
  - id: D8
    description: No undocumented external Telegram surface is used and every COVERAGE.md INTEGRATE row names its handler and test
    requirement: CONF-05
    verification:
      - kind: integration
        ref: tests/integration/chat-readiness.e2e.test.ts#completes setup, survives a restart, edits settings, and manages the roster
        status: pass
      - kind: manual_procedural
        ref: .planning/phases/01-chat-readiness/COVERAGE.md
        status: pass
    human_judgment: true
    rationale: "Owner decision 2026-08-24. This deliverable bundles two halves and only the first is asserted. The e2e test proves that no Telegram method outside sendMessage, editMessageText and answerCallbackQuery is ever called; NOTHING asserts the second half, that every COVERAGE.md INTEGRATE row names a real handler and test. The only occurrence of COVERAGE in the 753-line suite is a code comment, and the rows were hand-filled (Deviation 5). Correcting the out-of-enum kind alone would have flipped D8 to auto-pass, recording a hand-inspected document as deterministically covered; it stays a declared human checkpoint by design."
duration: 18 min
completed: 2026-08-21
status: complete
---

# Phase 01 Plan 13: Composed Chat Readiness Routes Summary

**Every Phase 1 command, message update, and callback now passes through one registration point and one acknowledge-authorize-parse-load-dispatch callback boundary, and the complete setup → restart → settings edit → roster lifecycle is proven end to end against freshly applied PostgreSQL migrations.**

## Performance

- **Duration:** 18 min
- **Tasks:** 1
- **Files modified:** 11 (3 created, 8 modified)

## Accomplishments

- Added `src/telegram/handlers.ts`: `registerChatReadinessHandlers` registers `/setup`, `/settings`, `/roster`, `/roster_add`, `message:location`, `message:text`, and the callback boundary exactly once, and exports `CHAT_READINESS_ROUTES` — a declarative inventory a test can enumerate so no route can be added without appearing in the authorization proof.
- Added `src/telegram/callbacks.ts`: `registerCallbackBoundary` owns acknowledgement ordering, current-role revalidation, opaque token parsing, authoritative row loading, chat/actor/expiry binding, and per-kind stale copy. `registerChatReadinessCallbacks` wires the three feature dispatchers into it.
- Converted `setup-handlers.ts`, `settings-handlers.ts`, and `roster-handlers.ts` from self-registering modules into exported handler and dispatcher functions. Feature services and renderers were not touched.
- Added `tests/integration/chat-readiness.e2e.test.ts` (7 tests): table-driven route inventory, acknowledgement ordering, token opacity and byte budget, the full denial matrix, a durable-read failure, and the complete migrated workflow across two process/client restarts.
- Gave every `INTEGRATE` row in `COVERAGE.md` an explicit handler and test reference, and asserted in the suite that no Telegram method outside `sendMessage` / `editMessageText` / `answerCallbackQuery` is ever called.

## Task Commits

1. **Task 1: Prove every Phase 1 route crosses one callback/authorization/durable-state boundary (RED)** - `49ea0a7` (`test`)
2. **Task 1: Prove every Phase 1 route crosses one callback/authorization/durable-state boundary (GREEN)** - `216cc65` (`feat`)

## Decisions Made

- **Authorize before parsing the token.** The boundary refreshes the administrator role before it looks at `callback_query.data`. A demoted actor therefore receives `Only current chat administrators can do that.` even for a malformed or unresolvable token, and the demotion still discards their actor-bound drafts. Parsing first would have leaked a `stale` answer to an actor who no longer has any right to an answer at all, and would have broken the existing demoted-save assertions in `chat-configuration.test.ts` (whose fixture tokens are deliberately unparseable).
- **Stale copy is selected from the stored kind, not the token.** `START_SETUP` keeps `This setup action is no longer available. Send /setup to start again.`; settings and roster keep the shared copy. A token that resolves to no row at all cannot name a surface, so it uses the generic copy — the surface-specific copy would be a guess.
- **One owner per Telegram filter.** `message:location` and `message:text` each have exactly one registration that authorizes once, loads the actor's live `SettingsEditDraft` once, and then hands the turn to the settings surface if an edit is in flight or the setup wizard otherwise. Enumerating and asserting one membership lookup per update is what makes a duplicate registration detectable.
- **Sequentialization belongs to the composition root.** grammY middleware only wraps handlers registered after it. `bot.use(sequentialize(...))` therefore moved from `main.ts` (where it ran after `createBot` had already registered every handler) into `createBot`, before registration.
- **Page and retry actions remain unconsumed.** Preserved verbatim from 01-12: they are idempotent reads, so the boundary binds and reauthorizes them but the dispatcher never consumes them, and a second `Next` tap re-renders rather than reporting `Already applied.`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `message:location` and `message:text` never reached the settings surface**

- **Found during:** Task 1, reading the composed registration order
- **Issue:** `registerSetupHandlers` ran before `registerSettingsHandlers` and its `message:location` / `message:text` handlers never called `next()` on their early-return paths. For a configured chat there is no active setup draft, so the setup text handler returned silently and the settings handler was unreachable. Every text-entry settings edit (default start, duration, daily boundaries, reminder times) and the settings time-zone-by-location flow were dead code in the composed bot.
- **Fix:** One router per filter in `handlers.ts` authorizes once, loads the live settings draft, and routes to the settings surface when an edit is in flight.
- **Files modified:** `src/telegram/handlers.ts`, `src/telegram/settings-handlers.ts`, `src/telegram/setup-handlers.ts`
- **Verification:** the full-workflow test edits the duration by typing `90` after `/settings` and asserts the committed revision advanced.
- **Commit:** `216cc65`

**2. [Rule 1 - Bug] `sequentialize` was installed after every handler and therefore never ran**

- **Found during:** Task 1, mapping the `chat-key runner sequentialization` COVERAGE row to code
- **Issue:** `main.ts` called `bot.use(sequentialize(...))` after `createBot` had registered all handlers. grammY middleware only wraps middleware registered later, and none of the Phase 1 handlers call `next()` on their terminal paths, so the constraint never applied. Two taps in the same chat could interleave inside a draft transition — the exact race the runner guidance exists to prevent.
- **Fix:** `createBot` installs it before `registerChatReadinessHandlers`; `main.ts` keeps only `bot.catch`.
- **Files modified:** `src/app/create-bot.ts`, `src/app/main.ts`
- **Verification:** *serializes concurrent updates for the same chat* asserts two concurrent same-chat updates produce `enter, exit, enter, exit`.
- **Commit:** `216cc65`

**3. [Rule 3 - Blocking] `ActionContext` moved into `shared/callback-schema.ts`**

- **Found during:** Task 1, wiring the boundary
- **Issue:** three copies of the same `actionContext(chatId, actorId)` helper existed. Putting the shared copy in `callbacks.ts` would have created a real import cycle, because `callbacks.ts` must import the feature dispatchers as values.
- **Fix:** the type and helper live in `src/shared/callback-schema.ts` (already listed in the plan's `files_modified`), which every layer already imports and which imports nothing from the Telegram layer. Feature modules import only *types* from `callbacks.ts`, so no runtime cycle exists.
- **Files modified:** `src/shared/callback-schema.ts` and the three handler modules
- **Commit:** `216cc65`

**4. [Rule 3 - Blocking] `registerRosterHandlers` moved to `handlers.ts`**

- **Found during:** Task 1, keeping `tests/unit/roster-rendering.test.ts` green
- **Issue:** that 01-12 test registers the roster surface alone. Keeping the function in `roster-handlers.ts` while it consumes `registerCallbackBoundary` would have made the `callbacks.ts` ↔ `roster-handlers.ts` cycle a value cycle.
- **Fix:** `registerRosterHandlers` now lives in `handlers.ts` and composes the same shared boundary with `exhaustive: false` (an unowned token is passed to the next handler instead of being answered as stale). The unit test changed by one import line; every assertion is unchanged and still passes.
- **Files modified:** `src/telegram/handlers.ts`, `src/telegram/roster-handlers.ts`, `tests/unit/roster-rendering.test.ts`
- **Commit:** `216cc65`

**5. [Rule 2 - Missing critical documentation] `COVERAGE.md` INTEGRATE rows had empty reasons**

- **Found during:** Task 1, acceptance criterion 4
- **Issue:** the acceptance criterion requires every `INTEGRATE` row to carry a handler/test reference; all 13 rows had an empty third column, so the criterion was unverifiable.
- **Fix:** each row now names its implementing module and its covering test (or states explicitly that it is an operational path with no test).
- **Files modified:** `.planning/phases/01-chat-readiness/COVERAGE.md`
- **Commit:** `216cc65`

**Total deviations:** 5 auto-fixed (2 bugs, 2 blocking, 1 missing critical documentation).
**Impact:** Deviations 1 and 2 fixed latent defects that made documented behavior unreachable; both are now covered by assertions. Deviations 3 and 4 are structural and additive — no caller behavior changed. Deviation 5 touched a planning document only.

## Authentication Gates

None. All authorization in this plan is the bot's own administrator gate, exercised through injected membership gateways.

## Known Issues

### Inherited pre-existing failures — `tests/integration/chat-configuration.test.ts` (NOT caused by this plan)

Two tests continue to fail, with a signature unchanged from `e760820`:

- `chat configuration promotion > renders committed settings in fixed order and changes planning access only after review` — the test reads `inline_keyboard[0][0]` expecting the planning-access button, but the 01-08/01-09 dashboard put `Edit time zone` first, so the callback opens the time-zone prompt. The test's expectation is stale, not the routing.
- `chat configuration promotion > rejects stale, expired, duplicate, and invalid planning-access saves without revision changes` — `selectPlanningAccessPolicy` now resolves `undefined` for an unsupported policy instead of throwing `Unsupported planning access policy`.

**Disposition:** out of scope by explicit user decision, deferred to the phase regression gate. Both are recorded in `01-11-SUMMARY.md` and `01-12-SUMMARY.md` under the same heading and are carried forward here. This plan's route unification did not resolve either, because neither is caused by routing: the first is a stale keyboard-index assumption in the test and the second is a domain validation behavior in `SettingsService`.

### Carried forward from 01-10

`RosterService.addFromRepliedUser` stamps `activeAt` with `new Date()` rather than the injected clock. Untouched by this plan; the e2e assertions avoid depending on that timestamp.

## Verification Results

| Check | Command | Result |
|---|---|---|
| Formatting | `npm run format:check` | PASS |
| Types | `npm run build` (`tsc --noEmit`) | PASS |
| Plan verify (composed routes) | `npm run test:integration -- chat-readiness.e2e` | PASS (7/7) |
| Plan verify (authorization) | `npm run test:unit -- authorization` | PASS (2/2) |
| Full unit suite | `npm run test:unit` | PASS (46/46, 9 files) |
| Full integration suite | `npm run test:integration` | 28/30 — only the 2 inherited `chat-configuration` failures above |

## Acceptance Criteria

| Criterion | Status | Evidence |
|---|---|---|
| One central registration test lists every Phase 1 command/update/callback and proves protected routes invoke the current-role gateway before state access | MET | `CHAT_READINESS_ROUTES` asserted as an exact set; each protected route driven as a non-administrator asserts exactly one membership lookup as the *first* event, the denial copy, and byte-for-byte unchanged row counts across five tables |
| All callbacks satisfy acknowledgement-before-latency and server-side-authority rules, including malformed/stale/duplicate/cross-boundary paths | MET | `events.slice(0, 2) === ["answerCallbackQuery", "membership"]` for both a valid and a malformed token; the denial matrix covers duplicate, unknown, cross-actor, cross-chat, expired, demoted, and stale-setup |
| The full migrated workflow survives process/client recreation with identical configuration and roster state | MET | wizard completes on a fresh migrated database, then two further Prisma clients and bots read back the committed configuration, the edited duration, and the soft-removed roster |
| Every `INTEGRATE` row in COVERAGE.md has a handler/test reference and no undocumented external Telegram surface appears | MET | all 13 rows referenced; the workflow test asserts the union of observed Telegram methods is a subset of `sendMessage`, `editMessageText`, `answerCallbackQuery` |

## must_haves Audit

| Item | Status | Evidence |
|---|---|---|
| Truth: every protected command, wizard input, dashboard action, roster action, and callback reaches the same current-administrator boundary before protected state | MET | one `authorize` helper in `handlers.ts` for commands and updates, one `requireCurrentAdministrator` call in `registerCallbackBoundary` for every callback; route-inventory test asserts membership is the first event |
| Truth: every callback is acknowledged immediately; successful mutations replace the originating message; duplicates receive `Already applied.` | MET | ack is the first statement of the boundary; settings save and roster removal assert `editMessageText`; duplicate save asserts `Already applied.` |
| Truth: every callback token is short, opaque, and versioned; no names, permissions, schedule values, coordinates, IDs, or claims | MET | every issued token matches `^v1:<uuid>$`, is ≤ 64 bytes, and is asserted to contain neither the actor ID, the chat ID, `europe`, nor `admin` |
| Truth: validation, location, permission, expiry, save, duplicate, stale-action, delay, and read failures use approved copy and preserve authoritative state | MET | denial matrix plus the durable-read-failure test; every negative path re-asserts the committed revision is unchanged |
| Truth: the complete setup → restart → settings edit → roster add/list/remove workflow passes against freshly applied committed migrations | MET | `startPostgresTestContainer` runs `prisma migrate deploy` + `migrate status`; the workflow test spans three clients |
| Artifact: `handlers.ts` exports `registerChatReadinessHandlers` | MET | plus `CHAT_READINESS_ROUTES` and the focused `registerRosterHandlers` |
| Artifact: `callbacks.ts` exports `registerChatReadinessCallbacks` | MET | plus `registerCallbackBoundary` and the copy contract constants |
| Artifact: `chat-readiness.e2e.test.ts` covers setup/settings/roster/restart/demotion | MET | 7 tests across three describe blocks |
| Key link: `create-bot.ts` registers every command/update exactly once via `registerChatReadinessHandlers` | MET | single call site; the one-membership-per-update assertion detects any duplicate |
| Key link: `callbacks.ts` → `callback-schema.ts` one parse/ack/load/authorize/dispatch boundary via `safeParse` | MET | `callbackTokenSchema.safeParse` is the only token parse in the callback path |
| Key link: e2e test → `prisma/migrations` via `migrate deploy` | MET | `applyCommittedMigrations` in `tests/helpers/postgres.ts` |
| Prohibition: no unlisted Telegram surface introduced | MET | observed-method subset assertion |

## Threat Mitigations Applied

| Threat ID | Mitigation |
|---|---|
| T-01-23 (elevation of privilege via registration) | `CHAT_READINESS_ROUTES` is asserted as an exact set and every protected route is driven as a non-administrator; exactly one membership lookup per update also proves no duplicate registration bypasses the gate |
| T-01-24 (callback tampering) | Acknowledge → reauthorize → parse a version-prefixed opaque token → load the server-side row → revalidate chat/actor/expiry → dispatch by the stored kind; the token contributes nothing but a lookup key |
| T-01-SC (supply chain) | No dependency added, removed, or upgraded; `package.json` and the lockfile are untouched |

## Next Phase Readiness

Phase 1 route composition is complete. Configuration, authorization, and roster state are reachable through one audited surface, so the week-aware rehearsal proposal phase can add availability callbacks by extending `CHAT_READINESS_ROUTES` and the callback route table rather than adding another registration.

The two inherited `chat-configuration` integration failures remain outstanding for the phase regression gate.

## Self-Check: PASSED

`src/telegram/handlers.ts`, `src/telegram/callbacks.ts`, and `tests/integration/chat-readiness.e2e.test.ts` all exist on disk. Both task commits (`49ea0a7` RED, `216cc65` GREEN) are present in git history. TDD gate sequence RED → GREEN verified; no REFACTOR commit was needed.
