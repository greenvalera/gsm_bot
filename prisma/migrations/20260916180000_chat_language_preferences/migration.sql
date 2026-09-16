-- Independent of configuration: selection may precede completed setup.
CREATE TABLE "chat_language_preferences" (
    "chat_id" BIGINT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "explicitly_selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "chat_language_preferences_pkey" PRIMARY KEY ("chat_id"),
    CONSTRAINT "chat_language_preferences_locale_check" CHECK ("locale" IN ('en', 'uk'))
);
