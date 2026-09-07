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
 * Interposes one committed write immediately before a transaction's first
 * participant answer write.
 *
 * The seam for a round-row change that lands AFTER the answer transaction took
 * its `round` snapshot and BEFORE the announcement decision is made. Interfering
 * at the round update instead (above) is too late for that: the answer
 * transaction's first guarded round write IS the announcement claim, so a write
 * interposed there cannot be observed by a decision the claim precedes, and the
 * unanimity-lost branch never reaches a round write at all.
 *
 * Every other model and operation is the real Prisma client, and the
 * interference fires at most once for each wrapper.
 */
export function withParticipantAnswerInterference(
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
                  modelName !== "planningParticipant" ||
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
