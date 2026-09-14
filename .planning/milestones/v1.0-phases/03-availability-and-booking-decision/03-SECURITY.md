---
phase: 03
slug: availability-and-booking-decision
status: verified
threats_open: 0
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
created: 2026-09-08
updated: 2026-09-08
---

# Phase 03 — Security

> ASVS Level 1 verification of the threat register declared across plans 03-01 through 03-09. Duplicate threat IDs (`T-03-SC`, declared by every plan) are consolidated at their strictest declared severity.

Phase 3 adds no external service, SDK, provider, or npm root. Every threat below is a Telegram-surface or PostgreSQL-state threat. The register was authored at plan time in all nine plans, so this run verifies that the declared mitigations exist rather than constructing a register retroactively.

## Trust Boundaries

| Boundary | Description | Data crossing |
|----------|-------------|---------------|
| Telegram `callback_query` → callback boundary | Any current chat member can present any token; the update is untrusted and unordered | Opaque versioned token, `ctx.from.id` |
| Callback boundary → planning dispatcher | Chat membership is established; snapshot membership and booking eligibility are not | Round id, actor id, resolved route authority |
| Rendered card or announcement → durable state | A drawn control is a convenience, never authority | Button press intent |
| Refusal alert → the group chat | A refusal must stay private to the tapper | Reason text, never a member label or numeric id |
| Card and announcement text → chat history | Member identities are rendered into two persistent group messages | Display names via `memberLabel` |
| Migration runner → inherited database | A deploy runs against rows written by an earlier schema | Catalog expectations, applied-migration state |

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01 | Elevation of privilege | `answerAvailability` step 3/4 | high | mitigate | The `PlanningParticipant` read plus the `WHERE roundId AND telegramUserId` clause re-assert snapshot membership atomically inside the transaction … | closed |
| T-03-02 | Spoofing | shared answer token | high | mitigate | The token carries no identity and grants only the right to attempt … | closed |
| T-03-03 | Tampering | replayed answer update | medium | mitigate | One atomic compare-and-set on the participant value; a replay reports zero affected rows and returns the already-applied alert (RELI-02) | closed |
| T-03-04 | Tampering | `20260905120000_availability_and_booking` against an inherited database | high | mitigate | `prisma/migrate-deploy.mjs` preflight extended with the gated catalog for both the pre- and post-migration state … | closed |
| T-03-05 | Information disclosure | availability card text and refusal alerts | high | mitigate | `memberLabel` for card HTML and `plainMemberLabel` for alerts — the only identity renderers … | closed |
| T-03-06 | Information disclosure | new log fields | medium | mitigate | Diagnostics expressed only in allow-listed fields (`roundId`, `outcome`, `reason`, `count`, `actorId`) … | closed |
| T-03-07 | Denial of service | per-answer anchor edit | low | accept | Answers are bounded by the snapshot size and serialized by the chat-key `sequentialize` … | closed |
| T-03-08 | Tampering | `planningTargetSchema` new union members | medium | mitigate | Both members are `.strict()` Zod objects parsed from the server-side `targetId`, after `callbackTokenSchema` validates the wire token (ASVS V5) | closed |
| T-03-SC | Tampering | npm/pip/cargo installs | high | mitigate | No package is installed by this phase (03-RESEARCH.md Package Legitimacy Audit: "Packages installed by this phase: none") … | closed |
| T-03-09 | Elevation of privilege | `dispatchAvailabilityAnswer` non-participant branch | high | mitigate | The `not-a-participant` result is produced by a transactional `PlanningParticipant` read and re-asserted by the update's `WHERE` clause … | closed |
| T-03-10 | Information disclosure | non-participant refusal alert | high | mitigate | The alert is an `answerCallbackQuery` (private to the tapper) whose text names only the reason — never a member label, a lineup size … | closed |
| T-03-11 | Information disclosure | availability card participant lines | high | mitigate | `memberLabel` is the only identity renderer on the card, carrying the masked-id fallback and the single escaper … | closed |
| T-03-12 | Tampering | repeated identical answer taps | medium | mitigate | The nullable-safe `OR` compare-and-set reports zero affected rows on a re-tap; the branch answers already-applied with no second transition (RELI-02) | closed |
| T-03-13 | Denial of service | burst of answers driving Telegram flood control | medium | mitigate | `isFloodControl` classifies the 429 at the delivery catch site and absorbs it … | closed |
| T-03-14 | Repudiation | an unenumerated new branch emitting no distinguishable line | medium | mitigate | The `BRANCHES` gate requires globally unique outcome-and-reason pairs and exactly one line per branch … | closed |
| T-03-15 | Information disclosure | new diagnostic log fields | medium | mitigate | Only allow-listed fields are emitted; a field outside the allow list is silently redacted, so no participant-identity field is introduced (ASVS V7) | closed |
| T-03-16 | Elevation of privilege | `wasPreviousParticipant` status filter (:809) | high | mitigate | Widened to `{ in: WEEK_CLAIMING_STATUSES }` with its own real-PostgreSQL assertion … | closed |
| T-03-17 | Tampering | `startOrResume` claiming read (:949) | high | mitigate | Widened to the same constant … | closed |
| T-03-18 | Elevation of privilege | status re-post minting answer tokens | medium | mitigate | `loadAvailabilityActions` reads existing unconsumed rows and mints nothing … | closed |
| T-03-19 | Tampering | `reanchor` widened status guard (:1887) | medium | mitigate | Status stays inside the compare-and-set alongside `id` and `revision` … | closed |
| T-03-20 | Denial of service | `/plan_status` for non-draft rounds | medium | mitigate | The `lastStatusPostedAt` cooldown claim is widened together with the round read … | closed |
| T-03-21 | Information disclosure | the re-posted availability card | high | mitigate | The re-post renders identities only through `memberLabel`, the single masking escaper … | closed |
| T-03-22 | Repudiation | three status re-posts sharing one reason | medium | mitigate | A distinct bounded reason per re-post shape, each enumerated in the `BRANCHES` gate (ASVS V7) | closed |
| T-03-23 | Tampering | the unanimity claim in `answerAvailability` | high | mitigate | One `updateMany` compare-and-set on `readyAnnouncedAt` inside the answer transaction … | closed |
| T-03-24 | Denial of service | announcement as a notification amplifier | high | mitigate | `READY_ANNOUNCE_COOLDOWN_MS` bounds re-announcement to one message per window however many times a participant flips their answer … | closed |
| T-03-25 | Denial of service | a Telegram outage used to re-trigger the claim | medium | mitigate | The claim is durable BEFORE the send, exactly as the shipped status cooldown is … | closed |
| T-03-26 | Information disclosure | announcement text | high | mitigate | Identities rendered only through `sortRosterMembers` + `memberLabel`, the masked-id form and single escaper … | closed |
| T-03-27 | Spoofing | a stale announcement asserting a slot that no longer works | high | mitigate | A lost unanimity edits the message to a retraction and removes its control, so the message on screen cannot be used to justify a booking … | closed |
| T-03-28 | Elevation of privilege | the availability card's controls after the anchor concept moves | medium | mitigate | D-17 keeps `anchorMessageId` on the card so it stays editable … | closed |
| T-03-29 | Information disclosure | new diagnostic fields for the announcement branches | medium | mitigate | Only allow-listed fields are emitted (`roundId`, `outcome`, `reason`, `count`, `actorId`) … | closed |
| T-03-30 | Repudiation | four announcement outcomes sharing one log line | medium | mitigate | A distinct bounded reason for claimed, inside-cooldown, retracted, not-recorded and reposted, each enumerated in the `BRANCHES` gate (ASVS V7) | closed |
| T-03-31 | Elevation of privilege | `requestBooking` / `applyBooking` eligibility | high | mitigate | `round.authorUserId === actorId` or a fresh administrator role resolved at tap time through the **non-destructive** current-role lookup … | closed |
| T-03-32 | Elevation of privilege | a demoted administrator books | high | mitigate | The role is resolved twice — once for the request … | closed |
| T-03-33 | Tampering | a replayed booking update double-books | high | mitigate | The token is consumed with the `consumedAt IS NULL` compare-and-set and the round update is guarded on `status` plus `revision` … | closed |
| T-03-34 | Spoofing | booking a slot that no longer works | high | mitigate | Unanimity is re-derived from the participant rows inside the apply transaction … | closed |
| T-03-35 | Elevation of privilege | the actor-unbound confirm/keep pair | medium | accept | D-19 accepts an unbound pair deliberately so a second eligible person can complete the confirmation. The authorization decision is made entirely by th … | closed |
| T-03-36 | Information disclosure | booking refusal alerts | high | mitigate | Refusals are `answerCallbackQuery` alerts private to the tapper, naming only the role that could act — never a member label, an administrator list … | closed |
| T-03-37 | Information disclosure | the booked confirmation in group history | medium | mitigate | D-20 keeps the booker's identity out of the chat message … | closed |
| T-03-38 | Denial of service | a refused booking spending the control | medium | mitigate | Every refusal is read-only and precedes the consume … | closed |
| T-03-39 | Repudiation | booking branches sharing a log line | medium | mitigate | A distinct bounded reason for offered, not-eligible, unanimity-lost, already-applied, kept, booked and failed … | closed |
| T-03-40 | Denial of service | `/plan_status` announcement re-post | high | mitigate | Every notifying re-post first wins a committed compare-and-set on `readyAnnouncedAt` over `READY_ANNOUNCE_COOLDOWN_MS`. An un-role-gated command (D-15 … | closed |
| T-03-41 | Tampering | check-then-act on `readyAnnouncedAt` | high | mitigate | The window lives in the `WHERE` clause of a single `updateMany` shared with the answer path … | closed |
| T-03-42 | Repudiation | the quiet fall-through sharing a log line with a genuine card re-post | medium | mitigate | Its own bounded reason, enumerated in the `BRANCHES` gate … | closed |
| T-03-43 | Denial of service | the window consumed by a round that is not ready | medium | mitigate | The claim is short-circuited behind the ready-to-book predicate (D-22) … | closed |
| T-03-44 | Denial of service | a claim won and then not used because Telegram rejected the send | low | accept | The claim is durable before the send … | closed |
| T-03-45 | Elevation of privilege | unbounded `book-request` rows | high | mitigate | Ensure-then-mint bounds the standing booking capability at one live row per round … | closed |
| T-03-46 | Tampering | non-deterministic control resolution | medium | mitigate | A total `orderBy` over `createdAt` then the primary key makes the collapse in `controlTokens` deterministic … | closed |
| T-03-47 | Denial of service | unbounded takeover inserts from `/plan_status` | high | mitigate | The draft guard means the phase's most open command performs no capability insert for a confirmed or booked round … | closed |
| T-03-48 | Elevation of privilege | a latent take-over-a-booked-rehearsal control | high | mitigate | The rows are no longer written at all … | closed |
| T-03-49 | Elevation of privilege | orphaned `book-apply` tokens | medium | mitigate | The previous confirmation pair is expired in the same transaction that mints its replacement … | closed |
| T-03-50 | Denial of service | write amplification from a double-tapped booking request | medium | mitigate | Two rows written and two live per round instead of two per tap accumulating … | closed |
| T-03-51 | Spoofing | an unretractable ready-to-book announcement | high | mitigate | When the pointer cannot be recorded and the round is left with none, the claim is released and the orphan's markup stripped … | closed |
| T-03-52 | Elevation of privilege | a live booking control on an unaddressable message | high | mitigate | The orphan is stripped of markup before the handler returns, so the control cannot be pressed … | closed |
| T-03-53 | Tampering | releasing a claim somebody else holds | high | mitigate | The release is a compare-and-set guarded on the round still carrying the exact instant this dispatch claimed and on a null pointer … | closed |
| T-03-54 | Denial of service | releasing on a Telegram send failure | high | mitigate | The release is reachable only from the answer path's pointer-write failure branch … | closed |
| T-03-55 | Tampering | a correction decided from a pre-write snapshot | medium | mitigate | `claimAnnouncement` reads the round inside the answer transaction for its retract-or-edit decision … | closed |
| T-03-56 | Repudiation | non-determinism in the acknowledgement and the log line | medium | mitigate | A not-modified response reports unchanged, so both edit call sites behave identically with a warm and a cold cache … | closed |
| T-03-57 | Repudiation | synthesised exceptions in failure lines | low | mitigate | Non-exception failures log a bounded reason and no `err`, so `err` in a planning line always means something threw (IN-03, ASVS V7) | closed |
| T-03-63 | Denial of service | the release re-opening the announcement window | high | mitigate | The `/plan_status` re-announce path is excluded from the release by construction and by its null-pointer guard (D-33): a claim whose notification was … | closed |
| T-03-64 | Spoofing | the send-then-crash residue | medium | accept | A process death between the send and the pointer write leaves a claim with no pointer that no in-process compensation can reach. Accepted rather than … | closed |
| T-03-58 | Denial of service | `boundedLabel` budgeted in the wrong unit | high | mitigate | The budget is measured in UTF-16 code units — the unit Telegram counts — while truncation stays on code-point boundaries … | closed |
| T-03-59 | Denial of service | an unwrapped acknowledgement escaping to the global handler | medium | mitigate | The ownership refusal absorbs a rejected acknowledgement at its own catch site … | closed |
| T-03-60 | Information disclosure | a truncated label leaking or malforming identity text | low | mitigate | The bound cuts on code-point boundaries and never emits a lone surrogate … | closed |
| T-03-61 | Tampering | a preflight passing a catalog with an extra object | high | mitigate | Expected entries are matched to distinct actual entries and any leftover fails … | closed |
| T-03-62 | Spoofing | an expectation derived from an unreachable state | low | mitigate | The flat lookup keyed on the latest applied migration removes the dead branch and fails loudly rather than wrongly if a migration is ever inserted out … | closed |
*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `block_on: high` count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

## Resolved Threat Detail

Mitigations spot-verified in the implementation during this run, at L1 (grep) depth:

| Threat | Verified at |
|---|---|
| T-03-01, T-03-09 | `answerAvailability` re-asserts snapshot membership twice — the `roundId_telegramUserId` read AND the update's `WHERE roundId AND telegramUserId` — both inside the transaction (`planning-service.ts:2593`). |
| T-03-16, T-03-17 | `WEEK_CLAIMING_STATUSES` (`target-week.ts:42`) is the shared constant behind both the policy filter and the claiming read, so a booked week stays claimed. |
| T-03-23, T-03-41 | One `updateMany` whose `WHERE` carries `OR: [{readyAnnouncedAt: null}, {readyAnnouncedAt: {lte: cutoff}}]` (`planning-service.ts:2358`) — the window lives in the clause, shared by the answer and `/plan_status` paths. |
| T-03-31, T-03-32, T-03-34 | Role resolved at BOTH `requestBooking` (`:2742`) and `applyBooking` (`:2928`), evaluated inside the transaction against `round.authorUserId` (`:3058`), with unanimity re-derived from the participant rows on apply. |
| T-03-33 | `consumedAt: null` compare-and-set asserting `count === 1` before the guarded round update (`planning-service.ts:1770`, `:1826`). |
| T-03-45, T-03-47, T-03-48 | `ensureBookingRequestAction` (`:1287`) is the single mint path; `loadAvailabilityActions` returns `[]` for a non-DRAFT round (`:1145`). |
| T-03-51, T-03-52, T-03-53, T-03-54, T-03-63 | `releaseAnnouncementClaim` (`:2549`) is a compare-and-set on `id` + `status` + `readyAnnouncedAt === claimedAt` + `announcementMessageId: null`; the orphan's markup is stripped by `clearSupersededCard` (`planning-handlers.ts:1297`) before the handler returns. |
| T-03-58, T-03-60 | `CALLBACK_ALERT_LIMIT = 200` measured with `String#length` — UTF-16 code units, the unit Telegram counts — with truncation on code-point boundaries (`planning-handlers.ts:196-263`). |
| T-03-05, T-03-11, T-03-21, T-03-26, T-03-37 | `memberLabel` and `plainMemberLabel` (`roster-renderers.ts:40`, `:58`) are the only identity renderers; a repository-wide grep finds no `tg://user` mention link and no anchor markup in the Telegram layer. |
| T-03-13 | `isFloodControl` classifies the 429 at its own catch site (`planning-handlers.ts:1082`), kept distinct from a rejected card. |

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-03-01 | T-03-07 | Per-answer anchor edits are bounded by the snapshot size and serialized by the chat-key `sequentialize`; a dropped edit self-heals on the next answer. Below the `high` block threshold. | Phase 3 plan 03-01 | 2026-09-05 |
| R-03-02 | T-03-35 | D-19 accepts an actor-unbound confirm/keep pair deliberately, so a second eligible person can complete a confirmation the author opened. The token grants only the right to attempt; the authorization decision is made entirely by the apply-time re-check (verified above under T-03-31/32). | Phase 3 plan 03-05 | 2026-09-05 |
| R-03-03 | T-03-44 | A claim won and then not spent because Telegram rejected the send costs one delayed notification and self-heals when the window elapses. Releasing it would turn a Telegram outage into a flood amplifier. | Phase 3 plan 03-06 | 2026-09-07 |
| R-03-04 | T-03-64 | A process death between the send and the pointer write leaves a claim with no pointer that no in-process compensation can reach. The orphaned message's control refuses at the callback boundary once the round moves on, and `READY_ANNOUNCE_COOLDOWN_MS` releases the claim on its own. Asserted by the residual-window case in 03-08. | Phase 3 plan 03-08 | 2026-09-07 |

## Declared Preconditions

| Precondition | Threat Ref | Why it is recorded here |
|---|---|---|
| The bot runs exactly ONE polling process | T-03-45 | The at-most-one live `book-request` row is a load-then-mint pair inside a READ COMMITTED transaction, not a database constraint. Two transactions interleaving between the `findMany` and the `create` would both mint; `sequentialize` by `chat.id` (`create-bot.ts:62`) closes it, but that is a single-process guarantee. `CLAUDE.md` states one long-poll worker as the operational shape; the invariant did not previously cite it. Carried from `03-VERIFICATION.md` → `coincidental_reliance_items`. Promotion path: a partial unique index on `(chatId, targetId) WHERE consumedAt IS NULL`. |

## Unregistered Flags

None. All nine SUMMARY files report `Threat Flags: None`, each stating that every boundary touched is already named in its plan's own register and that no new network endpoint, auth path, file access pattern, or trust-boundary schema change was introduced.

## Verification Runs

| Run | Date | Depth | Result |
|-----|------|-------|--------|
| Phase verification (`03-VERIFICATION.md`) | 2026-09-07 | goal-backward, 84/84 must-haves | `human_needed` — all five gaps (G-01…G-05) closed, no regressions |
| UAT (`03-UAT.md`) | 2026-09-08 | 5 human checkpoints | 5 passed, 0 issues |
| Security (this run) | 2026-09-08 | ASVS L1, verify-declared-mitigations | `threats_open: 0` |

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-08 | 65 | 65 | 0 | /gsd-secure-phase (State B, short-circuit: register authored at plan time, ASVS L1) |

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-08
