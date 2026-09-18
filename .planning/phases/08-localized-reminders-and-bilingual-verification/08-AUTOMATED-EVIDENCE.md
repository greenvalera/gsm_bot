# Phase 8 Automated Evidence — 2026-09-19

Automation only. No live Telegram interaction, deployment, phone notification observation or Ukrainian wording acceptance occurred. Native acceptance remains governed by `08-ACCEPTANCE-RUNBOOK.md` and the historical scoped waivers.

## Revision and environment

- Initial full-check source: `f639ad006c5d7a366731466d68b3855832695b88`, started `2026-09-18T23:35:00.428Z` (Europe/Kyiv local date September 19).
- Initial complete tracked working-tree diff SHA-256: `f86e122f6f2e81e7d210497e06d4774c362b06724288e00d20586c3a9171f481`. Existing unrelated config/instruction/continuation changes were preserved. No package versions changed in this plan.
- Intermediate migration-fixture correction: `5992b40b91aeba592e1d94c0f683a09537d64d11`; complete tracked diff SHA-256 at `2026-09-18T23:41:31.837Z`: `7929caaa156816d7f0a29b408fc870001308ad58c359dac7991b873cedb26687` (includes the then-uncommitted Windows ledger update).
- Final tested source: `7cbd7935b48ce40b0e140d1a94643aefc0244f96`. The production `src` tree is `a00b3f2dd9129a0ad5cdfa7f93af62beee1840ba` at both initial full-check and final revisions. Later changes are test fixtures, inventory proof checks and documentation. The final image smoke was rerun after the final test commit.
- At that final snapshot, `git diff HEAD --binary -- src tests package.json package-lock.json Dockerfile .github/workflows/ci.yml compose.yaml prisma prisma.config.ts tsconfig.json tsconfig.build.json vitest.config.ts` is empty: SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. Numerous original `git status` M entries have normalized-EOL/stat differences but no Git source-content diff. They were not staged wholesale.
- Host: Windows, Node `v24.11.1`, npm `11.6.2`, Docker client/server `29.1.3`, Compose `2.40.3-desktop.1`. Host Node is below the declared `>=24.19` engine; these are local executions of CI commands, not a claim that GitHub Actions ran. The production image separately proves the declared Node `v24.19.0` target with ICU `78.3`.
- Fresh PostgreSQL image: `postgres:18.4`, image ID `sha256:a02db8cac496f15b094798a38254f14d6e00741f709360e5e00bb6668ea31636`. Tests use isolated Testcontainers databases; a separate migration-check database was freshly created, migrated and removed. Existing live bot/database containers were untouched.
- Local raw logs and snapshot metadata: `node_modules/.cache/phase08-evidence/` (ignored, reproducible local diagnostics; the durable claims are recorded below).

## Required commands and observed results

| Command | Exit | Observation / source scope |
| --- | --- | --- |
| `npm run format:check` | 0 | Entire configured repository set; repeated after final helper correction, passed |
| `npm run lint` | 0 | Existing CI lint delegates to the same pinned formatting check |
| `npm run db:generate` | 1 then 0 | First attempt lacked `DATABASE_URL`; rerun used a nonconnecting build-only URL and generated Prisma Client 7.9.1. No schema or dependency correction |
| `npm run typecheck` | 0 | Initial source; rerun after proof hardening and final helper correction passed |
| `npm test` | 0 | 679 tests, 43 files; initial source |
| `npm run test:unit -- tests/unit/outbound-surfaces.test.ts` | 0 | 11 tests after `70f963e` proof hardening; zero pending inventory, mutation rejection |
| `npm run db:migrate:deploy` | 0 | Fresh isolated PostgreSQL database; complete committed history and reminder provisioning |
| `npm run db:migrate:status` | 0 | 14 migrations, database up to date; disposable migration container removed |
| `npm run test:integration` | 1 | 47 files, 684 cases: 679 passed / 5 failed; 45 files passed / 2 failed, 521.02 seconds. All five failures subsequently pass in scoped reruns below; the original command is not relabeled successful |
| `npm run test:integration -- tests/integration/chat-language-migration.test.ts tests/integration/localized-reminders.test.ts tests/integration/reminder-followups.test.ts tests/integration/reminder-planning.test.ts` | 0 | 61 tests across the 3 existing matched files, after helper correction later committed as `5992b40`. The fourth filter names no file and contributes no evidence |
| `npm run test:integration -- tests/integration/walking-skeleton.test.ts tests/integration/localized-onboarding.e2e.test.ts tests/integration/bilingual-workflow.test.ts` | 0 | 60 tests / 3 files, final correction committed as `7cbd793`; 21.12 seconds |
| `npm run build:runtime` | 0 | Compiled application plus new smoke entry |
| `node dist/shared/i18n/runtime-smoke.js` | 0 | Host compiled smoke; target image checked independently below |
| `docker build -t gsmbot:phase08-verified .` | 0 | Approved lockfile/cache, runtime pruning, geo-tz data and smoke after `USER gsmbot` |
| `docker run --rm gsmbot:phase08-verified node dist/shared/i18n/runtime-smoke.js` | 0 | Actual final image as configured non-root user |
| Built-image geo-tz check | 0 | `geo-tz/data` exists and Seattle coordinate resolves to `America/Los_Angeles` |
| `docker compose config -q` | 0 | Synthetic validation-only token/password; no services started |
| Runbook marker verification from 08-05 Task 3 | 0 | D-13..D-16, both switch directions, waiver and restoration present |

The existing CI image job now runs `docker run --rm gsmbot:ci node dist/shared/i18n/runtime-smoke.js`; local verification used the identical command with the unique evidence tag above. All earlier CI checks and geo-tz proof remain.

### Correction provenance

The initial full integration run exposed the Phase 08-03 reset-helper regression in `chat-language-migration.test.ts`: the deliberately pre-language-migration database has no `chat_language_preferences` table, but `resetReminders` attempted to delete it. A focused two-test rerun reproduced **1 failed / 1 passed**, `PrismaClientKnownRequestError` at `tests/helpers/reminders.ts:11`. This was not a product migration failure: independent fresh full migration/status succeeded.

Commit `5992b40` adds an explicit `before-language` fixture mode selected only by that prefix-migration case. Default current-schema resets still clear the test chat's language preference; no missing-table exception is swallowed. The corrected 61-test rerun passed and includes both prefix/current migration modes, retained scoped-reset behavior, and affected localized/follow-up delivery. The rerun started at 02:40:21 local and finished in 33.73 seconds on the exact two-file patch later committed as `5992b40`.

The full integration command also exposed four pre-existing `walking-skeleton.test.ts` expectations predating Phase 6: immediate first-entry draft creation, absent language navigation, and resume/expiry fixtures that never selected language. Commit `7cbd793` updates these tests to use actual composed-bot language-choice callbacks, assert the language-first prompt, exactly one acknowledgement and draft creation after selection, and retain revision/resume/expiry and authorization assertions. No product behavior was changed. The first scoped attempt found two remaining fixture expectations (the selected prompt edits in place; weekday choices do not add language navigation), producing 58 passed / 2 failed; these were corrected, then all 60 cases passed at 02:46:53 local. This test-maintenance scope was explicitly authorized by the orchestrator to complete required CI regression checks.

The full integration command began before the migration correction and remained running while the helper changed. Its original result is retained; no clean whole-suite pass at the final revision is claimed. Subsequent test-only commits `70f963e`, `5992b40` and `7cbd793` are covered by their scoped reruns. Production source, runtime build inputs and domain APIs did not change after the initial full-check snapshot. **Combined evidence covers all 684 integration scenarios with no remaining known failure**: the initial 679 successes plus passing correction reruns for all five failed cases. The 61/60 rerun counts overlap the original suite and are not added as new unique cases. The unchanged default reset behavior remains covered in the corrected reminder suites. Final formatting/typecheck and built-image smoke pass after the last correction. No unnecessary full-suite repeat was performed.

## Final runtime proof

Final image ID: `sha256:1432cfdae7889efb155247af999cd5acd29cfb2ea9637fb6ca2d0a2eb8a86d62`.

Image config digest: `sha256:98b4f54b6395e9a39c7bd1df8672a1b1a3cbdf595d1c1dd9c51250ebaa21a2f4`; platform manifest: `sha256:ca80a0e62612708d40096632b08e8b89cb37cb496a6fae2b857313a0131a3c8f`.

Configured user `gsmbot`; observed UID `999`, Node `v24.19.0`, ICU `78.3`. Both catalogs contain matching nonzero keys and callable entries. Parameterized planning/follow-up and answered-count output is nonempty. Fixed UTC sample September 21, 2026 yields Ukrainian `понеділок` and `вересня`; h23 formatting yields `19:00`. Ukrainian plural categories are asserted for 0, 1, 2, 5, 11, 14, 21, 22, 25, 101 and 111.

Negative controls ran only inside disposable image containers: deleting `dist/shared/i18n/en.js` or `uk.js` separately made the smoke exit **1**. An additional unit negative control replaces `Intl.DateTimeFormat.supportedLocalesOf` with empty support and requires a throw; missing/empty/noncallable catalogs also fail. Five runtime-contract unit tests pass. No live container or host catalog was modified for these controls.

## Bilingual source-to-behavior matrix

The maintained AST inventory contains **477 source sites**. Strict evidence validation returns `[]`: **464 mapped sites** and **13 narrowly verified non-production sites**, not 477 allegedly bilingual executions. The 48-site handoff is closed by 35 real handler-output mappings and 13 reachability proofs. Windows ledger item 24 is fixed.

| Surface | Concrete evidence and boundary |
| --- | --- |
| Onboarding, setup, settings, roster | `localized-onboarding.e2e.test.ts`: `completes %s setup, edits settings and adds/pages/removes roster`; both en/uk with persisted state and real recorded Telegram payloads |
| Open prompts and both language directions | Same suite: `preserves revisions, open drafts/confirmations, planning answers and reminder due times across switching and restart`; existing controls survive |
| Command authorization (9 handed-off sites) | `bilingual-workflow.test.ts`: `readiness command %s rejects missing identity and unauthorized membership` for plan/status/cancel/change, plus `admin command denial retains persisted language and domain state`; both locales, exact output and unchanged durable snapshots |
| Setup expiry/stale/result paths (26 reachable handed-off sites) | Same new suite: `setup expiry at %s removes only the expired actor draft`; `setup stale branch %s preserves valid persisted controls`; save/cancel result matrix over duplicate/expired/stale/failed; `setup claim race acknowledges once without mutating the draft`. 48 total new en/uk cases. Save/cancel failure results and claim loss use explicit durable-result fault injection; routing, authorization, persisted token/draft/locale reads and recorded Telegram output remain real. These cases are presentation-path evidence, not a claim that injected database faults occurred naturally |
| Planning and availability; hostile/long Unicode identities | `localized-planning.e2e.test.ts`: `planning workflow preserves snapshots, identity safety and token authority in %s`; real day/time/review/availability paths, escaped names, opaque controls and budgets |
| Safe retry versus committed/uncertain recovery | Same suite: `retry classification distinguishes rollback and committed edit failure in %s`; uncertain-send test retains claim and silence |
| Readiness, manual booking, change/replan/cancel | `localized-lifecycle.e2e.test.ts`: `switches language before %s recovery while retaining claims and control placement`; `keeps Back read-only, rechecks request/apply authority, and books exactly once`; blocked supersession, booked-slot change, cancellation and missing-message recovery cases, in both locales |
| Current-language active-card updates | `planning-language-switch.e2e.test.ts`: repeated day/time/answers, status, current-language recovery, interleavings and revoked authority; body/buttons remain coherent and valid controls/state persist |
| Semantic feedback and denials | `localized-planning-feedback.e2e.test.ts`: `routes every semantic refusal family through a real capability and dispatcher`; both locales |
| Migration refusal | `chat-migration.test.ts`: `refuses stale old-chat callbacks in the destination's current uk/en/uk locale without mutation`; both later switch directions, English default, one acknowledgement, silent old commands and unchanged migration/domain snapshots. No blanket recovery exemption |
| Actual durable planning/follow-up sends | `localized-reminders.test.ts`: saved planning work/current preference, follow-up metadata-await switch, queued recovery, existing controls, explicit rejection retry and unknown outcome retention. These verify transport sends, not only pure renderer strings |
| Navigation and capacity boundaries | `reminder-renderers.test.ts`: en/uk public/private/basic navigation, empty/unsendable outcomes, stable order, HTML escaping, code-point label shortening, all mention links within 4096 encoded UTF-16 units; planning feedback and new handler captures retain 200-unit alert limits |
| Catalog/date/count completeness | `i18n.test.ts`, typed `catalog-samples.ts` and `planning-format.test.ts`: all 222 keys, strict missing/noncallable/bad-output controls, negative TypeScript contracts, date/month and plural boundaries |

### Explicit non-production proof

Nine historical English compatibility rows (`PLANNING_BOOKING_ROWS`, booking/cancel/change confirmation rows and lifecycle rows) occur only at their declarations in application source. Any named reference, import/alias/property reference, namespace/star export, or dynamic keyboard import invalidates the narrow proof. These constants are not marked dynamic translated data and have no bilingual evidence reference.

Four setup sites are dominated fallbacks: `dispatchSetupCallback:answerCallbackQuery:10`, `:11`, and matching `text:10`, `:11`. Save/cancel outcomes return before the later switch, and the sole production dispatcher call is bound to `START_SETUP`, which returns before the unknown-kind fallback. Exact normalized hashes of both handler and caller enforce this reviewed control-flow fact; any source edit or additional caller invalidates it. Mutation tests reject newly reachable keyboard imports/callers and changed guards. These sites are not claimed as runtime bilingual branches.

## Acceptance boundaries

All automated successes are limited to the commands/scenarios above. Native morning planning/Start and unavailable basic/public-supergroup waivers retain Phase 5 scope. New Ukrainian reminder wording and available private-supergroup behavior still require their own native observations/wording responses. Phone notification visibility/sound remains non-blocking and unobserved. Phase 7 H4 remains historically unclassifiable, not a new undefined behavioral test. Requirements and phase completion remain pending independent verification and scoped native acceptance.
