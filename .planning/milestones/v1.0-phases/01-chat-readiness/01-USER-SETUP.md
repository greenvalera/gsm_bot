# Phase 01: User Setup Required

**Generated:** 2026-08-20
**Phase:** 01-chat-readiness
**Status:** Incomplete

Complete these items to run the long-polling bot and perform the final live Telegram verification.

## Environment Variables

| Status | Variable | Source | Add to |
| --- | --- | --- | --- |
| [ ] | `BOT_TOKEN` | Telegram `@BotFather` → the token for the private test bot | Local secret environment or deployment secret store |
| [ ] | `DATABASE_URL` | PostgreSQL connection created for GSMBot | Local secret environment or deployment secret store |

## Dashboard Configuration

- [ ] **Add the test bot to a private Telegram test group as an administrator**
  - Location: Telegram group settings → Administrators
  - Why: `getChatMember` is reliable for other users when the bot is an administrator.

## Verification

After setting both secrets and adding the bot to the group, run the bot with the production runner added in the next runtime plan, then send `/setup` as a current group administrator.

Expected result:

- The group receives the `Set up rehearsal planning` prompt and `Start setup` button.
- A non-administrator receives the documented denial message.
- If the administrator is demoted, the next protected command or callback is denied immediately.

---

**Once all items complete:** Mark status as "Complete" at top of file.
