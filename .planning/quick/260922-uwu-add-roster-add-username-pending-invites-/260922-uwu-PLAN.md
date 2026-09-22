---
phase: quick
plan: 260922-uwu
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - prisma/migrations/20260922120000_roster_invites/migration.sql
  - prisma/migrate-deploy.mjs
  - src/generated/prisma/
  - src/shared/callback-schema.ts
  - src/domain/roster/roster-service.ts
  - src/telegram/roster-invite-handlers.ts
  - src/telegram/roster-handlers.ts
  - src/telegram/keyboards.ts
  - src/telegram/callbacks.ts
  - src/telegram/handlers.ts
  - src/shared/i18n/index.ts
  - src/shared/i18n/en.ts
  - src/shared/i18n/uk.ts
  - tests/fixtures/catalog-samples.ts
  - tests/fixtures/outbound-surfaces.ts
  - tests/unit/roster-invite.test.ts
  - tests/unit/callback-authority.test.ts
  - tests/integration/roster-repository.test.ts
autonomous: true
requirements: [ROST-01, L10N-01, L10N-02]

estimate:
  tokens: 150000
  raw_tokens: 150000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "D-02/D-03: An administrator who sends /roster_add @username for a person with no stored identity in this chat gets one chat message addressed to @username with a single Join button; exactly one durable invite row exists for (chat_id, lowercase username)."
    - "D-07: The Join button's callback_data is an opaque v1:<uuid> token (at most 64 bytes) and never contains the username; the invite id lives only in the server-side callback_actions.target_id."
    - "D-04: When the Telegram user whose from.username matches the invite (case-insensitive) presses Join, they are added to (or kept on / reactivated in) the band roster, the invite is consumed, and the invite message is edited into the localized add confirmation."
    - "D-04: A different user pressing Join gets the alert 'This invite is for @username.' (localized) and no roster or invite state changes; consumed, expired or unknown invites answer a short no-op notification."
    - "D-02/D-03/D-05: /roster_add with a text_mention entity adds that user directly; /roster_add @username for a username already stored on exactly one of this chat's membership records adds/reactivates directly; re-issuing /roster_add @same while pending never creates a second invite row."
    - "D-01/D-06: Reply-based /roster_add is unchanged when a replied non-bot user is present; a missing or malformed argument replies with the updated uk/en usage text that names both forms."
    - "D-08: The committed migration adds the roster_invites table and the ROSTER_JOIN CallbackActionKind label, and prisma/migrate-deploy.mjs expects exactly that catalog after the migration is applied."
    - "D-09/D-10: Both /roster_add registrations (composed and focused) reach the new argument path, the ROSTER_JOIN callback is routed in both callback tables, the outbound inventory and bilingual evidence gates pass, and npm test is green."
  artifacts:
    - path: prisma/migrations/20260922120000_roster_invites/migration.sql
      provides: "roster_invites table, unique (chat_id, username) index, ROSTER_JOIN enum label"
    - path: src/domain/roster/roster-service.ts
      provides: "normalizeTelegramUsername, ROSTER_INVITE_LIFETIME_MS, addByKnownUsername, openInvite, acceptInvite, shared membership upsert"
    - path: src/telegram/roster-invite-handlers.ts
      provides: "parseRosterAddArgument, handleRosterAddArgument, dispatchRosterJoinCallback"
    - path: src/shared/callback-schema.ts
      provides: "createRosterJoinTarget / parseRosterJoinTarget (strict zod)"
    - path: tests/unit/roster-invite.test.ts
      provides: "parser, invite, join, wrong-user, stale, reuse, direct-add and reply-flow regression cases with bilingual outbound evidence"
  key_links:
    - from: src/telegram/roster-handlers.ts#handleRosterAddCommand
      to: src/telegram/roster-invite-handlers.ts#handleRosterAddArgument
      via: "called only when no replied non-bot user exists; returns true when it handled the argument"
    - from: src/telegram/callbacks.ts#registerChatReadinessCallbacks
      to: src/telegram/roster-invite-handlers.ts#dispatchRosterJoinCallback
      via: "[CallbackActionKind.ROSTER_JOIN]: rosterJoinCallbackRoute(deps) (route-resolved authority and actor binding)"
    - from: src/telegram/handlers.ts#registerRosterHandlers
      to: src/telegram/callbacks.ts#rosterJoinCallbackRoute
      via: "focused callback table entry next to ROSTER_REMOVE"
    - from: src/domain/roster/roster-service.ts#acceptInvite
      to: roster_invites.consumed_at
      via: "guarded updateMany (consumed_at IS NULL AND expires_at > now) in the same transaction as the membership upsert"
    - from: prisma/migrate-deploy.mjs#expectedApplicationCatalog
      to: prisma/migrations/20260922120000_roster_invites/migration.sql
      via: "ROSTER_INVITE_MIGRATION constant gates the roster_invites table catalog and the trailing ROSTER_JOIN label"
---

<objective>
Let an administrator add a band member who cannot be replied to (production case: the member's message predates the bot, privacy mode delivered /roster_add without reply_to_message). New argument forms for /roster_add: a text_mention entity (direct add) and a plain @username (direct add when this chat already stores that identity, otherwise a durable pending invite confirmed by a Join button pressed by the matching Telegram user).

Approved design decisions (from the task description, numbered items 1–10), referenced below as D-01 … D-10:
- D-01 Keep the reply-based /roster_add flow unchanged when a replied non-bot user is present.
- D-02 New argument form /roster_add @username (admin-only, same authorization); also accept a text_mention entity and add that user directly like the reply flow.
- D-03 Plain @username: add directly if a stored identity with that username (case-insensitive) exists for this chat; otherwise create a durable pending invite for (chat_id, lowercase username) and post "@username, press Join to be added to the band roster" with an inline Join button.
- D-04 Join callback: acknowledged through the callback boundary; presser's from.username must match case-insensitively, otherwise a short "This invite is for @X" alert and no change; on match add via the roster add path (idempotent), consume the invite, edit the invite message into a confirmation; stale/consumed/expired → idempotent no-op with a short notification; invite expiry 7 days (the codebase already expires callback actions via expiresAt).
- D-05 Re-issuing /roster_add @same while pending never creates duplicates (unique (chat_id, username) + reuse).
- D-06 Update roster.addUsage in uk.ts and en.ts to mention both forms; every new user-facing string goes through the uk+en catalogs.
- D-07 Callback data follows the opaque v1:<uuid> token pattern (≤64 bytes); the username never appears in callback_data.
- D-08 Prisma schema change + new committed migration (bigint chat ids, timestamptz).
- D-09 Both bot.command("roster_add") registrations stay consistent and the callback is registered via the existing route-id union / route table / callback route conventions.
- D-10 Unit tests (parser, invite creation, join by matching user, join by wrong user, stale invite, reply flow regression) plus a repository integration test.

Purpose: the band roster can be completed without the reply workaround, while roster membership still rests on real Telegram user IDs.
Output: migration + schema + deploy-preflight catalog, domain invite service, Telegram argument/join handlers, bilingual copy, reconciled outbound inventory, unit + integration tests.
</objective>

<execution_context>
@C:/dev/gsm_bot/.claude/gsd-core/workflows/execute-plan.md
@C:/dev/gsm_bot/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.claude/CLAUDE.md
@src/telegram/roster-handlers.ts
@src/domain/roster/roster-service.ts
@src/telegram/callbacks.ts
@src/shared/callback-schema.ts
@prisma/schema.prisma
@tests/unit/roster-localization.test.ts
@tests/unit/outbound-surfaces.test.ts

Large files: read ONLY the named ranges (use Grep to locate first):
- src/telegram/handlers.ts: route union (lines ~84-98), CHAT_READINESS_ROUTES/PLANNING_ROUTES/ALL_ROUTES (~149-308), both bot.command("roster_add") registrations (~574 and ~1008), registerRosterHandlers (~991-1032).
- prisma/migrate-deploy.mjs: migration-name constants (~12-24), helper functions (~384-431), expectedApplicationCatalog start (~470-530), language-migration block and enums block (~911-993).
- tests/fixtures/outbound-surfaces.ts (10.8k lines): NEVER read whole. OutboundSurface type (~9-22), discoverSurfaces/verifyInventory (~124-345), evidence map (~497-633), roster-handlers entries (grep "roster-handlers.ts#").
- src/shared/i18n/en.ts, uk.ts, index.ts: grep "roster\." for the roster block.
- tests/integration/roster-repository.test.ts (~46-147 shows the composed createBot pattern and the two literal addUsage expectations).

Interfaces the executor builds on (verified in source):
- ActionContext = { chatId: bigint; actorId: bigint } (src/shared/callback-schema.ts). createCallbackToken() returns "v1:" + randomUUID() (39 bytes).
- callbackTokenSchema = /^v1:[0-9a-f-]{36}$/i. CallbackAction row: token, kind, chatId, actorUserId (NOT NULL), targetId (JSON string), expiresAt, consumedAt.
- CallbackRoute (callbacks.ts): { staleText, nonMemberText, authority: "route-resolved", actorBinding: "route-resolved", dispatch }. With route-resolved authority a non-admin passes the boundary only when isCurrentMember(role) (creator/administrator/member/restricted); chat binding and expiresAt are still checked at the boundary; actorBinding "route-resolved" skips the actorUserId comparison. The boundary's single-shot guard bare-acknowledges in finally when no branch answered.
- RosterService.addFromRepliedUser(chatId, actorId, identity) → RosterAddResult { kind: "added" | "already-active" | "reactivated"; member }. TelegramUserIdentity { id: bigint; isBot; firstName?; lastName?; username? }.
- localizedMemberLabel(member, locale) (roster-renderers.ts) returns an HTML-escaped label; resolvePresentationLocale(prisma, chatId, logger) (presentation-locale.ts); renderMessage(locale, key, params) (shared/i18n/index.ts).
- Outbound inventory: every production ctx.reply / sendMessage / editMessageText / answerCallbackQuery call, every `text:` property, every InlineKeyboard .text(label, data) call and every /telegram/ function named render*/format*/*Keyboard/*Rows/*Label is a site with id "<file>#<owner>:<tag>:<n>", an expression digest, a dependencies hash over every transitively referenced top-level function/variable declaration (including the enclosing declaration itself), and the sorted catalog keys reachable from the enclosing declaration. Each non-exempt site needs evidence {file, case, locales ["en","uk"]} whose named test case calls recordOutboundEvidence([...ids], locale).
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Tracer — /roster_add @username posts a durable invite and the matching user's Join press adds them (all layers, happy path)</name>
  <files>prisma/schema.prisma, prisma/migrations/20260922120000_roster_invites/migration.sql, prisma/migrate-deploy.mjs, src/generated/prisma/, src/shared/callback-schema.ts, src/domain/roster/roster-service.ts, src/telegram/roster-invite-handlers.ts, src/telegram/roster-handlers.ts, src/telegram/keyboards.ts, src/telegram/callbacks.ts, src/telegram/handlers.ts, src/shared/i18n/index.ts, src/shared/i18n/en.ts, src/shared/i18n/uk.ts, tests/fixtures/catalog-samples.ts, tests/unit/callback-authority.test.ts, tests/unit/roster-invite.test.ts</files>
  <action>
Wire ONE path end to end: an authorized admin sends "/roster_add @Baukov" (bot_command entity at offset 0 plus a mention entity), the bot stores an invite and posts a Join button, the user whose username is Baukov (any case) presses Join and becomes an active roster member. Real error handling on this path; the remaining branches are Task 2.

Schema and migration (D-08):
- prisma/schema.prisma: append ROSTER_JOIN as the LAST member of enum CallbackActionKind (label order is asserted by the deploy preflight). Add model RosterInvite mapped to "roster_invites" with fields in this order: id String @id @default(cuid()); chatId BigInt @map("chat_id"); username String (always lowercase, without "@"); invitedByUserId BigInt @map("invited_by_user_id"); expiresAt DateTime @map("expires_at") @db.Timestamptz(3); consumedAt DateTime? @map("consumed_at") @db.Timestamptz(3); consumedByUserId BigInt? @map("consumed_by_user_id"); createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3); updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3); @@unique([chatId, username]) (D-05); @@map("roster_invites"). Add a short /// doc comment explaining one row per chat+username, lowercase key, reopened on re-issue after consumption/expiry.
- Generate the migration SQL with Prisma's own differ, offline: save the committed schema with git show HEAD:prisma/schema.prisma into the scratchpad directory, then run with a dummy DATABASE_URL (for example postgresql://gsm:gsm@localhost:5432/gsm, only so prisma.config.ts loads) npx prisma migrate diff --from-schema <scratch old schema> --to-schema prisma/schema.prisma --script, and write the output to prisma/migrations/20260922120000_roster_invites/migration.sql. The file must contain ALTER TYPE "CallbackActionKind" ADD VALUE 'ROSTER_JOIN', CREATE TABLE "roster_invites" with BIGINT chat/user ids and TIMESTAMPTZ(3) timestamps, and CREATE UNIQUE INDEX "roster_invites_chat_id_username_key". The new label is not referenced inside the same migration (precedent: 20260831100411_planning_rounds). If the differ cannot run, hand-write the same SQL in Prisma's generated style and note that in the SUMMARY. Do not edit any existing migration.
- Regenerate the committed client: dummy DATABASE_URL plus npx prisma generate (src/generated/prisma is deliberately committed — see .gitignore note).
- prisma/migrate-deploy.mjs: add const ROSTER_INVITE_MIGRATION = "20260922120000_roster_invites" beside the other migration constants. In expectedApplicationCatalog compute rosterInviteApplied; when true add tables.roster_invites built with tableCatalog from a column tuple list in PHYSICAL order exactly as the generated CREATE TABLE (id text NN; chat_id bigint NN; username text NN; invited_by_user_id bigint NN; expires_at "timestamp(3) with time zone" NN; consumed_at timestamp(3) with time zone nullable; consumed_by_user_id bigint nullable; created_at NN default CURRENT_TIMESTAMP; updated_at NN), constraints notNullConstraints + primaryKey(["id"]), indexes btreeIndex pkey on id (unique) and btreeIndex "roster_invites_chat_id_username_key" on chat_id, username (unique). Append ...(rosterInviteApplied ? ["ROSTER_JOIN"] : []) as the LAST element of the CallbackActionKind enum expectation. Mirror the LANGUAGE_MIGRATION block's style.
- Fix the typecheck fallout of the new enum member: tests/unit/callback-authority.test.ts STALE_TEXT_BY_KIND is a Record over every CallbackActionKind — add a ROSTER_JOIN entry (the English roster.inviteStale text). Fix any other exhaustive CallbackActionKind handling that npm run typecheck reports.

Callback target (D-07): in src/shared/callback-schema.ts ADD (do not edit existing declarations — their text feeds inventory hashes) a strict zod schema for { action: literal "join", inviteId: non-empty string }, plus createRosterJoinTarget(target) (JSON.stringify of the parsed value) and parseRosterJoinTarget(targetId: string | null) using the same try/safeParse shape as parseRosterRemovalTarget, and export type RosterJoinTarget.

Domain (src/domain/roster/roster-service.ts):
- Export normalizeTelegramUsername(value: string): string | undefined — strips one leading "@", accepts only /^[A-Za-z][A-Za-z0-9_]{3,31}$/, returns lowercase; single source of truth used by the parser and the service.
- Export ROSTER_INVITE_LIFETIME_MS = 7 days (D-04). Do not change ROSTER_ACTION_LIFETIME_MS.
- Extract the body of addFromRepliedUser's transaction into a module-level helper (for example upsertActiveMembership(tx, chatId, identity)) and make addFromRepliedUser call it inside its own $transaction with identical behavior (existing tests/unit/roster-add.test.ts must keep passing). Prisma interactive transactions cannot nest, so acceptInvite reuses the helper with its own tx.
- Add "rosterInvite" to the RosterPersistence Pick.
- openInvite(chatId, actorId, username, now): Promise<{ token; username; expiresAt }> in one $transaction: normalize (throw on invalid); rosterInvite.upsert on the chatId_username compound key creating { chatId, username, invitedByUserId: actorId, expiresAt: now + ROSTER_INVITE_LIFETIME_MS } with an empty update; if the row is consumed or expired, reopen it with update (invitedByUserId actorId, fresh expiresAt, consumedAt null, consumedByUserId null); an open row is reused as-is (D-05). Then create a CallbackAction { token: createCallbackToken(), kind: CallbackActionKind.ROSTER_JOIN, chatId, actorUserId: actorId (the inviter — the column is NOT NULL; the boundary does not compare it for this route), targetId: createRosterJoinTarget({ action: "join", inviteId }), expiresAt: invite.expiresAt } and return the token.
- acceptInvite(chatId, inviteId, identity: TelegramUserIdentity, now): Promise<AcceptInviteResult> where the result is { kind: "joined"; result: RosterAddResult } | { kind: "wrong-user"; username } | { kind: "duplicate" } | { kind: "stale" }, in one $transaction: missing invite or chat mismatch → stale; consumedAt set → duplicate; expiresAt <= now → stale; identity.isBot or normalizeTelegramUsername(identity.username ?? "") !== invite.username → wrong-user with the stored username and NO writes; then guarded rosterInvite.updateMany where { id, consumedAt: null, expiresAt: { gt: now } } data { consumedAt: now, consumedByUserId: identity.id } — count !== 1 → duplicate; then upsertActiveMembership(tx, chatId, identity) (refreshes the stored TelegramUser name/username) → joined. Let infrastructure errors throw; the Telegram layer logs and answers them.

Telegram layer (new file src/telegram/roster-invite-handlers.ts; import types only from roster-handlers.ts, callbacks.ts and handlers.ts to avoid runtime cycles):
- Export parseRosterAddArgument(message: { text?: string; entities?: MessageEntity[] }) returning { kind: "none" } | { kind: "invalid" } | { kind: "user"; identity: TelegramUserIdentity } | { kind: "username"; username }. In this task implement the none and @username branches: argument = text after the offset-0 bot_command entity (this also covers /roster_add@BotName), trimmed; empty → none; exactly one token that normalizeTelegramUsername accepts → username; anything else → invalid (Task 2 adds text_mention and the remaining rules).
- Export handleRosterAddArgument(ctx: RosterCommandContext, deps: RosterHandlerDependencies, context: ActionContext): Promise<boolean>. none/invalid → return false (caller keeps its usage reply). username → deps.roster.openInvite(context.chatId, context.actorId, username, deps.now()); resolve the locale with resolvePresentationLocale(deps.prisma, context.chatId, deps.logger); ctx.reply(renderMessage(locale, "roster.invitePrompt", { username }), { parse_mode: "HTML", reply_markup: rosterInviteKeyboard(token, locale) }); return true. On a thrown error log one line — event "telegram.handler.failure", route "command:roster_add", chatId, actorId, a bounded outcome such as "roster-invite-failed", err: error — then reply common.saveFailure and return true. Never put the username, names or the token in any log field.
- Export dispatchRosterJoinCallback(ctx: CallbackContext, deps, context, action: CallbackActionRow, now): parse the target with parseRosterJoinTarget (failure → roster.inviteStale alert); build the presser identity from ctx.from (id as BigInt, is_bot, first_name, optional last_name/username — a local mapper; do NOT export or edit repliedIdentity in roster-handlers.ts); call deps.roster.acceptInvite; joined → ctx.editMessageText(renderMessage(locale, result.kind === "already-active" ? "roster.alreadyActive" : "roster.added", { label: localizedMemberLabel(member, locale) }), { parse_mode: "HTML" }) which also removes the keyboard; the boundary's finally supplies the bare acknowledgement on this branch (project pattern for "acknowledge before or alongside the durable action"). Other result kinds may answer common.stale for now; Task 2 finalizes their copy. Catch thrown errors: log (route "callback:ROSTER_JOIN", outcome "roster-join-failed", err) and answer common.saveFailure with show_alert true.
- src/telegram/roster-handlers.ts — the ONLY edit is inside handleRosterAddCommand: when repliedIdentity(...) is undefined, first return early if await handleRosterAddArgument(ctx, deps, context) is true, otherwise keep the existing usage reply unchanged. Keep every existing ctx.reply expression byte-identical and in the same order (D-01), and do not touch other declarations in the file (their text feeds inventory hashes).
- src/telegram/keyboards.ts: add rosterInviteKeyboard(joinToken: string, locale: Locale = "en") returning new InlineKeyboard().text(renderMessage(locale, "roster.inviteButton", undefined), joinToken), mirroring rosterRetryKeyboard.
- src/telegram/callbacks.ts: add exported rosterJoinCallbackRoute(deps: RosterHandlerDependencies) next to rosterCallbackRoute returning { staleText: { key: "roster.inviteStale" }, nonMemberText: { key: "roster.inviteNonMember" }, authority: "route-resolved", actorBinding: "route-resolved", dispatch } satisfies CallbackRoute, and register [CallbackActionKind.ROSTER_JOIN]: rosterJoinCallbackRoute(deps) inside the SAME exhaustive registerChatReadinessCallbacks table (append after PLANNING).
- src/telegram/handlers.ts (D-09): add "callback:ROSTER_JOIN" to the ChatReadinessRouteId union; add a new exported ROSTER_INVITE_ROUTES: readonly ChatReadinessRoute[] containing { id: "callback:ROSTER_JOIN", kind: "callback", filter: "callback_query:data", surface: "roster", protectedRoute: true, protectedWhen: "always", authority: "route-resolved" } with a doc comment (the invitee is usually NOT an administrator; authority is the invite's stored username), and include it in ALL_ROUTES. Do NOT add it to CHAT_READINESS_ROUTES (that table means "answers to a current administrator" and tests/integration/chat-readiness.e2e.test.ts asserts its exact membership). In registerRosterHandlers add [CallbackActionKind.ROSTER_JOIN]: rosterJoinCallbackRoute(deps) to its callback table. Both bot.command("roster_add") registrations already call handleRosterAddCommand, so both reach the argument path without edits.

Copy (D-06): add to MessageParameters (index.ts) and to BOTH en.ts and uk.ts:
- "roster.inviteButton": undefined — en "Join", uk "Приєднатися".
- "roster.invitePrompt": { username: string } — en "@{username}, press Join to be added to the band roster.", uk "@{username}, натисни «Приєднатися», щоб потрапити до складу гурту."
- "roster.inviteWrongUser": { username: string } — en "This invite is for @{username}.", uk "Це запрошення для @{username}."
- "roster.inviteStale": undefined — en "This invite is no longer available. Ask an administrator to send /roster_add again.", uk "Це запрошення вже недійсне. Попроси адміністратора ще раз надіслати /roster_add."
- "roster.inviteNonMember": undefined — en "Only people in this chat can join the band roster.", uk "Приєднатися до складу гурту можуть лише учасники цього чату."
- Change "roster.addUsage" — en "Reply to a band member's message with /roster_add, or send /roster_add @username to invite them.", uk "Відповідай на повідомлення учасника гурту командою /roster_add або надішли /roster_add @username, щоб запросити його." Leave roster.addHint unchanged (the empty-roster copy is asserted verbatim elsewhere).
Add every new key to tests/fixtures/catalog-samples.ts (undefined, or { username: "baukov" }).

Test (new tests/unit/roster-invite.test.ts): build a harness modeled on tests/unit/roster-localization.test.ts (grammY Bot with botInfo, api.config.use call capture, fake prisma with chatLanguagePreference, callbackAction, telegramUser, chatMembership incl. findMany with include, a new rosterInvite fake supporting upsert/update/findUnique/updateMany, $transaction passing the same fake) registered through registerRosterHandlers, with authorization.currentRole resolving per actor (ADMIN → "administrator", others → "member" unless overridden) and requireCurrentAdministrator throwing PermissionDeniedError for non-admins. Case it.each(["en","uk"] as const)("invites an unknown @username and adds the matching Join presser in %s"): admin sends "/roster_add @Baukov"; assert the sendMessage text equals renderMessage(locale, "roster.invitePrompt", { username: "baukov" }), the keyboard has exactly one button whose text is renderMessage(locale, "roster.inviteButton", undefined) and whose callback_data matches the v1 token schema, is at most 64 bytes and does not contain "baukov"; one invite row with username "baukov"; then a callback_query from a non-admin user { id: 3003, username: "BAUKOV", first_name: "Oleh" } with that token → exactly one answerCallbackQuery, an editMessageText whose text equals renderMessage(locale, "roster.added", { label }) for that member, an active membership for 3003, and the invite consumed. Outbound evidence registration for this case is added in Task 3.
  </action>
  <verify>
    <automated>npm run typecheck && npx vitest run --project unit tests/unit/roster-invite.test.ts tests/unit/roster-add.test.ts tests/unit/roster-localization.test.ts tests/unit/callback-authority.test.ts tests/unit/i18n.test.ts && node --check prisma/migrate-deploy.mjs && grep -c "ROSTER_JOIN" prisma/migrations/20260922120000_roster_invites/migration.sql</automated>
  </verify>
  <done>Typecheck passes; the tracer case passes in en and uk through the focused registration; the migration file exists with the enum label, table and unique index; the generated client exposes rosterInvite and CallbackActionKind.ROSTER_JOIN; migrate-deploy.mjs parses and carries the roster_invites catalog and trailing ROSTER_JOIN label. (tests/unit/outbound-surfaces.test.ts is expected to list the new/changed sites until Task 3.)</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Expansion — text_mention and known-username direct adds, wrong-user/stale/consumed/non-member branches, invite reuse, reply-flow regression and repository integration</name>
  <files>src/telegram/roster-invite-handlers.ts, src/domain/roster/roster-service.ts, tests/unit/roster-invite.test.ts, tests/integration/roster-repository.test.ts</files>
  <behavior>
    - parseRosterAddArgument: "/roster_add @Baukov" → username "baukov"; "/roster_add@GSMBot @Baukov" → username "baukov"; a text_mention entity after the command with a non-bot user → user identity (id as bigint, names, optional username); a text_mention of a bot → invalid; "/roster_add" → none; "/roster_add baukov", "/roster_add @abc" (too short), "/roster_add @bad-name", "/roster_add @baukov extra" → invalid; "/roster_add @GSMBot" where GSMBot is the bot's own username → invalid.
    - text_mention (D-02): adds that user directly, replies roster.added / roster.alreadyActive, creates no invite row.
    - Known username (D-03): a deactivated membership in this chat whose stored username is "Baukov" plus "/roster_add @baukov" → reactivated and roster.added reply, no invite; an active one → roster.alreadyActive; a stored username "axb" does NOT match "/roster_add @a_b" (no LIKE-wildcard semantics) → invite instead; a matching username stored only for another chat → invite; two matching memberships in this chat → invite.
    - Re-issue (D-05): "/roster_add @baukov" twice → exactly one invite row, two prompt messages, two different tokens resolving to the same inviteId; first Join by the matching user joins; a Join on the other message → common.applied alert, one membership.
    - Wrong user (D-04): Join pressed by a user with a different username, or with no username → alert text equals renderMessage(locale, "roster.inviteWrongUser", { username: "baukov" }) with show_alert true; no membership; invite not consumed; the right user can still join afterwards.
    - Stale (D-04): expired invite/action → roster.inviteStale alert; unparseable target → roster.inviteStale alert; already consumed → common.applied alert; presser whose role is "left" → roster.inviteNonMember alert; none of these mutate state; each press yields exactly one answerCallbackQuery.
    - Usage (D-06): invalid or missing argument with no reply → reply equals renderMessage(locale, "roster.addUsage", undefined); no invite, no membership.
    - Reply flow regression (D-01): /roster_add replying to a non-bot member (with or without an extra @other argument) adds the replied user exactly as before and creates no invite; a non-admin sending /roster_add @baukov gets common.denied and no invite.
    - Failure: the invite write throwing → common.saveFailure reply and a single log line without the username.
  </behavior>
  <action>
Finish the branches the tracer left open, test-first against the behavior list (write each failing case in tests/unit/roster-invite.test.ts, then implement).

- parseRosterAddArgument: evaluate text_mention first — the first entity of type "text_mention" whose offset is at or after the end of the command entity; a non-bot user maps to { kind: "user", identity } and a bot user to invalid. Then the single-token @username rule via normalizeTelegramUsername. Give handleRosterAddArgument the bot username from ctx.me.username and treat an equal normalized username as invalid (bots cannot press buttons).
- handleRosterAddArgument: user → deps.roster.addFromRepliedUser(chatId, actorId, identity) and reply the localized add confirmation (roster.added / roster.alreadyActive with localizedMemberLabel, parse_mode HTML) — render it in this module; do not export helpers from roster-handlers.ts. username → first await deps.roster.addByKnownUsername(chatId, username); a result → the same confirmation reply; undefined → the Task 1 invite path. Keep the number of distinct reply call sites small (for example one confirmation reply shared by both direct-add branches) to keep the outbound inventory compact.
- RosterService.addByKnownUsername(chatId, username): Promise<RosterAddResult | undefined> in one $transaction: load this chat's memberships including telegramUser, keep those whose stored username lowercased equals the normalized argument (compare in TypeScript — Prisma's case-insensitive filter mode compiles to ILIKE, where "_" is a single-character wildcard and would match a different person); exactly one match → active: { kind: "already-active" } without writes; otherwise reactivate it (activeAt now, deactivatedAt null) → { kind: "reactivated" }; zero or several matches → undefined. Scope is this chat only (stored usernames from other chats may be stale or belong to someone else — documented choice under D-03).
- dispatchRosterJoinCallback: finalize the copy — wrong-user → roster.inviteWrongUser { username } (the stored lowercase username, regex-validated so HTML-safe); duplicate → common.applied; stale or unparseable target → roster.inviteStale. Prefer computing the alert text first and a single ctx.answerCallbackQuery({ text, show_alert: true }) call for all refusal kinds, plus the separate failure alert, to keep inventory sites few. Expired actions and non-members are already answered at the boundary with the route's staleText/nonMemberText — assert that in tests rather than duplicating checks.
- Unit harness additions: per-actor role overrides ("left"), per-user usernames on callback presses, a switch that makes the rosterInvite fake throw, and seeding helpers for memberships/users in this and another chat.
- tests/integration/roster-repository.test.ts (real PostgreSQL via Testcontainers, existing file pattern): (1) update the two literal usage expectations (lines ~121 and ~144) to the new English roster.addUsage text; (2) add it("keeps one pending invite per chat and username and consumes it exactly once for the matching user"): RosterService.openInvite twice for the same chat/username → one roster_invites row (same id, two callback_actions rows of kind ROSTER_JOIN); a raw prisma.rosterInvite.create duplicating (chatId, username) rejects with code P2002; acceptInvite by a different username → wrong-user and zero memberships; acceptInvite by the matching user with different casing → joined and one active membership; a second acceptInvite → duplicate; an invite whose expiresAt is past → stale; (3) add it("invites by @username through the composed bot and adds the Join presser"): createBot with membershipGateway.getCurrentRole returning "administrator" for the admin id and "member" otherwise; send "/roster_add @ada_b" (bot_command + mention entities, no reply); read callback_data from the captured sendMessage reply_markup; send a callback_query from { id: 3302, username: "Ada_B", first_name: "Ada" } → the captured editMessageText text is the English roster.added confirmation and the membership is active. This exercises the composed registration (handlers.ts bot.command at ~574 and registerChatReadinessCallbacks).
  </action>
  <verify>
    <automated>npm run typecheck && npx vitest run --project unit tests/unit/roster-invite.test.ts tests/unit/roster-add.test.ts tests/unit/roster-localization.test.ts tests/unit/roster-remove.test.ts && (docker info >/dev/null 2>&1 && npx vitest run --project integration tests/integration/roster-repository.test.ts tests/integration/migration-preflight.test.ts || echo "INTEGRATION NOT RUN: Docker daemon unavailable - record in SUMMARY")</automated>
  </verify>
  <done>Every behavior bullet has a passing unit case in both locales where copy is involved; reply-based adds are unchanged; the repository integration cases pass against PostgreSQL (or the SUMMARY states exactly that Docker was unavailable and which command remains to be run).</done>
</task>

<task type="auto">
  <name>Task 3: Reconcile the outbound inventory with bilingual evidence and run the full gates</name>
  <files>tests/fixtures/outbound-surfaces.ts, tests/unit/roster-invite.test.ts</files>
  <action>
Bring tests/unit/outbound-surfaces.test.ts back to green (L10N-02) without weakening it.

1. Discover exact values mechanically. Create a TEMPORARY file tests/unit/zz-outbound-dump.tmp.test.ts (never committed; delete it before committing) with one test that imports discoverSurfaces, productionSources, outboundSurfaces and verifyInventory from ../fixtures/outbound-surfaces.js, computes the error list of verifyInventory(productionSources(), outboundSurfaces), collects the discovered records (from discoverSurfaces(productionSources())) whose id appears in any error, and writes both as JSON to a file in the session scratchpad directory whose path comes from an environment variable. Run it with npx vitest run --project unit tests/unit/zz-outbound-dump.tmp.test.ts.
2. Apply the diff to tests/fixtures/outbound-surfaces.ts using Grep plus targeted Edit (never read or rewrite the whole 10.8k-line file):
   - unmapped-dependency / unmapped-expression / catalog-path-changed on existing ids (expected: the three handleRosterAddCommand:reply sites, the two registerChatReadinessCallbacks:editMessageText sites, and every handlers.ts site whose declarations reach ALL_ROUTES) → update only digest, expression, dependencies and keys from the dump (keys may be written as an inline sorted string array instead of a catalogPaths index). Keep their existing evidence.
   - uncovered-surface (new sites in src/telegram/roster-invite-handlers.ts and keyboards.ts#rosterInviteKeyboard) → add complete entries (id, file, locator, kind, expression, digest, dependencies, keys) next to the roster-handlers entries, each with evidence { file: "tests/unit/roster-invite.test.ts", case: <exact it.each title including %s>, locales: ["en", "uk"] } naming the case that actually produces that output (prompt/button → the tracer case; wrong-user alert → the wrong-user case; stale/applied alerts → the stale case; direct-add confirmation → the text_mention or known-username case; saveFailure → the failure case; join edit → the tracer case). Add dynamic { position, reason } only if a site has no catalog keys.
   - stale-surface → remove the entry only if the site genuinely no longer exists.
3. In tests/unit/roster-invite.test.ts add recordOutboundEvidence([...site ids], locale) at the END of each named it.each(["en","uk"] as const) case (after its behavioral assertions) for exactly the sites that case exercises; import it from ../helpers/outbound-evidence.js. Every Task 2 case that renders copy must be a bilingual it.each family.
4. Re-run the dump until the error list is empty, then delete the temporary dump test.
5. Formatting and full gates: npx prettier --write on only the files this plan touched (never the whole repo — unrelated files carry line-ending noise), then run the complete verify command below. If Docker is available also run npm run test:integration -- tests/integration/roster-repository.test.ts tests/integration/migration-preflight.test.ts tests/integration/chat-readiness.e2e.test.ts.
6. Commits: stage ONLY the files listed in this plan's files_modified (explicit paths, including every changed file under src/generated/prisma/ as reported by git status for that directory). Never use a blanket add of the working tree — it contains unrelated .codex/config.toml, .planning/config.json and CRLF/LF-only modifications that must stay out of these commits. Never stage the temporary dump test.
  </action>
  <verify>
    <automated>npm run typecheck && npm test && npx prettier --check prisma/schema.prisma prisma/migrate-deploy.mjs src/shared/callback-schema.ts src/domain/roster/roster-service.ts src/telegram/roster-invite-handlers.ts src/telegram/roster-handlers.ts src/telegram/keyboards.ts src/telegram/callbacks.ts src/telegram/handlers.ts src/shared/i18n/index.ts src/shared/i18n/en.ts src/shared/i18n/uk.ts tests/fixtures/catalog-samples.ts tests/fixtures/outbound-surfaces.ts tests/unit/roster-invite.test.ts tests/unit/callback-authority.test.ts tests/integration/roster-repository.test.ts && test ! -e tests/unit/zz-outbound-dump.tmp.test.ts</automated>
  </verify>
  <done>npm test (full unit project, including outbound-surfaces "reconciles production output sites and catalog paths" and "validates case-scoped executable site registrations") passes; typecheck and prettier pass on the touched files; the temporary dump test no longer exists; commits contain only intended files.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Telegram update → /roster_add handler | Untrusted command text/entities from a chat member; the admin gate (authorize / requireCurrentAdministrator) runs before any parsing or write. |
| Telegram callback → callback boundary → join dispatcher | Untrusted callback_data and presser identity; any current chat member may press Join. |
| Stored identities → direct add | Previously stored usernames can be stale relative to Telegram's current username ownership. |
| Migration → production database | The guarded migrate-deploy preflight refuses any catalog it does not expect. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-uwu-01 | Spoofing | dispatchRosterJoinCallback / RosterService.acceptInvite | high | mitigate | Join succeeds only when ctx.from.username (Telegram-provided, unique at press time) normalized equals the stored lowercase invite username; mismatch or missing username returns wrong-user with no writes (unit-tested). |
| T-uwu-02 | Tampering | callback_data for Join | high | mitigate | Opaque v1:<uuid> token only; the invite id sits in callback_actions.target_id and is decoded with a strict zod schema; the boundary enforces chat binding and expiry before dispatch; unparseable targets answer roster.inviteStale. |
| T-uwu-03 | Elevation of Privilege | /roster_add argument path | high | mitigate | Argument handling runs inside handleRosterAddCommand, which both registrations reach only after the current-administrator check; a non-admin /roster_add @x gets common.denied (unit-tested). Join lets a user add only themselves. |
| T-uwu-04 | Tampering | concurrent Join presses / re-issue | medium | mitigate | Unique (chat_id, username); guarded updateMany on consumed_at IS NULL AND expires_at > now inside the same transaction as the membership upsert; the membership upsert is itself keyed by the (chat_id, telegram_user_id) unique. |
| T-uwu-05 | Information Disclosure | logs and callback_data | medium | mitigate | No username, name or token in any log field (bounded outcome plus err only, existing redactor); username never in callback_data (asserted in the tracer test). |
| T-uwu-06 | Spoofing | addByKnownUsername | low | accept | Scoped to this chat's own membership records, exactly-one-match rule, and the confirmation shows the full member label so an admin can undo via /roster; residual risk: a username reassigned to a different person after it was stored. |
| T-uwu-07 | Tampering | case-insensitive username match | medium | mitigate | Comparison done in TypeScript on lowercased values, not a database ILIKE filter where "_" is a wildcard; unit case proves "@a_b" does not match stored "axb". |
| T-uwu-08 | Tampering | HTML rendering of invite prompt | low | mitigate | Usernames are regex-validated to [A-Za-z0-9_]; member labels go through localizedMemberLabel (HTML-escaped). |
| T-uwu-09 | Denial of Service | invite spam | low | accept | Only current administrators can create invites; one row per chat+username; action rows expire after 7 days and are swept by the existing per-chat retention. |
| T-uwu-10 | Tampering | deploy preflight | medium | mitigate | migrate-deploy.mjs catalog updated for roster_invites and the trailing ROSTER_JOIN label; migration-preflight integration suite replays all migrations when Docker is available. |
</threat_model>

<verification>
- npm run typecheck
- npm test (full unit project; includes outbound-surfaces inventory, i18n catalog parity, callback authority, roster suites)
- npx vitest run --project unit tests/unit/roster-invite.test.ts
- With a running Docker daemon: npm run test:integration -- tests/integration/roster-repository.test.ts tests/integration/migration-preflight.test.ts tests/integration/chat-readiness.e2e.test.ts (if unavailable, record the exact reason and command in the SUMMARY; do not mark it passed)
- git show --stat HEAD~2..HEAD lists only files from files_modified (plus src/generated/prisma files)
</verification>

<success_criteria>
- /roster_add @username with no stored identity creates exactly one durable invite and a Join prompt; the matching user's press adds them and edits the prompt into the confirmation (en + uk).
- Wrong-user, stale, expired, consumed and non-member presses are no-op notifications; re-issue reuses the pending invite.
- text_mention and known-username forms add directly; the reply form is unchanged; usage copy names both forms in uk and en.
- New migration + regenerated client + migrate-deploy catalog committed; Join routed in both composed and focused registrations with route id "callback:ROSTER_JOIN" in the route union and ALL_ROUTES.
- Full unit suite (including outbound inventory with bilingual evidence) and typecheck pass.
</success_criteria>

<output>
Create `.planning/quick/260922-uwu-add-roster-add-username-pending-invites-/260922-uwu-SUMMARY.md` when done, including: migration SQL source (differ vs hand-written), the list of inventory ids added/updated, integration test status (run or exact reason not run), and confirmation that only intended files were committed.
</output>
