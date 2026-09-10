import type { Context, MiddlewareFn } from "grammy";
import type { PrismaClient } from "../generated/prisma/client.js";
import { migrateChat } from "../domain/chat/migration-service.js";

export function migrationPair(
  ctx: Context,
): readonly [bigint, bigint] | undefined {
  const message = ctx.message;
  if (
    message?.migrate_to_chat_id !== undefined &&
    message.chat.type === "group"
  ) {
    return [BigInt(message.chat.id), BigInt(message.migrate_to_chat_id)];
  }
  if (
    message?.migrate_from_chat_id !== undefined &&
    message.chat.type === "supergroup"
  ) {
    return [BigInt(message.migrate_from_chat_id), BigInt(message.chat.id)];
  }
  return undefined;
}

export function migrationKeys(ctx: Context): string[] {
  const pair = migrationPair(ctx);
  return pair
    ? pair.map((id) => `chat:${id}`)
    : ctx.chat
      ? [`chat:${ctx.chat.id}`]
      : [];
}

export function migrationBoundary(
  prisma: PrismaClient,
  now: () => Date,
): MiddlewareFn {
  return async (ctx, next) => {
    const pair = migrationPair(ctx);
    if (pair) {
      await migrateChat(prisma, pair[0], pair[1], now());
      return;
    }
    if (
      ctx.chat &&
      (await prisma.chatMigration.findUnique({
        where: { oldChatId: BigInt(ctx.chat.id) },
      }))
    ) {
      // Do not route old commands or callbacks to the new chat: message IDs and
      // authorization belong to their original surface. Acknowledge stale taps.
      if (ctx.callbackQuery)
        await ctx.answerCallbackQuery({
          text: "This group was upgraded. Open /plan_status in the supergroup.",
        });
      return;
    }
    await next();
  };
}
