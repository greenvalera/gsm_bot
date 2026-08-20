import { z } from "zod";

const logLevelSchema = z.enum([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
]);

const appModeSchema = z.enum(["production", "test", "smoke"]);

const environmentSchema = z.object({
  BOT_TOKEN: z.string().trim().min(1),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) => {
        const protocol = new URL(value).protocol;
        return protocol === "postgres:" || protocol === "postgresql:";
      },
      { message: "must use a PostgreSQL connection URL" },
    ),
  LOG_LEVEL: logLevelSchema.default("info"),
  APP_MODE: appModeSchema.default("production"),
});

export type AppConfig = Readonly<{
  botToken: string;
  databaseUrl: string;
  logLevel: z.infer<typeof logLevelSchema>;
  mode: z.infer<typeof appModeSchema>;
}>;

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

function invalidKeys(issues: z.core.$ZodIssue[]) {
  return [...new Set(issues.map((issue) => String(issue.path[0])))]
    .filter((key) => key !== "undefined")
    .join(", ");
}

/**
 * Validates boot inputs before creating Telegram or PostgreSQL clients.
 *
 * Error messages intentionally name invalid keys only, never their values, because
 * both the bot token and database URL contain secrets.
 */
export function loadConfig(env: RuntimeEnvironment = process.env): AppConfig {
  const parsed = environmentSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid application configuration: ${invalidKeys(parsed.error.issues)}`,
    );
  }

  return Object.freeze({
    botToken: parsed.data.BOT_TOKEN,
    databaseUrl: parsed.data.DATABASE_URL,
    logLevel: parsed.data.LOG_LEVEL,
    mode: parsed.data.APP_MODE,
  });
}
