---
status: complete
---
# Local GSMBot startup

Started existing Compose stack with `docker compose up -d --build bot` from C:/dev/gsm_bot. Existing .env and database volume were reused; no secrets or source files were changed.

Verification: build succeeded (cached layers); PostgreSQL healthy; migration preflight passed and all 11 migrations current; one bot container running with Telegram long polling. The queued /plan_status from GSM_bot_test_group was processed and its no-active-round reply was verified in Telegram Web from the second account.

Operations (from the project directory, with Docker CLI on PATH):
- Start: `docker compose up -d bot`
- Logs: `docker compose logs --tail 50 bot`
- Stop bot: `docker compose stop bot`

The computer and Docker Desktop must remain running and awake. No automatic startup or restart policy was added. Full two-account rehearsal acceptance testing remains separate from this startup check.
