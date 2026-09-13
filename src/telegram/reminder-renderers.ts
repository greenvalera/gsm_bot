import {
  addDays,
  isoDate,
  parseCivilDate,
} from "../infrastructure/time/civil.js";
import type { AvailabilityParticipantCell } from "../domain/planning/planning-service.js";
import {
  escapeHtml,
  plainMemberLabel,
  sortRosterMembers,
} from "./roster-renderers.js";

export type FollowupChat = Readonly<{
  id: bigint;
  type: string;
  username?: string;
}>;
export type FollowupRendered = Readonly<{
  kind: "ready";
  text: string;
  reply_parameters?: { message_id: number; allow_sending_without_reply: false };
}>;

/** One message, every pending mention, and the same display ordering as the card. */
export function renderFollowupReminder(
  input: Readonly<{
    chat: FollowupChat;
    anchorMessageId: number;
    selectedDate: string;
    startMinute: number;
    durationMinutes: number;
    timezone: string;
    participants: readonly AvailabilityParticipantCell[];
  }>,
): FollowupRendered | { kind: "empty" | "unsendable" } {
  const pending = sortRosterMembers(
    input.participants.filter((p) => p.marker === "pending"),
  );
  if (pending.length === 0) return { kind: "empty" };
  if (
    !Number.isSafeInteger(input.anchorMessageId) ||
    input.anchorMessageId <= 0
  )
    return { kind: "unsendable" };
  let navigation: string;
  const basic = input.chat.type === "group";
  if (basic)
    navigation =
      "Open the replied-to availability card to answer. Use /plan_status to bring it back.";
  else if (input.chat.type === "supergroup") {
    const id = input.chat.id.toString();
    const username = input.chat.username;
    const path =
      username && /^[A-Za-z0-9_]+$/.test(username)
        ? username
        : /^-100[1-9]\d*$/.test(id)
          ? `c/${id.slice(4)}`
          : null;
    if (!path) return { kind: "unsendable" };
    navigation = `<a href="https://t.me/${path}/${input.anchorMessageId}">Open availability card</a>`;
  } else return { kind: "unsendable" };
  const clock = (minute: number) =>
    `${Math.floor(minute / 60)
      .toString()
      .padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`;
  const heading = `Rehearsal ${escapeHtml(input.selectedDate)} at ${clock(input.startMinute)} (${escapeHtml(input.timezone)}), ${input.durationMinutes} minutes.\nStill waiting for: `;
  // Bound encoded HTML conservatively as well as visible characters. Truncate
  // before escaping, on Unicode code-point boundaries, so entities stay intact.
  for (const labelLimit of [128, 64, 32, 16, 8, 1]) {
    const mentions = pending
      .map((p) => {
        const label = Array.from(plainMemberLabel(p))
          .slice(0, labelLimit)
          .join("");
        return `<a href="tg://user?id=${p.telegramUserId}">${escapeHtml(label)}</a>`;
      })
      .join(", ");
    const text = `${heading}${mentions}.\n${navigation}`;
    if (text.length <= 4096)
      return {
        kind: "ready",
        text,
        ...(basic
          ? {
              reply_parameters: {
                message_id: input.anchorMessageId,
                allow_sending_without_reply: false as const,
              },
            }
          : {}),
      };
  }
  return { kind: "unsendable" };
}

export function renderPlanningReminder(
  targetWeek: string,
  callbackData: string,
) {
  return {
    text: `Plan rehearsal for ${targetWeek} – ${isoDate(addDays(parseCivilDate(targetWeek), 6))}.`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "Start planning", callback_data: callbackData }],
      ],
    },
  };
}
