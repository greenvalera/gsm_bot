# Stack Research: Localization and Ukrainian

**Milestone:** v1.1
**Researched:** 2026-09-15
**Confidence:** HIGH capabilities; MEDIUM implementation fit.

## Recommended Stack

Use typed English/Ukrainian catalogs and native Intl behind a pure explicit-locale interface. This repository-specific recommendation fits two languages maintained with TypeScript code, pure renderers and background jobs outside update contexts. No new runtime dependency is needed.

| Component | Version / evidence | Purpose |
|---|---|---|
| TypeScript catalogs | Local manifest 7.0.2 | Shared key/parameter contracts |
| Intl.PluralRules | Native Node API | Language-specific categories |
| Intl.DateTimeFormat | Native Node API | Calendar display |
| Prisma/PostgreSQL | Existing dependencies | Durable chat preference |
| Vitest | Local manifest 4.1.11 | Catalog and integration verification |

Versions above are manifest observations, not registry freshness claims. The project targets Node >=24.19 <25 and node:24.19-bookworm-slim. The available host probe used v24.11.1 / ICU 77.1, outside the engine range. Verify the actual runtime image during implementation.

## Contracts

- Closed locale union en | uk; use uk, not ua.
- Semantic keys, complete sentences and shared typed argument contracts. Avoid translating concatenated English fragments.
- Validate catalog shape without requiring Ukrainian values to equal English literal types.
- Distinguish plain text, escaped dynamic data and trusted renderer-owned HTML.
- Pass an immutable locale per render; never mutate a global current language.
- Missing keys fail build/tests. Defensive English fallback must not hide incomplete Ukrainian coverage.

## Alternatives Considered

| Alternative | Assessment |
|---|---|
| @grammyjs/i18n + Fluent | Good translator resources and selectors; requires custom group negotiation, worker adapter, packaging and key checks |
| Direct Fluent | Reconsider if external translators or richer grammar justify it |
| Custom grammar/parser | Unnecessary; use Intl or a proven engine |
| Client-language detection | Conflicts with confirmed group policy |

No alternative package version is asserted. Verify versions before introducing one. TypeScript catalogs compile into dist; external FTL/JSON resources would need explicit copying because the current runtime Docker stage copies dist, package.json and node_modules.

## Sources

- [Node Intl](https://nodejs.org/api/intl.html): ICU-backed support and reduced-data builds.
- [ECMA-402](https://tc39.es/ecma402/2025/): date and plural APIs.
- [TypeScript satisfies](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html): shape validation with inference.
- [grammY i18n](https://grammy.dev/plugins/i18n): Fluent and locale negotiation.
- Local package.json, Dockerfile, renderers, src/app/main.ts and reminder-service.ts.
