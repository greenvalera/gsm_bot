import { vi } from "vitest";
import { ReminderService } from "../../src/domain/reminders/reminder-service.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createLogger } from "../../src/shared/logger.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";

export const reminderChat = -808n;
export const reminderDue = new Date("2026-09-16T10:00Z");
export type ReminderPrisma = ReturnType<typeof createPrismaClient>;
export async function resetReminders(prisma: ReminderPrisma) {
  await prisma.chatLanguagePreference.deleteMany({
    where: { chatId: reminderChat },
  });
  await prisma.callbackAction.deleteMany();
  await prisma.reminderOccurrence.deleteMany();
  await prisma.planningParticipant.deleteMany();
  await prisma.planningRound.deleteMany();
  await prisma.chatMembership.deleteMany();
  await prisma.chatConfiguration.deleteMany();
  await prisma.chatConfiguration.create({
    data: {
      chatId: reminderChat,
      ...createChatConfiguration(),
      timezone: "UTC",
      reminderMinutes: [600, 660, 720, 840, 960, 980],
      reminderState: { create: { effectiveFrom: new Date("2026-09-01") } },
    },
  });
}
export async function reminderRound(prisma: ReminderPrisma) {
  const round = await prisma.planningRound.create({
    data: {
      chatId: reminderChat,
      authorUserId: 1n,
      status: "CONFIRMED",
      step: "REVIEW",
      targetWeekStart: "2026-09-14",
      timezone: "UTC",
      durationMinutes: 120,
      dailyStartMinute: 600,
      dailyEndMinute: 1260,
      lastActivityAt: reminderDue,
      startsAt: new Date("2026-09-18T15:00Z"),
      endsAt: new Date("2026-09-18T17:00Z"),
      selectedDate: "2026-09-18",
      selectedStartMinute: 900,
      anchorMessageId: 77,
      firstAvailabilityPublishedAt: new Date("2026-09-16T09:00Z"),
      availabilityAnchorAcknowledgedAt: new Date("2026-09-16T09:00Z"),
    },
  });
  await prisma.telegramUser.upsert({
    where: { telegramUserId: 1n },
    create: { telegramUserId: 1n, firstName: "A" },
    update: { firstName: "A", lastName: null, username: null },
  });
  const member = await prisma.chatMembership.create({
    data: { chatId: reminderChat, telegramUserId: 1n },
  });
  await prisma.planningParticipant.create({
    data: {
      roundId: round.id,
      chatId: reminderChat,
      telegramUserId: 1n,
      membershipId: member.id,
    },
  });
  return round;
}
export function reminderRow(
  prisma: ReminderPrisma,
  roundId: string,
  at = reminderDue,
) {
  return prisma.reminderOccurrence.create({
    data: {
      chatId: reminderChat,
      kind: "FOLLOW_UP",
      scope: roundId,
      roundId,
      generation: 1,
      civilDate: new Date("2026-09-16"),
      minute: at.getUTCHours() * 60 + at.getUTCMinutes(),
      dueAt: at,
    },
  });
}
export function reminderApp(
  prisma: ReminderPrisma,
  at: Date,
  send = vi.fn(async (_message: { text: string }) => ({ messageId: 90 })),
) {
  return {
    send,
    app: new ReminderService({
      prisma,
      botUserId: 9n,
      now: () => at,
      logger: createLogger({ level: "silent" }),
      transport: vi.fn(async () => ({ messageId: 91 })),
      followups: {
        getChat: async () => ({ id: reminderChat, type: "group" as const }),
        send,
      },
    }),
  };
}
