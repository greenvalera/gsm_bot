import { afterAll, beforeAll, beforeEach, it, expect, vi } from "vitest";
import { ReminderService } from "../../src/domain/reminders/reminder-service.js";
import { PlanningService } from "../../src/domain/planning/planning-service.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createLogger } from "../../src/shared/logger.js";
import { createCallbackToken, createPlanningTarget } from "../../src/shared/callback-schema.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import { startPostgresTestContainer, type PostgresTestContainer } from "../helpers/postgres.js";
let db: PostgresTestContainer, prisma: ReturnType<typeof createPrismaClient>;
const chatId = -708n, due = new Date("2026-09-16T07:00Z");
beforeAll(async () => { db = await startPostgresTestContainer(); prisma = createPrismaClient(db.databaseUrl); });
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });
beforeEach(async () => {
  await prisma.callbackAction.deleteMany(); await prisma.reminderOccurrence.deleteMany();
  await prisma.planningParticipant.deleteMany(); await prisma.planningRound.deleteMany();
  await prisma.chatMembership.deleteMany(); await prisma.chatConfiguration.deleteMany();
  await prisma.chatConfiguration.create({ data: { chatId, ...createChatConfiguration(), reminderMinutes: [600, 660], reminderState: { create: { effectiveFrom: new Date("2026-09-01") } } } });
});
async function fixture() {
  const round = await prisma.planningRound.create({ data: {
    chatId, authorUserId: 1n, status: "CONFIRMED", step: "REVIEW", targetWeekStart: "2026-09-14",
    timezone: "Europe/Kyiv", durationMinutes: 120, dailyStartMinute: 600, dailyEndMinute: 1260, lastActivityAt: due,
    startsAt: new Date("2026-09-18T15:00Z"), endsAt: new Date("2026-09-18T17:00Z"), selectedDate: "2026-09-18", selectedStartMinute: 1080,
    anchorMessageId: 77, announcementMessageId: 88, firstAvailabilityPublishedAt: new Date("2026-09-16T06:00Z"), availabilityAnchorAcknowledgedAt: new Date("2026-09-16T06:00Z"),
  } });
  for (const id of [3n, 2n, 1n, 4n]) {
    await prisma.telegramUser.upsert({ where: { telegramUserId: id }, create: { telegramUserId: id, firstName: String.fromCharCode(64 + Number(id)) }, update: { firstName: String.fromCharCode(64 + Number(id)) } });
    const membership = await prisma.chatMembership.create({ data: { chatId, telegramUserId: id, activeAt: id === 1n ? null : due } });
    if (id !== 4n) await prisma.planningParticipant.create({ data: { chatId, roundId: round.id, telegramUserId: id, membershipId: membership.id, availability: id === 2n ? "AVAILABLE" : null } });
  }
  return round;
}
async function occurrence(roundId: string, at = due) {
  return prisma.reminderOccurrence.create({ data: { chatId, kind: "FOLLOW_UP", scope: roundId, roundId, generation: 1, civilDate: new Date("2026-09-16"), minute: at.getUTCHours() * 60 + at.getUTCMinutes() + 180, dueAt: at } });
}
function service(at: Date, send = vi.fn(async (_message: { text: string; reply_parameters?: { message_id: number } }) => ({ messageId: 90 }))) {
  return { send, app: new ReminderService({ prisma, botUserId: 9n, now: () => at, logger: createLogger({ level: "silent" }), transport: vi.fn(async () => ({ messageId: 91 })), followups: { getChat: async () => ({ id: chatId, type: "group" as const }), send } }) };
}
it("reconcile sends only pending snapshot A/C in card order despite live-roster divergence", async () => {
  await fixture(); const f = service(due); await f.app.reconcile(chatId);
  expect(f.send).toHaveBeenCalledTimes(1);
  const sent = f.send.mock.calls[0]![0] as { text: string; reply_parameters: unknown };
  expect(sent.text.match(/user\?id=\d+/g)).toEqual(["user?id=1", "user?id=3"]);
  expect(sent.reply_parameters).toMatchObject({ message_id: 77 });
  await service(due, f.send).app.reconcile(chatId); expect(f.send).toHaveBeenCalledTimes(1);
});
it("publication at 09:59 permanently skips 10:00 even with recovery after grace", async () => {
  const round = await fixture();
  await prisma.planningRound.update({ where: { id: round.id }, data: { firstAvailabilityPublishedAt: new Date("2026-09-16T06:59Z") } });
  const row = await occurrence(round.id); const f = service(new Date("2026-09-16T07:40Z"));
  await f.app.dispatch(row.id); expect(f.send).not.toHaveBeenCalled();
  expect(await prisma.reminderOccurrence.findUnique({ where: { id: row.id } })).toMatchObject({ disposition: "OBSOLETE" });
  await service(new Date("2026-09-16T08:00Z"), f.send).app.reconcile(chatId);
  expect(f.send).toHaveBeenCalledTimes(1);
});
it.each([29, 30])("spacing at %s minutes uses actual reservation instant", async (minutes) => {
  const round = await fixture(); const row = await occurrence(round.id);
  await prisma.planningRound.update({ where: { id: round.id }, data: { lastReminderAttemptAt: new Date(due.getTime() - minutes * 60000) } });
  const f = service(due); await f.app.dispatch(row.id);
  expect(f.send).toHaveBeenCalledTimes(minutes === 30 ? 1 : 0);
});
it("blocked due work stays suppressed after unblock; next scheduled time resumes", async () => {
  const round = await fixture();
  await prisma.planningParticipant.updateMany({ where: { roundId: round.id, telegramUserId: 2n }, data: { availability: "UNAVAILABLE" } });
  const f = service(due); await f.app.reconcile(chatId); expect(f.send).not.toHaveBeenCalled();
  await prisma.planningParticipant.updateMany({ where: { roundId: round.id, telegramUserId: 2n }, data: { availability: "AVAILABLE" } });
  await service(new Date("2026-09-16T07:20Z"), f.send).app.reconcile(chatId); expect(f.send).not.toHaveBeenCalled();
  await service(new Date("2026-09-16T08:00Z"), f.send).app.reconcile(chatId); expect(f.send).toHaveBeenCalledTimes(1);
});
it("unblocking before reconciliation cannot reconstruct a reminder due during the block", async () => {
  const round = await fixture();
  await prisma.planningParticipant.updateMany({ where: { roundId: round.id, telegramUserId: 2n }, data: { availability: "UNAVAILABLE" } });
  const token = createCallbackToken(), at = new Date("2026-09-16T07:20Z");
  await prisma.callbackAction.create({ data: { token, kind: "PLANNING", chatId, actorUserId: 2n, targetId: createPlanningTarget({ action: "answer", roundId: round.id, answer: "AVAILABLE" }), expiresAt: new Date("2026-09-18T17:00Z") } });
  expect((await new PlanningService(prisma).answerAvailability(chatId, 2n, token, at)).kind).toBe("answered");
  const f = service(at); await f.app.reconcile(chatId); expect(f.send).not.toHaveBeenCalled();
  await service(new Date("2026-09-16T08:00Z"), f.send).app.reconcile(chatId); expect(f.send).toHaveBeenCalledTimes(1);
});
it.each(["BOOKED", "CANCELLED", "SUPERSEDED", "started", "answered", "unacknowledged", "empty"])("%s rounds cannot send", async (state) => {
  const round = await fixture(); const row = await occurrence(round.id);
  if (state === "started") await prisma.planningRound.update({ where: { id: round.id }, data: { startsAt: due } });
  else if (state === "answered") await prisma.planningParticipant.updateMany({ where: { roundId: round.id }, data: { availability: "AVAILABLE" } });
  else if (state === "empty") await prisma.planningParticipant.deleteMany({ where: { roundId: round.id } });
  else if (state === "unacknowledged") await prisma.planningRound.update({ where: { id: round.id }, data: { availabilityAnchorAcknowledgedAt: null } });
  else await prisma.planningRound.update({ where: { id: round.id }, data: { status: state as "BOOKED" | "CANCELLED" | "SUPERSEDED" } });
  const f = service(due); await f.app.dispatch(row.id); expect(f.send).not.toHaveBeenCalled();
});
it("reanchor is refreshed and different occurrence reservations contend on same-round spacing", async () => {
  const round = await fixture(); const a = await occurrence(round.id), b = await occurrence(round.id, new Date("2026-09-16T07:01Z"));
  await prisma.planningRound.update({ where: { id: round.id }, data: { anchorMessageId: 99 } });
  const f = service(new Date("2026-09-16T07:01Z"));
  await Promise.all([f.app.dispatch(a.id), service(new Date("2026-09-16T07:01Z"), f.send).app.dispatch(b.id)]);
  expect(f.send).toHaveBeenCalledTimes(1); expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ reply_parameters: { message_id: 99, allow_sending_without_reply: false } }));
});
