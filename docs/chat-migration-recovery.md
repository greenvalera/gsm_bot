# Recovering a Telegram group upgrade

Telegram assigns a new Bot API chat ID when a basic group becomes a supergroup.
The bot handles both migration service messages automatically. Either event order
is accepted; repeated events do not transfer or rotate capabilities again.

The transfer preserves configuration, active/inactive roster membership, planning
round IDs, lifecycle history, participant snapshots and answers, and setup/settings
draft values. Old message IDs cannot be reused in the supergroup: anchors are
cleared and old callbacks retired. `/plan_status` posts a fresh current card;
`/plan_cancel` or `/plan_change` opens a fresh confirmation. Setup/settings prompts
retain their actor and values, but old inline actions must be reopened. Delayed
updates from the old group cannot recreate its state.

## Recovery after an already-consumed migration event

Use this only after independently confirming **both Bot API IDs** and the intended
database. Telegram Web peer IDs are not interchangeable with Bot API IDs. Never
run `/setup` to conceal a stranded configuration. Do not reset the database.

1. Build the current bot and migration images: `docker compose build bot migrate`.
2. Stop the polling worker: `docker compose stop bot`.
3. Apply reviewed schema migrations: `docker compose run --rm --no-deps migrate`.
4. Run the shared transactional service (replace the two placeholders):

   ```text
   docker compose run --rm --no-deps bot node dist/app/recover-chat-migration.js OLD_BOT_API_ID NEW_BOT_API_ID --apply
   ```

5. A successful call prints `migrated` or `already-migrated`. Conflicting destination
   configuration, roster, rounds, drafts, actions, or identity transitions are
   refused without a partial transfer. A destination status cooldown alone is
   harmless. Investigate conflicts rather than deleting destination data.
6. Restart exactly one worker: `docker compose up -d --no-deps bot`.
7. Check `/settings`, `/roster`, and `/plan_status` in the supergroup. Verify the
   same draft/history remains accessible and fresh controls work.

The operation uses a short transaction with table locks, so run manual recovery
with polling stopped. It never merges two independently configured groups. Existing
messages remain Telegram history; their new message IDs are not guessed or edited.
