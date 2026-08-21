import type { RosterMember } from "../domain/roster/roster-service.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function memberLabel(member: Omit<RosterMember, "membershipId">) {
  const name = [member.firstName, member.lastName]
    .filter((part): part is string => part !== null && part.trim().length > 0)
    .join(" ");
  if (name.length > 0) {
    return member.username === null || member.username.trim().length === 0
      ? escapeHtml(name)
      : `${escapeHtml(name)} — @${escapeHtml(member.username)}`;
  }
  return `Telegram user ••••${member.telegramUserId.toString().slice(-4)}`;
}

export function sortRosterMembers(members: readonly RosterMember[]) {
  return [...members].sort((left, right) =>
    memberLabel(left).localeCompare(memberLabel(right), "en", {
      sensitivity: "base",
    }),
  );
}

/** Renders only safe active-member labels; full Telegram IDs never reach chat text. */
export function renderRoster(
  members: readonly Omit<RosterMember, "membershipId">[],
) {
  if (members.length === 0) {
    return {
      text: [
        "<b>No band members yet</b>",
        "Reply to a member's message, then send /roster_add to add them.",
      ].join("\n"),
    };
  }
  const sorted = [...members].sort((left, right) =>
    memberLabel(left).localeCompare(memberLabel(right), "en", {
      sensitivity: "base",
    }),
  );
  return {
    text: [
      "<b>Band roster</b>",
      ...sorted.map((member) => `• ${memberLabel(member)}`),
    ].join("\n"),
  };
}

/** Names the selected safe label while limiting the consequence to future rehearsals. */
export function renderRemovalConfirmation(member: RosterMember) {
  return {
    text: [
      `<b>Remove ${memberLabel(member)}?</b>`,
      "They will no longer be selected for future rehearsals.",
    ].join("\n"),
  };
}
