import type { RosterMember } from "../domain/roster/roster-service.js";
import { renderMessage, type Locale } from "../shared/i18n/index.js";

/** Deterministic page size for the roster projection (UI contract). */
export const ROSTER_PAGE_SIZE = 20;

export type RosterIdentity = Omit<RosterMember, "membershipId">;

/**
 * Collator for the public display label only. `sensitivity: "base"` makes case
 * and diacritics equal, so an explicit tie-breaker is required for determinism.
 */
const LABEL_COLLATOR = new Intl.Collator("en", { sensitivity: "base" });

/**
 * The ONE HTML escaper in the Telegram layer.
 *
 * Exported rather than duplicated at each new call site: every card in this
 * codebase is sent with `parse_mode: "HTML"`, and a second escaper is both a
 * latent injection bug (one of the two forgets a character) and a latent
 * double-encoding bug (both run over the same string and `&` becomes
 * `&amp;amp;`). Callers that already receive an escaped string — anything that
 * came out of `memberLabel` — must NOT run it again.
 */
export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function readableText(value: string | null) {
  return value !== null && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Builds the shared identity label for plain-text surfaces that do not use a
 * parse mode. A complete numeric Telegram ID is never returned; an unreadable
 * identity keeps four digits only.
 */
export function plainMemberLabel(member: RosterIdentity): string {
  return localizedPlainMemberLabel(member, "en");
}

export function localizedPlainMemberLabel(
  member: RosterIdentity,
  locale: Locale,
): string {
  const name = [member.firstName, member.lastName]
    .map(readableText)
    .filter((part): part is string => part !== null)
    .join(" ");
  const username = readableText(member.username);
  if (name.length > 0) {
    return username === null ? name : `${name} — @${username}`;
  }
  if (username !== null) return `@${username}`;
  return renderMessage(locale, "roster.fallback", {
    suffix: member.telegramUserId.toString().slice(-4),
  });
}

/**
 * Builds the HTML-safe form of the shared identity label. Escaping the whole
 * plain label preserves the previous output because its separators contain no
 * escapable characters, while keeping one precedence path and one escaper.
 */
export function memberLabel(member: RosterIdentity) {
  return localizedMemberLabel(member, "en");
}

export function localizedMemberLabel(member: RosterIdentity, locale: Locale) {
  return escapeHtml(localizedPlainMemberLabel(member, locale));
}

/**
 * Orders members by safe display label, then by Telegram ID purely as an
 * internal tie-breaker so equal labels keep one stable rendered order.
 */
export function sortRosterMembers<T extends RosterIdentity>(
  members: readonly T[],
): T[] {
  return [...members].sort((left, right) => {
    const byLabel = LABEL_COLLATOR.compare(
      memberLabel(left),
      memberLabel(right),
    );
    if (byLabel !== 0) return byLabel;
    if (left.telegramUserId === right.telegramUserId) return 0;
    return left.telegramUserId < right.telegramUserId ? -1 : 1;
  });
}

export type RosterPage<T extends RosterIdentity> = Readonly<{
  members: readonly T[];
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
}>;

/** Slices a sorted roster into fixed pages, clamping any stale page request. */
export function paginateRoster<T extends RosterIdentity>(
  members: readonly T[],
  page = 0,
): RosterPage<T> {
  const sorted = sortRosterMembers(members);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / ROSTER_PAGE_SIZE));
  const requested = Number.isInteger(page) ? page : 0;
  const current = Math.min(Math.max(requested, 0), pageCount - 1);
  const offset = current * ROSTER_PAGE_SIZE;
  const slice = sorted.slice(offset, offset + ROSTER_PAGE_SIZE);
  return {
    members: slice,
    page: current,
    pageCount,
    start: total === 0 ? 0 : offset + 1,
    end: offset + slice.length,
    total,
    hasPrevious: current > 0,
    hasNext: current < pageCount - 1,
  };
}

/** Renders one already-paginated projection; only safe labels reach chat text. */
export function renderRosterPage(
  projection: RosterPage<RosterIdentity>,
  locale: Locale = "en",
) {
  if (projection.total === 0) {
    return {
      text: [
        renderMessage(locale, "roster.empty", undefined),
        renderMessage(locale, "roster.addHint", undefined),
      ].join("\n"),
    };
  }
  const lines = [
    renderMessage(locale, "roster.title", undefined),
    ...projection.members.map(
      (member) => `• ${localizedMemberLabel(member, locale)}`,
    ),
  ];
  if (projection.total > ROSTER_PAGE_SIZE) {
    lines.push("", renderMessage(locale, "roster.page", projection));
  }
  return { text: lines.join("\n") };
}

/** Renders only safe active-member labels; full Telegram IDs never reach chat text. */
export function renderRoster(
  members: readonly RosterIdentity[],
  page = 0,
  locale: Locale = "en",
): { text: string } {
  return renderRosterPage(paginateRoster(members, page), locale);
}

/** In-flight state shown while the durable roster read is still outstanding. */
export function renderRosterLoading(locale: Locale = "en") {
  return {
    text: [
      renderMessage(locale, "roster.title", undefined),
      renderMessage(locale, "roster.loading", undefined),
    ].join("\n"),
  };
}

/** Read failure never shows a partial roster; it offers a bound retry instead. */
export function renderRosterFailure(locale: Locale = "en") {
  return { text: renderMessage(locale, "roster.failure", undefined) };
}

/** Names the selected safe label while limiting the consequence to future rehearsals. */
export function renderRemovalConfirmation(
  member: RosterMember,
  locale: Locale = "en",
) {
  return {
    text: [
      renderMessage(locale, "roster.removeTitle", {
        label: localizedMemberLabel(member, locale),
      }),
      renderMessage(locale, "roster.consequence", undefined),
    ].join("\n"),
  };
}
