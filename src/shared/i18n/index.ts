/** Presentation locale is always explicit, never inferred from Telegram users. */
export type Locale = "en" | "uk";

export type MessageParameters = {
  "language.select": undefined;
  "language.row": undefined;
  "language.changed": undefined;
  "language.entry": undefined;
  "language.english": undefined;
  "language.ukrainian": undefined;
  "timezone.title": undefined;
  "timezone.intro": undefined;
};

export type MessageCatalog = {
  readonly [Key in keyof MessageParameters]: (
    params: MessageParameters[Key],
  ) => string;
};

const en = {
  "language.select": () => "Choose this chat's language.",
  "language.row": () => "Language: English",
  "language.changed": () => "Language changed to English.",
  "language.entry": () => "Мова / Language",
  "language.english": () => "English",
  "language.ukrainian": () => "Українська",
  "timezone.title": () => "Time zone",
  "timezone.intro": () =>
    "Reply to this message with a location to choose this chat's time zone.",
} satisfies MessageCatalog;

const uk = {
  "language.select": () => "Обери мову цього чату.",
  "language.row": () => "Мова: Українська",
  "language.changed": () => "Мову змінено на українську.",
  "language.entry": () => "Мова / Language",
  "language.english": () => "English",
  "language.ukrainian": () => "Українська",
  "timezone.title": () => "Часовий пояс",
  "timezone.intro": () =>
    "Надішли геолокацію у відповідь на це повідомлення, щоб обрати часовий пояс цього чату.",
} satisfies MessageCatalog;

const catalogs: Record<Locale, MessageCatalog> = { en, uk };

export function renderMessage<Key extends keyof MessageParameters>(
  locale: Locale,
  key: Key,
  params: MessageParameters[Key],
): string {
  return catalogs[locale][key](params);
}
