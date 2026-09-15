# Project Research Summary

**Project:** GSMBot
**Milestone:** v1.1 Localization and Ukrainian
**Domain:** Localization of a stateful Telegram group bot
**Researched:** 2026-09-15
**Confidence:** MEDIUM overall; integration awaits implementation.

## Executive Summary

Use typed English/Ukrainian catalogs and native Intl behind a pure explicit-locale interface. Persist the administrator's choice for the canonical chat. This supports interactive handlers and workers without a new runtime dependency.

Complete extraction is the main effort: copy appears in renderers, handlers, keyboards, route metadata, display maps and two reminder paths. Language changes must preserve rounds, answers, schedule generation and callback authority.

Resolved on 2026-09-15: the user selected language choice at the beginning of first setup, with English as default. This needs preference storage before ChatConfiguration exists.

## Key Findings

### Recommended Stack

Existing TypeScript provides catalog contracts; Intl supplies dates/plurals. Fluent is an alternative if external translator resources become necessary. No dependency upgrade is recommended. See STACK.md.

### Expected Features

Durable administrator en/uk choice, English defaults, group isolation, full interactive translation, both reminder streams, calendar/count formatting and bilingual verification. Preserve names, command tokens, identifiers and action data.

No old backlog item is included. More languages, personal preferences, automatic detection, historical rewriting and booking automation stay out of scope.

### Architecture Approach

Resolve canonical chat and locale, then pass a coherent snapshot to pure renderers. Keep locale out of scheduling arithmetic. Adapt both worker paths. The confirmed first-setup selection favors independent preference storage.

### Critical Pitfalls

User-language defaults, late-created locale storage, stale queued language, incomplete extraction, translated action data, shifted civil dates and expanded output require targeted checks. See PITFALLS.md.

## Implications for Roadmap

| Proposed phase | Goal |
|---|---|
| 6 — Localization Foundation and Chat Language | Persistence, selection, catalogs and formatters |
| 7 — Complete Ukrainian Interactive Interface | All interactive branches and old-card compatibility |
| 8 — Localized Reminders and Bilingual Verification | Workers, completeness audit, runtime and workflow checks |

The foundation precedes extraction; cross-surface verification closes the milestone. This is a proposal, not an approved roadmap.

### Research Flags

Phase 6: implement the confirmed first-setup choice and inspect migration preflight. Phase 7: outbound branch inventory. Phase 8: reservation/transport language timing and image ICU support.

## Confidence Assessment

| Area | Confidence | Limit |
|---|---|---|
| Stack | HIGH capability / MEDIUM fit | Docs and code; no implementation |
| Features | HIGH confirmed contract | First-setup choice resolved; requirements approval pending |
| Architecture | MEDIUM | Representative paths inspected |
| Pitfalls | HIGH | Concrete seams and invariants |

### Probe Evidence

Read-only host probe: Node v24.11.1 / ICU 77.1; en and uk supported. Plurals: 0 many; 1 one; 2 few; 5/11/14 many; 21 one; 22 few; 25 many; 101 one; 111 many; 1.5 other. Controlled date: вт, 15 вересня 2026 р.

The project declares >=24.19 <25. This is host-only evidence; target-image checks remain implementation work.

### Evidence Boundaries

The working tree includes pre-existing uncommitted changes. Research changed no application files, installed no dependencies, ran no application suites and sent no Telegram messages. Prior research was preserved byte-for-byte under milestones/v1.0-research. Research and synthesis ran inline under the skill fallback, without subagents.

## Sources

- [Node Intl](https://nodejs.org/api/intl.html), [ECMA-402](https://tc39.es/ecma402/2025/), [TypeScript satisfies](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html).
- [grammY i18n](https://grammy.dev/plugins/i18n), [Fluent selectors](https://projectfluent.org/fluent/guide/selectors.html).
- [Telegram Bot API](https://core.telegram.org/bots/api), [CLDR Ukrainian plurals](https://unicode.org/cldr/charts/49/supplemental/language_plural_rules.html#uk).
- Local schema, chat/reminder services, Telegram handlers/renderers/keyboards, main.ts, Dockerfile, package.json and PROJECT.md.
