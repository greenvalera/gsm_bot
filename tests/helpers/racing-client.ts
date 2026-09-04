import type {
  Prisma,
  PrismaClient,
} from "../../src/generated/prisma/client.js";

/**
 * Interposes one committed write immediately before a transaction's first
 * guarded planning-round update.
 *
 * Every other model and operation is the real Prisma client. In particular,
 * array transactions are passed through unchanged, and the interference fires
 * at most once for each wrapper.
 */
export function withPlanningRoundInterference(
  prisma: PrismaClient,
  interfere: () => Promise<void>,
): PrismaClient {
  let interferencePending = true;

  return new Proxy(prisma, {
    get(target, property) {
      const member = Reflect.get(target, property, target) as unknown;
      if (property !== "$transaction" || typeof member !== "function") {
        return member;
      }

      return (...transactionArguments: unknown[]) => {
        const [operation, ...options] = transactionArguments;
        if (typeof operation !== "function") {
          return Reflect.apply(member, target, transactionArguments);
        }

        return Reflect.apply(member, target, [
          async (tx: Prisma.TransactionClient) => {
            const proxiedTransaction = new Proxy(tx, {
              get(transaction, modelName) {
                const model = Reflect.get(
                  transaction,
                  modelName,
                  transaction,
                ) as unknown;
                if (
                  modelName !== "planningRound" ||
                  typeof model !== "object"
                ) {
                  return model;
                }

                return new Proxy(model as object, {
                  get(delegate, methodName) {
                    const method = Reflect.get(
                      delegate,
                      methodName,
                      delegate,
                    ) as unknown;
                    if (
                      methodName !== "updateMany" ||
                      typeof method !== "function"
                    ) {
                      return method;
                    }

                    return async (...methodArguments: unknown[]) => {
                      if (interferencePending) {
                        interferencePending = false;
                        await interfere();
                      }
                      return Reflect.apply(method, delegate, methodArguments);
                    };
                  },
                });
              },
            }) as Prisma.TransactionClient;

            return await Reflect.apply(operation, undefined, [
              proxiedTransaction,
            ]);
          },
          ...options,
        ]);
      };
    },
  }) as PrismaClient;
}

/**
 * Interposes one committed write immediately before a client's first direct
 * planning-round update. Used for service methods whose read and guarded write
 * intentionally live outside an interactive transaction.
 */
export function withDirectPlanningRoundInterference(
  prisma: PrismaClient,
  interfere: () => Promise<void>,
): PrismaClient {
  let interferencePending = true;

  return new Proxy(prisma, {
    get(target, property) {
      const member = Reflect.get(target, property, target) as unknown;
      if (property !== "planningRound" || typeof member !== "object") {
        return member;
      }

      return new Proxy(member as object, {
        get(delegate, methodName) {
          const method = Reflect.get(delegate, methodName, delegate) as unknown;
          if (methodName !== "updateMany" || typeof method !== "function") {
            return method;
          }

          return async (...methodArguments: unknown[]) => {
            if (interferencePending) {
              interferencePending = false;
              await interfere();
            }
            return Reflect.apply(method, delegate, methodArguments);
          };
        },
      });
    },
  }) as PrismaClient;
}
