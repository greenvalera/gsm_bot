import { getCurrentTest } from "@vitest/runner";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Locale } from "../../src/shared/i18n/index.js";

/**
 * Called after the case's behavioral assertions. IDs belong to the named case
 * family (including its parameter rows), not merely to its source file.
 * JSON reporters retain this metadata, so a failed/unexecuted case cannot be
 * mistaken for a successful evidence run. This is an audited branch contract,
 * not automatic statement/branch instrumentation.
 */
export function recordOutboundEvidence(
  sites: readonly string[],
  locale: Locale | readonly Locale[],
) {
  const test = getCurrentTest();
  if (!test) throw new Error("Outbound evidence must run inside a test");
  if (!sites.length || new Set(sites).size !== sites.length)
    throw new Error("Expected distinct outbound site IDs");
  const locales = typeof locale === "string" ? [locale] : [...locale];
  if (
    !locales.length ||
    locales.some((value) => value !== "en" && value !== "uk")
  )
    throw new Error("Expected explicit output locales");
  const sourceHashes = Object.fromEntries(
    [
      test.file.filepath,
      ...new Set(sites.map((site) => site.split("#")[0]!)),
    ].map((file) => [
      file.replaceAll("\\", "/"),
      createHash("sha256")
        .update(readFileSync(file))
        .digest("hex")
        .slice(0, 20),
    ]),
  );
  Object.assign(test.meta, {
    outboundEvidence: { sites, locales, sourceHashes },
  });
}
