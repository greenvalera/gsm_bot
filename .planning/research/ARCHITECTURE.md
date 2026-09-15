# Architecture Research: Localization and Ukrainian

**Milestone:** v1.1
**Researched:** 2026-09-15
**Confidence:** MEDIUM; inspected, not implemented.

## System Overview

Canonical chat ID -> persisted locale -> explicit render context -> shared catalogs/formatters -> text plus unchanged action data. Telegram handlers and reminder delivery share this path.

## Proposed Components

| Component | Responsibility |
|---|---|
| src/localization/locale.ts | en/uk validation; absent preference defaults to English |
| catalogs/en.ts and uk.ts | Common typed messages and arguments |
| translate.ts | Pure locale/key/arguments interface |
| formatters.ts | Civil dates, timestamps, counts and durations |
| Chat preference service | Authorized persistent choice for canonical chat |

Paths are proposals, not created application files.

## Persistence Choice

Selection after first setup permits a ChatConfiguration locale field with English default. Repeated setup must preserve explicit choices.

Selection during first setup favors an independent ChatPreference record keyed by canonical chat ID. Creating it must not mark the chat configured or manufacture schedule defaults. Missing preference means English. Extend migration/tombstone/conflict handling, including unconfigured groups. This choice awaits the user.

Both designs need atomic writes, current administrator checks and unsupported-value rejection. Distinguish database failure from missing preference. Do not introduce a second authoritative session value.

## Integration Evidence

- prisma/schema.prisma has no locale field.
- settings-service.ts:saveChange uses optimistic revisions. Only timezone/reminder-minute changes invoke changeReminderSchedule; locale must not trigger that branch.
- migration-service.ts moves ChatConfiguration to the canonical destination. Independent preference storage needs explicit migration participation.
- renderers.ts, planning-renderers.ts and keyboards.ts need locale parameters while retaining stable action data.
- callbacks.ts route metadata holds stale strings: adapt to keys/functions without changing outcome-bearing acknowledgement.
- app/main.ts renders planning-start reminders in transport; reminder-service.ts renders follow-ups during reservation. Both need current locale, including recovery paths.

## Render and Concurrency Contract

Read committed locale for one coherent render. A saved change affects subsequent render operations; an already-in-flight send is not recalled. Use existing same-chat coordination and verify ordering. Do not freeze locale or translated text when jobs are generated.

Settings success uses the new language. The next normal active-card update changes text and labels; no-op comparison must include both. Preserve answers, ownership, schedule generation and token authority. No proactive historical-message rewrite.

## Dates and Grammar

selectedDate is civil, not an instant. Format a controlled UTC surrogate in UTC to avoid shifting its day; this adapter is display-only. Format real timestamps in their existing authoritative timezone, including round snapshots. Keep minute-of-day slots in 24-hour form.

Do not translate zoned-clock.ts's en-US numeric-parts formatter used for arithmetic. Replace English display maps separately. Full day/month formatting supplies contextual month forms. Use Intl plural categories with whole phrases.

## Suggested Build Order

6: foundation, preference and formatters. 7: complete interactive extraction. 8: workers, completeness audit, target-image checks and bilingual acceptance. This is a research proposal, not an approved roadmap.

## Sources

- Local files/functions above, inspected 2026-09-15.
- [ECMA-402 DateTimeFormat](https://tc39.es/ecma402/2025/#datetimeformat-objects): explicit timezone and hour-cycle options.
- [grammY i18n](https://grammy.dev/plugins/i18n): alternate engine whose client defaults must not override group policy.
