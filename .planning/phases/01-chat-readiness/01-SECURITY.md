---
phase: 1
slug: chat-readiness
status: verified
threats_open: 0
asvs_level: 1
created: 2026-08-30
verified: 2026-08-30
---

# Phase 1 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| npm registry and repository metadata → reviewed lockfile | External package identity, provenance, scripts, and boundary data cross only after the dependency review and exact-version approval. | Executable third-party code and metadata |
| Telegram clients → update router | Commands, callbacks, replies, locations, actor IDs, and chat IDs are untrusted until parsing and authorization complete. | User-controlled Telegram updates |
| Update router → application services | Only validated payloads and freshly established actor authority may reach mutations. | Authorization context and bounded commands |
| Application services → PostgreSQL | Transactions, uniqueness constraints, revisions, and durable state protect configuration, roster, callbacks, and schedules. | Persistent chat and workflow state |
| Environment/deployment → bot runtime | Validated configuration, committed migrations, single-process polling, and approved container artifacts cross at startup. | Secrets, database connectivity, runtime configuration |
| Runtime → logs and operator evidence | Allow-listed structured fields and sanitized errors prevent sensitive Telegram content from crossing observability boundaries. | Operational metadata and errors |
| Test/UAT evidence → phase closure | Automated results, live verdicts, waivers, and the windows ledger are scoped before they can justify closure. | Verification evidence and owner decisions |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation / Evidence | Status |
|-----------|----------|-----------|----------|-------------|-----------------------|--------|
| `T-01-01` | Spoofing | package/repository identity | high | mitigate | Compare npm publisher/maintainers and repository ownership against canonical project pages for every direct dependency. Evidence: `01-01-SUMMARY.md`. | closed |
| `T-01-02` | Information disclosure | audit evidence | low | accept | The dossier contains public package metadata only and no registry tokens or private credentials. Evidence: `01-01-SUMMARY.md`. | closed |
| `T-01-03` | Spoofing | `/setup` actor authorization | high | mitigate | `createBot` calls live `getChatMember` for `chat.id` and `from.id` at every protected action and accepts only creator/administrator. Evidence: `01-02-SUMMARY.md`. | closed |
| `T-01-04` | Elevation of privilege | resumed setup draft | high | mitigate | Actor/chat uniqueness plus current-role revalidation precede every protected read or write; denial removes an identifiable actor draft. Evidence: `01-02-SUMMARY.md`. | closed |
| `T-01-05` | Tampering | callback/update payload | medium | mitigate | Validate update shape and opaque callback token before loading server-side action; authority never comes from callback text. Evidence: `01-02-SUMMARY.md`. | closed |
| `T-01-06` | Information disclosure | configuration validation | high | mitigate | Zod boot validation and secret-safe errors prevent bot/database credentials from entering output. Evidence: `01-03-SUMMARY.md`. | closed |
| `T-01-07` | Denial of service | duplicate bot processes | medium | mitigate | Compose declares one bot service and `main.ts` starts one chat-key-sequentialized runner with graceful shutdown. Evidence: `01-02-SUMMARY.md`, `01-04-SUMMARY.md`. | closed |
| `T-01-08` | Elevation of privilege | resumable setup draft | high | mitigate | `AuthorizationService` refreshes role at every boundary and deletes the actor draft on denial per D-14. Evidence: `01-05-SUMMARY.md`. | closed |
| `T-01-09` | Spoofing | draft owner/location sender | high | mitigate | Bind draft and CallbackAction to chat and actor; reject a different sender before resolver or state access. Evidence: `01-05-SUMMARY.md`. | closed |
| `T-01-10` | Tampering | schedule/reminder input | medium | mitigate | Strict parsers plus complete cross-field validation run at field completion and review readiness. Evidence: `01-06-SUMMARY.md`. | closed |
| `T-01-11` | Tampering | timezone inference/candidate choice | high | mitigate | Validate and de-duplicate every result, bind one opaque action per IANA candidate to actor/chat/draft/expiry, and require explicit D-09 selection before writing `candidateTimezone`. Evidence: `01-05-SUMMARY.md`. | closed |
| `T-01-12` | Repudiation | duplicate/stale save | low | accept | Single-use action plus revision checks yield deterministic no-op copy and preserve authoritative state. Evidence: `01-07-SUMMARY.md`. | closed |
| `T-01-13` | Elevation of privilege | protected settings continuation | high | mitigate | Fresh `AuthorizationService` check precedes dashboard read, edit, and save; denial deletes actor draft. Evidence: `01-08-SUMMARY.md`. | closed |
| `T-01-14` | Tampering | stale settings write | high | mitigate | Actor-bound action, expected revision, full validation, and one transaction prevent lost updates. Evidence: `01-08-SUMMARY.md`, `01-09-SUMMARY.md`. | closed |
| `T-01-15` | Spoofing | planning-access policy | medium | mitigate | Persist a closed enum and evaluate current Telegram role independently; administrators always pass per D-12. Evidence: `01-08-SUMMARY.md`. | closed |
| `T-01-16` | Information disclosure | dashboard/read error | medium | mitigate | Render only a complete committed projection and map failures to generic copy without draft/ID leakage. Evidence: `01-09-SUMMARY.md`. | closed |
| `T-01-16-01` | Spoofing | `registerCallbackBoundary` role lookup | high | mitigate | The fix moves only the acknowledgement; `requireCurrentAdministrator` still runs before parse, durable read and dispatch. Task 2 acceptance criterion pins this order. Evidence: `01-16-SUMMARY.md`. | closed |
| `T-01-16-02` | Information disclosure | Alert payloads now actually reach the client | medium | mitigate | The four texts are module constants with no interpolation. Task 2 asserts verbatim equality, so no identifier, schedule value or roster name can leak into a newly reachable surface. Evidence: `01-16-SUMMARY.md`. | closed |
| `T-01-16-03` | Denial of service | `finally` fallback acknowledgement | medium | mitigate | The fallback is guarded so a failure delivering it cannot replace or mask an in-flight error from the handler body; `bot.catch` remains the terminal seam. Evidence: `01-16-SUMMARY.md`. | closed |
| `T-01-16-04` | Tampering | `ctx.answerCallbackQuery` own-property override | low | accept | The override lives for one update inside one closure, shadows a prototype method with an identical signature, and is unreachable from Telegram input. Evidence: `01-16-SUMMARY.md`. | closed |
| `T-01-16-SC` | Tampering | npm installs | high | accept | Accepted as `AR-01-16-SC`; No package-manager install task exists in this plan; no dependency is added, removed or upgraded. | closed |
| `T-01-17` | Repudiation | duplicate save/keep | low | accept | Single-use actions and revision checks make repeats deterministic with `Already applied.`. Evidence: `01-09-SUMMARY.md`. | closed |
| `T-01-17-01` | Elevation of privilege | The pre-authorization ownership probe | high | mitigate | The probe is two `findUnique` reads keyed on the acting user's own `(chatId, actorUserId)`. It reads no other user's data, returns only a boolean to the router, and performs no write, so nothing privileged happens before the role check. Pinned by a Task 1 acceptance criterion. Evidence: `01-17-SUMMARY.md`. | closed |
| `T-01-17-02` | Elevation of privilege | Draft deletion before denial (AC-4) | high | mitigate | The fix must not hand-roll a role check nor move the deletion out of `AuthorizationService.requireCurrentAdministrator`; the protected case keeps flowing through that method. Regression case 3 asserts deletion is recorded before the denial. Evidence: `01-17-SUMMARY.md`. | closed |
| `T-01-17-03` | Information disclosure | Silence vs denial as an oracle | low | accept | The only fact a non-administrator can infer is whether they themselves have a draft in this chat. No other actor's state is observable, and the actor already knows whether they started a wizard. Evidence: `01-17-SUMMARY.md`. | closed |
| `T-01-17-04` | Denial of service | Per-message `getChatMember` and two no-op deleteMany round-trips | medium | mitigate | Removed by the fix: an ordinary message now costs two indexed `findUnique` reads and nothing else. Pinned by the zero-role-lookup clause of the behavior block. Evidence: `01-17-SUMMARY.md`. | closed |
| `T-01-17-SC` | Tampering | npm installs | high | accept | Accepted as `AR-01-17-SC`; No package-manager install task exists in this plan; no dependency is added, removed or upgraded. | closed |
| `T-01-18` | Spoofing | `/roster_add` target identity | high | mitigate | Accept only non-bot `reply_to_message.from`; never build membership from typed text/username. Evidence: `01-10-SUMMARY.md`. | closed |
| `T-01-18-01` | Tampering | The repair UPDATE on chat_configurations | high | mitigate | The statement lowers only the window floor and only where the floor already exceeds the rehearsal start; it is provably invariant-preserving because the ceiling rule guarantees the new floor is strictly below the daily end. Task 2 asserts an already-coherent row is byte-identical afterwards. Evidence: `01-18-SUMMARY.md`. | closed |
| `T-01-18-02` | Tampering | Revision column during repair | medium | mitigate | The repair does not touch `revision`, so no live `SettingsEditDraft` or `SetupDraft` expected-revision check is silently invalidated by the migration. Evidence: `01-18-SUMMARY.md`. | closed |
| `T-01-18-03` | Elevation of privilege | New `Edit daily end` entry point | low | mitigate | The new button reuses the existing `createDashboard` token minting, so the action stays actor/chat/expiry-bound and still crosses the same authorization boundary; no new callback kind or route is introduced. Evidence: `01-18-SUMMARY.md`. | closed |
| `T-01-18-04` | Denial of service | Floor rule stranding configured chats | high | mitigate | Task 2 ships the `expectedRevision` fix and the data repair strictly before Task 3 enforces the rule, so neither `/settings` nor the documented `/setup` recovery can be bricked. Evidence: `01-18-SUMMARY.md`. | closed |
| `T-01-18-05` | Information disclosure | Rejection copy | low | accept | The rule reuses the existing outside-boundaries reason and its existing verbatim copy, which names no value and no internal state. Evidence: `01-18-SUMMARY.md`. | closed |
| `T-01-18-SC` | Tampering | npm installs | high | accept | Accepted as `AR-01-18-SC`; No package-manager install task exists in this plan; no dependency is added, removed or upgraded. | closed |
| `T-01-19` | Tampering | removal replay/cross-target | high | mitigate | Initiator/chat/target/expiry-bound action, fresh authorization, one transaction, and single consumption. Evidence: `01-11-SUMMARY.md`. | closed |
| `T-01-19-01` | Tampering | Stale wizard tokens on superseded cards | medium | mitigate | In-place editing removes the superseded keyboard, so the sibling and superseded tokens that stayed live for the draft's 30 minutes are no longer reachable from any on-screen surface. This is the origin of the 17 orphaned tokens seen in UAT test 17. Evidence: `01-19-SUMMARY.md`. | closed |
| `T-01-19-02` | Tampering | A stale tap that still reaches the dispatcher | low | accept | Already a guarded no-op: `isExpectedSetupAction` (`setup-handlers.ts:213-255`) and the `consumedAt` check (`:447`) block any state transition, and plan 01-16 made the refusal audible. No data-integrity risk is masked by either fix. Evidence: `01-19-SUMMARY.md`. | closed |
| `T-01-19-03` | Repudiation | Editing the card destroys the previous rendered state | low | accept | The durable draft in PostgreSQL, not the chat transcript, is the authoritative record of every wizard value, and settings and roster already behave this way. Evidence: `01-19-SUMMARY.md`. | closed |
| `T-01-19-04` | Information disclosure | Committed-configuration card emitted with editMessageText | low | mitigate | Omitting `reply_markup` clears the Save and Cancel buttons together with the review card, so no action bound to a promoted draft survives on screen. Pinned by a Task 1 acceptance criterion. Evidence: `01-19-SUMMARY.md`. | closed |
| `T-01-19-SC` | Tampering | npm installs | high | accept | Accepted as `AR-01-19-SC`; No package-manager install task exists in this plan; no dependency is added, removed or upgraded. | closed |
| `T-01-20` | Elevation of privilege | roster add/list action | high | mitigate | Revalidate current administrator before list/add; denial discards actor drafts. Evidence: `01-10-SUMMARY.md`, `01-11-SUMMARY.md`. | closed |
| `T-01-20-01` | Information disclosure | New wizard subject sentences | low | mitigate | The three sentences are static module strings naming a field, with no interpolation of draft values, identifiers or user data. Task 1 asserts them verbatim. Evidence: `01-20-SUMMARY.md`. | closed |
| `T-01-20-02` | Repudiation | Waiving window 10 rather than fixing it | medium | mitigate | `windows waive` requires a reason; the reason records the misfiling, the true owner, the plan that corrected the expectation, and the debug-session path, so the audit trail survives the closure. Evidence: `01-20-SUMMARY.md`. | closed |
| `T-01-20-03` | Tampering | Hand-editing the ledger's dual representation | medium | mitigate | Only the file field changes; ids, statuses, timestamps and reasons are left as the tooling wrote them, and `windows status` must still parse the result. Pinned by a Task 3 acceptance criterion. Evidence: `01-20-SUMMARY.md`. | closed |
| `T-01-20-04` | Repudiation | Marking D8 auto-passable | high | mitigate | Explicitly prevented: the entry is set to human_judgment true with a rationale, so a hand-inspected document can never be recorded as deterministically covered. Evidence: `01-20-SUMMARY.md`. | closed |
| `T-01-20-SC` | Tampering | npm installs | high | accept | Accepted as `AR-01-20-SC`; No package-manager install task exists in this plan; no dependency is added, removed or upgraded. | closed |
| `T-01-21` | Information disclosure | fallback identity | medium | mitigate | Expose only final four ID digits in UI and keep full identity server-side. Evidence: `01-10-SUMMARY.md`, `01-11-SUMMARY.md`, `01-12-SUMMARY.md`. | closed |
| `T-01-21-01` | Information disclosure | New log call sites on the update path | high | mitigate | The redactor's allow list is the mechanism and is not widened by this plan. Task 3 asserts the concrete latitude, longitude and IANA zone values never appear in any emitted line. Evidence: `01-21-SUMMARY.md`. | closed |
| `T-01-21-02` | Information disclosure | An allow-listed key carrying an object | high | mitigate | Measured behaviour: an allow-listed key holding an object is redacted, not walked — but relying on that is fragile. Task 2 requires every identifier to be passed as a bigint, number or string, pinned by an acceptance criterion. Evidence: `01-21-SUMMARY.md`. | closed |
| `T-01-21-03` | Information disclosure | Resolved IANA zone as a location proxy | medium | mitigate | `timezone` stays off the allow list; only the fact of a resolution is recorded, under the bounded outcome field. Asserted in Task 3. Evidence: `01-21-SUMMARY.md`. | closed |
| `T-01-21-04` | Repudiation | Silent terminating branches | high | mitigate | Every boundary exit and every route, including the newly silent no-in-flight-action path, emits a distinct triple, so an operator can distinguish a deliberate no-op from a swallowed failure. Evidence: `01-21-SUMMARY.md`. | closed |
| `T-01-21-05` | Denial of service | Log volume per update | low | accept | One info line per handled update plus debug-level branch detail; the default configured level keeps steady-state volume at one line per update. Evidence: `01-21-SUMMARY.md`. | closed |
| `T-01-21-06` | Tampering | Unbounded route strings | medium | mitigate | Route identifiers come from the existing bounded route table, and Task 3 asserts every emitted identifier is a member of it. Evidence: `01-21-SUMMARY.md`. | closed |
| `T-01-21-SC` | Tampering | npm installs | high | accept | Accepted as `AR-01-21-SC`; No package-manager install task exists in this plan; no dependency is added, removed or upgraded. | closed |
| `T-01-22` | Denial of service | long roster projection | low | accept | Fixed deterministic pages of 20 bound message size/callback count for the small band-chat domain. Evidence: `01-12-SUMMARY.md`. | closed |
| `T-01-22-01` | Information disclosure | Bound errors newly reaching the log sink | high | mitigate | The error is emitted only under the error key, where the redactor reduces it to name, message and code, drops the stack, and scrubs bot-token and connection-string shapes out of the message. No error is stringified into a message field or an allow-listed key. Evidence: `01-22-SUMMARY.md`. | closed |
| `T-01-22-02` | Information disclosure | Expected-input rejections carrying user text | high | mitigate | The rejection sites hold the user's raw text in scope. Task 1 forbids placing message text into any field; only the field being collected and a bounded outcome are recorded. Pinned by an acceptance criterion. Evidence: `01-22-SUMMARY.md`. | closed |
| `T-01-22-03` | Repudiation | Reintroducing an unbound catch clause | medium | mitigate | A count-based structural gate over the Telegram source directory fails on the first reintroduction, and its positive existential means a gate that reads no files fails rather than passes. Evidence: `01-22-SUMMARY.md`. | closed |
| `T-01-22-04` | Repudiation | A summary that overstates what 01-14 achieved | high | mitigate | Task 3 forbids claiming the live verification passed and requires the live-verification deliverable to be marked as human judgment with a rationale, so it can never be auto-classified as covered. Evidence: `01-22-SUMMARY.md`. | closed |
| `T-01-22-05` | Tampering | Changing recovery behaviour while adding logging | medium | mitigate | Task 1 forbids control-flow and copy changes on all twelve sites, and the full unit and integration suites gate the conversion. Evidence: `01-22-SUMMARY.md`. | closed |
| `T-01-22-SC` | Tampering | npm installs | high | accept | Accepted as `AR-01-22-SC`; No package-manager install task exists in this plan; no dependency is added, removed or upgraded. | closed |
| `T-01-23` | Elevation of privilege | command/callback registration | high | mitigate | Table-driven route inventory proves every protected route invokes shared current-role boundary. Evidence: `01-13-SUMMARY.md`. | closed |
| `T-01-23-01` | Elevation of privilege | `handlers.ts` carrier routes | high | mitigate | Preserve ownership probe → fresh administrator lookup → settings lookup/cleanup ordering and assert it in the composed-route test. Evidence: `01-23-SUMMARY.md`. | closed |
| `T-01-23-02` | Tampering | `discardExpiredDraft` | high | mitigate | Use one id/chat/actor/expiry-bound delete predicate; assert committed configuration and active drafts are unchanged. Evidence: `01-23-SUMMARY.md`. | closed |
| `T-01-23-03` | Repudiation | expired settings route | medium | mitigate | Replace the silent fallthrough with an exact user-visible outcome while retaining the existing bounded route log. Evidence: `01-23-SUMMARY.md`. | closed |
| `T-01-23-04` | Denial of service | membership lookup failure | medium | mitigate | Reuse the CR-01 fail-closed, zero-delete path so a transient Telegram failure cannot erase a current administrator's draft. Evidence: `01-23-SUMMARY.md`. | closed |
| `T-01-24` | Tampering | callback dispatcher | high | mitigate | Ack first, validate opaque token, load server-side bindings, reauthorize, and dispatch by stored kind. Evidence: `01-13-SUMMARY.md`. | closed |
| `T-01-24-01` | Elevation of privilege | `command:setup` | high | mitigate | Retain the existing current-role authorization ahead of every handler read and assert denied actors create no state. Evidence: `01-24-SUMMARY.md`. | closed |
| `T-01-24-02` | Tampering | `/setup` state classification | high | mitigate | Test the four-state matrix against real PostgreSQL and bind newly created drafts to the committed revision. Evidence: `01-24-SUMMARY.md`. | closed |
| `T-01-24-03` | Information disclosure | setup projection | medium | mitigate | Render only step prompts from actor-owned drafts; never project partial values as committed configuration. Evidence: `01-24-SUMMARY.md`. | closed |
| `T-01-24-04` | Repudiation | configured/unconfigured copy | medium | mitigate | Make a positive ChatConfiguration existence read the branch oracle and pin exact copy under composed tests. Evidence: `01-24-SUMMARY.md`. | closed |
| `T-01-25` | Information disclosure | Pino/runtime logs | high | mitigate | Explicit redaction plus fixture test containing representative secrets, coordinates, drafts, and identity. Evidence: `01-14-SUMMARY.md`. | closed |
| `T-01-25-01` | Tampering | planning-policy selection | high | mitigate | Assert unsupported values return undefined and leave both draft and committed row byte-for-byte unchanged. Evidence: `01-25-SUMMARY.md`. | closed |
| `T-01-25-02` | Elevation of privilege | broadened planning policy | high | mitigate | Preserve D-12 semantics and verify only a reviewed enum value is written; Phase 2 remains responsible for enforcement. Evidence: `01-25-SUMMARY.md`. | closed |
| `T-01-25-03` | Repudiation | positional integration test | medium | mitigate | Address the action by exact visible label and prove the requested non-default transition in review and PostgreSQL. Evidence: `01-25-SUMMARY.md`. | closed |
| `T-01-25-04` | Denial of service | invalid selection recovery | low | accept | The invalid attempt returns a safe non-mutating result; the same draft remains usable for a valid choice, which bounds disruption to one rejected action. Evidence: `01-25-SUMMARY.md`. | closed |
| `T-01-26` | Tampering | format/migration/build pipeline | high | mitigate | CI uses clean lockfile install, pinned format check, fresh PostgreSQL migrate deploy/status, full tests, and image build. Evidence: `01-14-SUMMARY.md`. | closed |
| `T-01-26-01` | Tampering | `.planning/WINDOWS.md` | high | mitigate | Mark only IDs 2, 3, 14, and 15 fixed after all named gates pass, with command and commit evidence. Evidence: `01-26-SUMMARY.md`. | closed |
| `T-01-26-02` | Repudiation | Run 1/Run 2 evidence | medium | mitigate | Preserve dates, outcomes, observations, and the Run 2 NOT APPROVED rationale during English translation. Evidence: `01-26-SUMMARY.md`. | closed |
| `T-01-26-03` | Information Disclosure | Run 3 metadata | high | mitigate | Record reproducible environment descriptors but prohibit committed tokens, passwords, chat IDs, usernames, and private identifiers. Evidence: `01-26-SUMMARY.md`. | closed |
| `T-01-26-04` | Elevation of Privilege | Final approval state | high | mitigate | Keep live status pending and delegate approval exclusively to the blocking human checkpoint in 01-27. Evidence: `01-26-SUMMARY.md`. | closed |
| `T-01-26-SC` | Tampering | Package supply chain | low | accept | No package installation or dependency change occurs in this plan. Evidence: `01-26-SUMMARY.md`. | closed |
| `T-01-27` | Repudiation | live Telegram discrepancy | low | accept | Final checkpoint records observed step/copy/state; discrepancy blocks approval rather than being waived. Evidence: `01-14-SUMMARY.md`. | closed |
| `T-01-27-01` | Spoofing | Telegram administrator/non-administrator actions | high | mitigate | Exercise both roles in the real private group and record sanitized authorization outcomes per D-10/D-11. Evidence: `01-27-SUMMARY.md`. | closed |
| `T-01-27-02` | Tampering | Durable drafts/config across restart | high | mitigate | Capture a pre-restart UTC log boundary plus bot/PostgreSQL/volume identities, restart only the bot, wait for running state, require a changed bot `StartedAt` and a fresh exact post-boundary startup record, keep PostgreSQL/volume identities unchanged, then verify configuration/draft behavior before cleanup. Evidence: `01-27-SUMMARY.md`. | closed |
| `T-01-27-03` | Repudiation | Human approval | high | mitigate | Require the literal APPROVED or NOT APPROVED resume signal plus row-level evidence; never infer consent. Evidence: `01-27-SUMMARY.md`. | closed |
| `T-01-27-04` | Information Disclosure | Runbook/UAT evidence | high | mitigate | Exclude tokens, passwords, chat/user IDs, usernames, and private group names while retaining reproducible timestamps/SHA. Evidence: `01-27-SUMMARY.md`. | closed |
| `T-01-27-05` | Denial of Service | Expired/stale/duplicate actions | medium | mitigate | Exercise F-10 plus stale/duplicate callbacks and confirm bounded, acknowledged recovery without destructive cleanup. Evidence: `01-27-SUMMARY.md`. | closed |
| `T-01-27-06` | Elevation of Privilege | Planning access and roster mutation | high | mitigate | Verify non-default policy behavior and administrator-only mutations with a real non-administrator participant. Evidence: `01-27-SUMMARY.md`. | closed |
| `T-01-27-SC` | Tampering | Package supply chain | low | accept | No package installation or dependency change occurs in this plan. Evidence: `01-27-SUMMARY.md`. | closed |
| `T-01-28` | Tampering | integration schema | high | mitigate | The PostgreSQL fixture applies committed `migrate deploy` and blocks behavior assertions on migration failure. Evidence: `01-03-SUMMARY.md`, `01-04-SUMMARY.md`. | closed |
| `T-01-28-01` | Information Disclosure | Time-zone prompt copy | medium | mitigate | Keep the prompt a group-native reply instruction; add no private-chat location request, reply keyboard, or WebView, and echo no coordinate or resolved zone in copy, fixtures, or evidence. Evidence: `01-28-SUMMARY.md`. | closed |
| `T-01-28-02` | Tampering | `01-UI-SPEC.md` Copywriting Contract versus renderers | medium | mitigate | Single-source the sentence in one contract row and one exported constant; a region-scoped grep proves the row exists, a file grep proves the superseded sentence is gone, and a unit drift guard fails if the two branches diverge. Evidence: `01-28-SUMMARY.md`. | closed |
| `T-01-28-03` | Spoofing | Telegram privacy-mode posture | high | mitigate | The change is copy only. No handler, update filter, or privacy setting is modified; the full unit and e2e integration suites are re-run to prove the `message:location` reply-only routing is untouched. Evidence: `01-28-SUMMARY.md`. | closed |
| `T-01-28-04` | Repudiation | Broken-window ledger | low | accept | Window 17 closes on landed code following the windows 4-12 precedent, and its reason states explicitly that live confirmation is still pending, so the ledger cannot be read as a live pass. Evidence: `01-28-SUMMARY.md`. | closed |
| `T-01-28-SC` | Tampering | npm/pip/cargo installs | low | accept | No package installation or dependency change occurs in this plan, so no package-legitimacy audit or install checkpoint is required. Evidence: `01-28-SUMMARY.md`. | closed |
| `T-01-29` | Elevation of privilege | setup continuation | high | mitigate | Every text/choice handler reuses `AuthorizationService` before actor-bound draft access per D-13/D-14. Evidence: `01-06-SUMMARY.md`. | closed |
| `T-01-29-01` | Repudiation | Broken-window ledger entry 16 | high | mitigate | Close only against a captured dated run of the named test file plus commit provenance established from `git log`/`git show`, and record the test-versus-service distinction in the reason itself so a weakened test cannot masquerade as a fixed defect. Evidence: `01-29-SUMMARY.md`. | closed |
| `T-01-29-02` | Elevation of Privilege | Unsupported planning-access policy value | high | mitigate | Re-prove the fail-soft contract is non-mutating: the invalid value resolves `undefined`, the committed policy and revision are unchanged, the actor-bound draft keeps its field, expiry, and replacement payload, and the value cannot be saved. Evidence: `01-29-SUMMARY.md`. | closed |
| `T-01-29-03` | Tampering | `deferred-items.md` audit trail | medium | mitigate | Retain the original finding text under a superseded heading and append the resolution; a `git diff` check proves the original was kept rather than deleted. Evidence: `01-29-SUMMARY.md`. | closed |
| `T-01-29-04` | Information Disclosure | Captured test evidence | low | mitigate | Record only file, test, and title counts plus commit SHAs; record no database contents, chat identifier, or credential. Evidence: `01-29-SUMMARY.md`. | closed |
| `T-01-29-SC` | Tampering | npm/pip/cargo installs | low | accept | No package installation or dependency change occurs in this plan, so no package-legitimacy audit or install checkpoint is required. Evidence: `01-29-SUMMARY.md`. | closed |
| `T-01-30` | Spoofing | planning-access policy | medium | mitigate | Closed enum parsing rejects absent/unsupported values before draft persistence. Evidence: `01-06-SUMMARY.md`. | closed |
| `T-01-30-01` | Information Disclosure | Live evidence capture | high | mitigate | Exclude the token, database password, chat and user identifiers, usernames, display names, group name, raw coordinates, and the resolved candidate zone; inspect screenshots without copying them into the repository, and record field names and row identifiers instead of values. Evidence: `01-30-SUMMARY.md`. | closed |
| `T-01-30-02` | Tampering | Preserved named PostgreSQL volume | high | mitigate | Use only `docker compose up`/`restart bot`; `docker compose down -v` is forbidden for the whole run, and the named volume identity is asserted before and after launch. Evidence: `01-30-SUMMARY.md`. | closed |
| `T-01-30-03` | Repudiation | Human approval | high | mitigate | Require the literal APPROVED or NOT APPROVED resume signal with per-row evidence; never infer consent from silence, a passing sub-row, or the green automated preflight. Evidence: `01-30-SUMMARY.md`. | closed |
| `T-01-30-04` | Spoofing | Telegram privacy-mode posture during the run | high | mitigate | Privacy mode stays enabled for the entire run; the replied-location observation R4-02 is only meaningful under it, and no group-privacy setting may be changed to make a surface pass. Evidence: `01-30-SUMMARY.md`. | closed |
| `T-01-30-05` | Elevation of Privilege | Scope creep of the verdict | medium | mitigate | The Run 4 section names its three adjudicated items and disclaims the rest; no Run 3 row may be re-marked, and `01-14-SUMMARY.md` and `COVERAGE.md` are asserted unmodified by `git diff`. Evidence: `01-30-SUMMARY.md`. | closed |
| `T-01-30-06` | Denial of Service | An in-run fix to the candidate | medium | mitigate | The candidate is immutable for the run's duration; a failure opens a window and requires a fresh candidate, asserted by no `src/` or `tests/` file appearing in this plan's diff. Evidence: `01-30-SUMMARY.md`. | closed |
| `T-01-30-SC` | Tampering | npm/pip/cargo installs | low | accept | No package installation or dependency change occurs in this plan; the image is built from the already-audited lockfile. Evidence: `01-30-SUMMARY.md`. | closed |
| `T-01-31` | Elevation of privilege | setup save | high | mitigate | Acknowledge, reauthorize current actor, then enter the transaction; denial deletes actor draft per D-14. Evidence: `01-07-SUMMARY.md`. | closed |
| `T-01-32` | Tampering | active configuration promotion | high | mitigate | Full validation, expected revision, full-record write, action consumption, and draft deletion share one transaction. Evidence: `01-07-SUMMARY.md`. | closed |
| `T-01-33` | Elevation of privilege | mid-flow settings actor | high | mitigate | Acknowledge then refresh role before every input/callback read or mutation; denial deletes actor draft. Evidence: `01-09-SUMMARY.md`. | closed |
| `T-01-34` | Tampering | page/removal action mapping | high | mitigate | Bind opaque actions to actor/chat/membership/page/expiry and test label-to-action adjacency at boundaries. Evidence: `01-12-SUMMARY.md`. | closed |
| `T-01-35` | Tampering | geo-tz runtime boundary data | high | mitigate | Docker build and post-build smoke gates require the package data directory and a successful known-coordinate lookup through `dist/find-now`. Evidence: `01-04-SUMMARY.md`, `01-14-SUMMARY.md`. | closed |
| `T-01-36` | Spoofing | geo-tz publisher/source/release identity | high | mitigate | Compare the exact npm identity with the canonical repository, signed tag, license, lifecycle fields, and 2026c source-data release. Evidence: `01-15-SUMMARY.md`. | closed |
| `T-01-37` | Tampering | timezone boundary/runtime data | high | mitigate | Record the builder provenance, current/future entry point, multi-result semantics, unpacked size, and required Docker data path for later build/smoke enforcement. Evidence: `01-15-SUMMARY.md`. | closed |
| `T-01-38` | Repudiation | historical resolver decision | medium | mitigate | Preserve the immutable tz-lookup rejection record and create a separate 01-15 decision/summary rather than rewriting 01-01 history. Evidence: `01-15-SUMMARY.md`. | closed |
| `T-01-39` | Denial of service | resolver data/error path | medium | mitigate | Convert invalid input, empty/invalid results, and lookup exceptions to a bounded failure result and preserve the active draft step. Evidence: `01-05-SUMMARY.md`. | closed |
| `T-01-40` | Tampering | timezone edit candidate | high | mitigate | Bind each validated IANA candidate to its own actor/chat/edit/expiry action and write only the selected replacement before Current/New save. Evidence: `01-09-SUMMARY.md`. | closed |
| `T-01-SC` | Tampering | npm package installation | high | mitigate | Task 1 records provenance and executable-script evidence; blocking Task 2 requires human approval before any install. Evidence: `01-01-SUMMARY.md`, `01-02-SUMMARY.md`, `01-03-SUMMARY.md`, `01-04-SUMMARY.md`, `01-05-SUMMARY.md`, `01-06-SUMMARY.md`, `01-07-SUMMARY.md`, `01-08-SUMMARY.md`, `01-09-SUMMARY.md`, `01-10-SUMMARY.md`, `01-11-SUMMARY.md`, `01-12-SUMMARY.md`, `01-13-SUMMARY.md`, `01-14-SUMMARY.md`, `01-15-SUMMARY.md`. | closed |

*Status: open · closed · open — below high threshold (non-blocking).*

*Severity: critical > high > medium > low. Only open threats at or above `workflow.security_block_on: high` count toward `threats_open`.*

*Duplicate declarations were consolidated by unique Threat ID using the stricter severity/disposition; evidence references all contributing plan summaries.*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| `AR-01-02` | `T-01-02` | The dossier contains public package metadata only and no registry tokens or private credentials. Source: `01-01-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-12` | `T-01-12` | Single-use action plus revision checks yield deterministic no-op copy and preserve authoritative state. Source: `01-07-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-16-04` | `T-01-16-04` | The override lives for one update inside one closure, shadows a prototype method with an identical signature, and is unreachable from Telegram input. Source: `01-16-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-16-SC` | `T-01-16-SC` | No dependency was added, removed, or upgraded in `01-16-PLAN.md`; residual supply-chain classification explicitly accepted to close Phase 1. | Project owner (explicit task approval) | 2026-08-30 |
| `AR-01-17` | `T-01-17` | Single-use actions and revision checks make repeats deterministic with `Already applied.`. Source: `01-09-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-17-03` | `T-01-17-03` | The only fact a non-administrator can infer is whether they themselves have a draft in this chat. No other actor's state is observable, and the actor already knows whether they started a wizard. Source: `01-17-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-17-SC` | `T-01-17-SC` | No dependency was added, removed, or upgraded in `01-17-PLAN.md`; residual supply-chain classification explicitly accepted to close Phase 1. | Project owner (explicit task approval) | 2026-08-30 |
| `AR-01-18-05` | `T-01-18-05` | The rule reuses the existing outside-boundaries reason and its existing verbatim copy, which names no value and no internal state. Source: `01-18-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-18-SC` | `T-01-18-SC` | No dependency was added, removed, or upgraded in `01-18-PLAN.md`; residual supply-chain classification explicitly accepted to close Phase 1. | Project owner (explicit task approval) | 2026-08-30 |
| `AR-01-19-02` | `T-01-19-02` | Already a guarded no-op: `isExpectedSetupAction` (`setup-handlers.ts:213-255`) and the `consumedAt` check (`:447`) block any state transition, and plan 01-16 made the refusal audible. No data-integrity risk is masked by either fix. Source: `01-19-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-19-03` | `T-01-19-03` | The durable draft in PostgreSQL, not the chat transcript, is the authoritative record of every wizard value, and settings and roster already behave this way. Source: `01-19-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-19-SC` | `T-01-19-SC` | No dependency was added, removed, or upgraded in `01-19-PLAN.md`; residual supply-chain classification explicitly accepted to close Phase 1. | Project owner (explicit task approval) | 2026-08-30 |
| `AR-01-20-SC` | `T-01-20-SC` | No dependency was added, removed, or upgraded in `01-20-PLAN.md`; residual supply-chain classification explicitly accepted to close Phase 1. | Project owner (explicit task approval) | 2026-08-30 |
| `AR-01-21-05` | `T-01-21-05` | One info line per handled update plus debug-level branch detail; the default configured level keeps steady-state volume at one line per update. Source: `01-21-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-21-SC` | `T-01-21-SC` | No dependency was added, removed, or upgraded in `01-21-PLAN.md`; residual supply-chain classification explicitly accepted to close Phase 1. | Project owner (explicit task approval) | 2026-08-30 |
| `AR-01-22` | `T-01-22` | Fixed deterministic pages of 20 bound message size/callback count for the small band-chat domain. Source: `01-12-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-22-SC` | `T-01-22-SC` | No dependency was added, removed, or upgraded in `01-22-PLAN.md`; residual supply-chain classification explicitly accepted to close Phase 1. | Project owner (explicit task approval) | 2026-08-30 |
| `AR-01-25-04` | `T-01-25-04` | The invalid attempt returns a safe non-mutating result; the same draft remains usable for a valid choice, which bounds disruption to one rejected action. Source: `01-25-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-26-SC` | `T-01-26-SC` | No package installation or dependency change occurs in this plan. Source: `01-26-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-27` | `T-01-27` | Final checkpoint records observed step/copy/state; discrepancy blocks approval rather than being waived. Source: `01-14-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-27-SC` | `T-01-27-SC` | No package installation or dependency change occurs in this plan. Source: `01-27-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-28-04` | `T-01-28-04` | Window 17 closes on landed code following the windows 4-12 precedent, and its reason states explicitly that live confirmation is still pending, so the ledger cannot be read as a live pass. Source: `01-28-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-28-SC` | `T-01-28-SC` | No package installation or dependency change occurs in this plan, so no package-legitimacy audit or install checkpoint is required. Source: `01-28-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-29-SC` | `T-01-29-SC` | No package installation or dependency change occurs in this plan, so no package-legitimacy audit or install checkpoint is required. Source: `01-29-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |
| `AR-01-30-SC` | `T-01-30-SC` | No package installation or dependency change occurs in this plan; the image is built from the already-audited lockfile. Source: `01-30-PLAN.md`. | Plan-time disposition (migrated) | 2026-08-30 |

*The seven high supply-chain risks `T-01-16-SC` through `T-01-22-SC` were explicitly accepted by the project owner on 2026-08-30. They describe plans with no dependency changes; the acceptance closes the formal logging gap without claiming that an install or new dependency review occurred.*

*Lower-severity accepted dispositions were migrated from their source PLAN threat registers so they do not resurface in future audits.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-30 | 121 unique IDs from 142 declarations | 114 | 7 | `gsd-security-auditor` (pre-acceptance verdict) |
| 2026-08-30 | 121 unique IDs from 142 declarations | 121 | 0 | Codex orchestrator after explicit owner acceptance |

### Evidence Integrity Notes

- UAT test 16 was closed by explicit owner waiver. The live 20+ account pagination scenario was not executed and is not represented as executed.
- Run 4's `APPROVED` verdict is scoped to the F-12 prompt/location checks, not a full live rerun.
- The verification windows ledger is 0 open, 16 fixed, and 1 waived.
- No unregistered threat flags were reported by the auditor.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-30 after explicit project-owner acceptance of the seven blocking risks.

