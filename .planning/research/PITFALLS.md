# Pitfalls Research: Localization and Ukrainian

**Milestone:** v1.1
**Researched:** 2026-09-15
**Confidence:** HIGH risks; mitigations await implementation.

## Critical Pitfalls

| Risk | Prevention | Phase |
|---|---|---|
| Language follows the clicking user | Persist chat choice; explicit locale; interleaved en/uk tests | 6 |
| First setup cannot use Ukrainian | Decide onboarding before schema design | 6 |
| Language resets scheduling or answers | Assert unchanged generation, due times, round and responses | 6, 8 |
| English remains in uncommon paths | Audit handlers, route metadata, maps and all outbound calls | 7, 8 |
| Old buttons break | Translate labels only; retain token semantics | 7 |
| Queued reminders retain old language | Resolve preference during delivery rendering | 8 |
| English grammar leaks into Ukrainian | Intl categories and full phrases | 6, 7 |
| Civil date shifts | Separate date-only display from timestamp arithmetic | 6 |
| Names corrupt markup | Preserve escaping and test Unicode/metacharacters | 7, 8 |
| Longer text exceeds limits | Test final output and truncation behavior | 7, 8 |
| Catalog equality hides omitted copy | Combine parity and outbound inventory | 8 |
| Host result treated as runtime proof | Verify actual image separately | 8 |

## Telegram Constraints

The API specifies callback_data at 1-64 bytes, callback text at 0-200 characters, and messages at 1-4096 characters after entity parsing. Preserve opaque payloads. Retain the project's conservative UTF-16 callback budget and exactly-once acknowledgement; this research does not establish a new counting rule.

The follow-up renderer conservatively bounds encoded HTML and progressively shortens names. Localized headings must fit without losing participants or navigation.

## Verification Matrix

- English defaults for existing/new chats and missing preference; reject unsupported values.
- Restart, repeated setup and supergroup migration preserve choice.
- Members/demoted admins denied; stale/double-click outcomes acknowledged once.
- Separate group languages ignore users' differing language_code values.
- Mid-round switch preserves answers/date/time/owner/tokens; next update localizes.
- Mid-queue switch affects both reminder kinds without changing timing/deduplication.
- Counts: 0, 1, 2, 5, 11, 14, 21, 22, 25, 101, 111; decimal case if supported.
- Calendar boundaries, month case, positive/negative timezones, DST and midnight.
- Success, denial, validation, stale/recovery text; long names, emoji, &, < and >.
- Compiled catalogs and Ukrainian Intl support in target image; complete Ukrainian scenario plus English regression.

Tests should discriminate failures rather than mirror constants. Run affected suites and required CI checks during implementation. No application tests or live Telegram actions were performed during research.

## Backlog Boundary

No inherited item is necessary to define localization. Existing waivers remain valid. Testing localized variants does not reopen waived environment-specific scenarios. Document any concrete dependency before expanding scope.

## Sources

- [Telegram Bot API](https://core.telegram.org/bots/api): callbacks, messages and formatting.
- [CLDR Ukrainian plurals](https://unicode.org/cldr/charts/49/supplemental/language_plural_rules.html#uk).
- Local callbacks.ts, reminder-renderers.ts, planning-renderers.ts, settings-service.ts, reminder-service.ts, migration-service.ts, Dockerfile and PROJECT.md.
