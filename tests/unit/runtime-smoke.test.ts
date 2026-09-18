import { describe, expect, it } from "vitest";
import { catalogs } from "../../src/shared/i18n/index.js";
import { verifyRuntime } from "../../src/shared/i18n/runtime-smoke.js";

describe("compiled bilingual runtime contract", () => {
  it("accepts both complete catalogs and Ukrainian Intl", () => {
    expect(() => verifyRuntime(catalogs)).not.toThrow();
  });
  it.each(["en", "uk"])("rejects a missing %s catalog", (locale) => {
    const broken = { ...catalogs, [locale]: undefined };
    expect(() => verifyRuntime(broken)).toThrow();
  });
  it("rejects empty and noncallable entries before rendering", () => {
    expect(() => verifyRuntime({ en: {}, uk: {} })).toThrow();
    expect(() => verifyRuntime({ en: { key: null }, uk: { key: null } })).toThrow();
  });
});
