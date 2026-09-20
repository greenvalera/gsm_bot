# Deploying GSMBot on Railway

Railway runs this project as three resources in one project environment:

- **Postgres** — the managed database that holds configuration, the roster,
  planning rounds, and the pg-boss reminder queue.
- **migrate** — a one-shot service built from `Dockerfile.migrate`. It applies the
  committed migration history and provisions the reminder queue, then exits.
- **bot** — the long-poll worker built from `Dockerfile`. It runs
  `node dist/app/main.js` and talks to Telegram outbound only.

The bot opens no HTTP port. Do not give it a public domain, a health check path,
or more than one replica: a second process polling the same bot token makes
Telegram reject one of them with `409 Conflict` and can duplicate reminders.

## Before you start

- A Railway account on a plan that keeps a service always on. The bot must poll
  continuously; app sleeping and scale-to-zero break it.
- A production bot token from `@BotFather`. Do not reuse the token a local
  `docker compose` run is already polling with.
- Push access to the repository Railway will deploy from.

## 1. Create the project and the database

1. Create a new Railway project.
2. Add a database: **New → Database → Add PostgreSQL**.
3. Open the database service and rename it `Postgres` if it is named anything
   else, so the variable references below match.
4. Turn on backups for it. The roster and planning history live only here.

## 2. Add the migration service

1. **New → GitHub Repo**, pick this repository, and select the branch you
   release from.
2. Rename the service `migrate`.
3. Under **Variables**, add:
   - `RAILWAY_DOCKERFILE_PATH` = `Dockerfile.migrate`
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
4. Under **Settings**, set the restart policy to **Never**, leave the start
   command empty, add no domain, and add no health check path.

The service runs `npm run db:migrate:deploy` and exits. A successful run logs
`Application catalog and reminder queue readiness verified.` Railway shows the
deployment as stopped once the container exits, so judge the run by the logs and
the exit status, not by the badge.

`prisma/migrate-deploy.mjs` refuses to migrate a database it cannot recognize as
a safe baseline. If it prints a preflight message about legacy rounds or invalid
participant bindings, no migration was applied and no rows were touched; repair
the data first instead of re-running it.

## 3. Add the bot service

1. **New → GitHub Repo**, pick the same repository and branch.
2. Rename the service `bot`. Railway detects the root `Dockerfile` and builds
   its final `runtime` stage. Leave the start command empty so the image's
   `CMD` (`node dist/app/main.js`) is used.
3. Under **Variables**, add:
   - `BOT_TOKEN` = the production token from `@BotFather`
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `APP_MODE` = `production`
   - `LOG_LEVEL` = `info`
   - `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS` = `0`
   - `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` = `30`
4. Under **Settings**, keep exactly one replica, set the restart policy to
   **On failure**, add no domain, and add no health check path.

`RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=0` stops Railway from running the old and
new containers at the same time, which would put two pollers on one token.
`RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30` gives the outgoing container time to
finish the graceful shutdown in `src/app/main.ts`: it stops the grammY runner and
disconnects Prisma on `SIGTERM`.

Railway may warn that the service exposes no port. That is expected for a
long-poll worker.

## 4. First deploy

1. Deploy `migrate` and read its logs to the end.
2. Deploy `bot` once the migration run succeeded. The startup logs end with
   `Telegram long-poll runner started`.
3. Add the bot to the band's Telegram group and run `/setup` there.

## 5. Shipping a later version

Both services build from the same commit, and Railway does not order deploys
between them. For a release that changes `prisma/schema.prisma` or adds a
migration:

1. Let `migrate` deploy (or redeploy it manually) and confirm it succeeded.
2. Then deploy `bot`.

If `bot` starts first against a database that is missing the new columns, it
fails and the on-failure restart policy keeps retrying until the migration
lands. To avoid the noise, turn off automatic deploys for `bot` and deploy it by
hand after migrations, or enable **Wait for CI** on both services so only
commits with green CI deploy at all.

`migrate deploy` is idempotent, so redeploying `migrate` for a release without
schema changes is harmless.

## 6. Rolling back

Redeploy the previous deployment from the service's **Deployments** list. The
migration history is forward-only: a rollback of the bot image does not undo an
applied migration, so a release that changed the schema needs a reviewed
follow-up migration rather than a rollback of `migrate`.

## 7. Running migrations from a workstation instead

If you would rather not keep a `migrate` service, enable public access on the
Postgres service (**Settings → Networking → Public Access**), copy its
`DATABASE_PUBLIC_URL`, and run the same command locally against a checkout of
the release commit:

```bash
npm ci
DATABASE_URL="<DATABASE_PUBLIC_URL>" npm run db:migrate:deploy
```

The public proxy is billed as network egress, so turn public access off again
when you are done.

## Troubleshooting

- **`409 Conflict` from Telegram, or every reminder arrives twice.** Another
  process is polling the same token: a local `docker compose up bot`, a second
  replica, or an overlapping deploy. Check the replica count and
  `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS`.
- **`Invalid application configuration: BOT_TOKEN` (or `DATABASE_URL`) on
  startup.** The named variable is missing or malformed. The message never
  prints the value. `DATABASE_URL` must be a `postgres://` or `postgresql://`
  URL.
- **The first boot after a deploy cannot resolve the database host.** Railway's
  private network needs a moment after a container starts. The on-failure
  restart policy recovers; if it does not settle, confirm `DATABASE_URL` is the
  `${{Postgres.DATABASE_URL}}` reference and that both services are in the same
  project environment.
- **Reminders never fire although the bot answers commands.** The pg-boss queue
  is provisioned by the migration job, not by the bot. Re-run `migrate` and look
  for the readiness line.
- **A Telegram group was upgraded to a supergroup.** The bot handles the
  migration itself; `docs/chat-migration-recovery.md` covers the rare case that
  needs manual repair. Its steps are written for Compose. On Railway, stop the
  `bot` service first, then run the recovery entry point from a checkout of the
  deployed commit against the database, as in section 7:

  ```bash
  export DATABASE_URL="<DATABASE_PUBLIC_URL>"
  npm ci && npm run db:generate && npm run build:runtime
  node dist/app/recover-chat-migration.js OLD_BOT_API_ID NEW_BOT_API_ID --apply
  ```
