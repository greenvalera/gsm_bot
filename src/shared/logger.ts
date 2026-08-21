import pino, { type DestinationStream, type Logger } from "pino";

/** Fields accepted by a log call. Anything not explicitly allowed is redacted. */
export type LogFields = Readonly<Record<string, unknown>>;

/** The single replacement value written in place of any non-diagnostic value. */
export const REDACTED = "[redacted]";

/** Longest retained string value; keeps every field bounded and greppable. */
const MAX_STRING_LENGTH = 120;

/**
 * Redaction is an allow list, not a deny list.
 *
 * A deny list has to predict every field name a future handler might log, and it
 * fails silently the first time it guesses wrong. Phase 1 logs only need bounded
 * identifiers and action kinds to diagnose an update, so every other key — raw
 * updates, coordinates, callback tokens, draft payloads, roster identity — is
 * replaced without ever being read.
 */
const ALLOWED_FIELDS: ReadonlySet<string> = new Set([
  // Bounded identifiers
  "chatId",
  "actorId",
  "targetId",
  "updateId",
  "messageId",
  "actionId",
  "draftId",
  "membershipId",
  "roundId",
  "jobId",
  // Bounded classifications chosen by our own code, never by Telegram input
  "actionKind",
  "callbackKind",
  "route",
  "command",
  "field",
  "event",
  "outcome",
  "reason",
  "status",
  "signal",
  // Bounded counters
  "revision",
  "expectedRevision",
  "attempt",
  "count",
  "page",
  "pageCount",
  "durationMs",
]);

/**
 * Shapes that must never survive even under an allowed key or inside a message.
 * Registered secrets cover the configured values; these patterns cover the ones
 * that arrive from somewhere else (a driver error, a nested cause, a stack).
 */
const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /\d{6,}:[A-Za-z0-9_-]{20,}/g,
  /postgres(?:ql)?:\/\/\S+/gi,
];

function scrubString(value: string, secrets: readonly string[]): string {
  let scrubbed = value;

  for (const secret of secrets) {
    if (scrubbed.includes(secret)) {
      scrubbed = scrubbed.split(secret).join(REDACTED);
    }
  }

  for (const pattern of SENSITIVE_PATTERNS) {
    scrubbed = scrubbed.replace(
      new RegExp(pattern.source, pattern.flags),
      REDACTED,
    );
  }

  return scrubbed.length > MAX_STRING_LENGTH
    ? `${scrubbed.slice(0, MAX_STRING_LENGTH)}...`
    : scrubbed;
}

/**
 * Allowed keys may carry scalars only. An object under an allowed key would be an
 * unbounded payload wearing a safe name, so it is redacted rather than walked.
 */
function safeScalar(
  value: unknown,
  secrets: readonly string[],
): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return scrubString(value, secrets);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : REDACTED;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return REDACTED;
}

function safeError(
  value: unknown,
  secrets: readonly string[],
): Record<string, unknown> | string {
  if (!(value instanceof Error)) {
    // A non-Error throw can be any object, including a raw Telegram payload.
    return REDACTED;
  }

  const shape: Record<string, unknown> = {
    name: scrubString(value.name, secrets),
    message: scrubString(value.message, secrets),
  };
  const code: unknown = (value as { code?: unknown }).code;
  if (typeof code === "string" || typeof code === "number") {
    shape.code = safeScalar(code, secrets);
  }

  return shape;
}

function sanitizeFields(
  fields: LogFields,
  secrets: readonly string[],
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (key === "err" || key === "error") {
      sanitized.err = safeError(value, secrets);
      continue;
    }
    sanitized[key] = ALLOWED_FIELDS.has(key)
      ? safeScalar(value, secrets)
      : REDACTED;
  }

  return sanitized;
}

type LogLevelName = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export interface SafeLogger {
  fatal(message: string): void;
  fatal(fields: LogFields, message: string): void;
  error(message: string): void;
  error(fields: LogFields, message: string): void;
  warn(message: string): void;
  warn(fields: LogFields, message: string): void;
  info(message: string): void;
  info(fields: LogFields, message: string): void;
  debug(message: string): void;
  debug(fields: LogFields, message: string): void;
  trace(message: string): void;
  trace(fields: LogFields, message: string): void;
  child(bindings: LogFields): SafeLogger;
  readonly level: string;
}

function wrap(logger: Logger, secrets: readonly string[]): SafeLogger {
  const emit = (
    level: LogLevelName,
    fieldsOrMessage: LogFields | string,
    message?: string,
  ): void => {
    if (typeof fieldsOrMessage === "string") {
      logger[level](scrubString(fieldsOrMessage, secrets));
      return;
    }
    logger[level](
      sanitizeFields(fieldsOrMessage, secrets),
      scrubString(message ?? "", secrets),
    );
  };

  return {
    fatal: (fieldsOrMessage: LogFields | string, message?: string) =>
      emit("fatal", fieldsOrMessage, message),
    error: (fieldsOrMessage: LogFields | string, message?: string) =>
      emit("error", fieldsOrMessage, message),
    warn: (fieldsOrMessage: LogFields | string, message?: string) =>
      emit("warn", fieldsOrMessage, message),
    info: (fieldsOrMessage: LogFields | string, message?: string) =>
      emit("info", fieldsOrMessage, message),
    debug: (fieldsOrMessage: LogFields | string, message?: string) =>
      emit("debug", fieldsOrMessage, message),
    trace: (fieldsOrMessage: LogFields | string, message?: string) =>
      emit("trace", fieldsOrMessage, message),
    child: (bindings: LogFields) =>
      wrap(logger.child(sanitizeFields(bindings, secrets)), secrets),
    get level() {
      return logger.level;
    },
  };
}

export interface CreateLoggerOptions {
  level?: string;
  /** Configured secret values scrubbed from every string, including messages. */
  secrets?: readonly string[];
  /** Test seam; production writes to stdout. */
  destination?: DestinationStream;
}

/**
 * Builds the structured logger used by the running bot.
 *
 * `base: null` drops `pid`/`hostname` so a log line carries only what the caller
 * asked for and what this module already vouched for.
 */
export function createLogger(options: CreateLoggerOptions = {}): SafeLogger {
  const secrets = (options.secrets ?? []).filter(
    (secret) => typeof secret === "string" && secret.trim().length >= 4,
  );
  const pinoOptions: pino.LoggerOptions = {
    level: options.level ?? "info",
    base: null,
  };
  const logger =
    options.destination === undefined
      ? pino(pinoOptions)
      : pino(pinoOptions, options.destination);

  return wrap(logger, secrets);
}
