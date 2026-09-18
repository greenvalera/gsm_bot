import { describe, expect, it } from "vitest";
import {
  discoverSurfaces,
  outboundSurfaces,
  verifyInventory,
  productionSources,
} from "../fixtures/outbound-surfaces.js";

describe("outbound source inventory", () => {
  it("reconciles production output sites and catalog paths", () => {
    expect(verifyInventory(productionSources(), outboundSurfaces)).toEqual([]);
  });
  it("validates concrete test references and reports residual branch evidence without counting it as covered", () => {
    const errors = verifyInventory(productionSources(), outboundSurfaces, true);
    expect(errors).toEqual([]);
    expect(
      outboundSurfaces
        .filter((site) => site.file.endsWith("migration-handler.ts"))
        .every(
          (site) =>
            site.evidence?.case ===
              "refuses stale old-chat callbacks in the destination's current uk/en/uk locale without mutation" &&
            !site.residual,
        ),
    ).toBe(true);
  });
  it.each([
    ["sendMessage", 'api.sendMessage(1, "Untranslated prose")'],
    [
      "reply wrapper",
      'function reply(ctx) { return ctx.reply("Untranslated prose"); }',
    ],
    [
      "edit wrapper",
      'function edit(ctx) { return ctx.editMessageText("Untranslated prose"); }',
    ],
    ["keyboard", 'new InlineKeyboard().text("Untranslated prose", "token")'],
    ["alert", 'ctx.answerCallbackQuery({ text: "Untranslated prose" })'],
  ])("rejects an uncovered %s", (_, source) => {
    expect(verifyInventory({ "src/synthetic.ts": source }, [])).toContainEqual(
      expect.stringContaining("uncovered-surface"),
    );
  });
  it("detects copy added to an already inventoried renderer", () => {
    const clean = {
      "src/synthetic.ts":
        'function renderCard() { return { text: renderMessage(locale, "setup.saved", undefined) }; }',
    };
    const sites = discoverSurfaces(clean);
    expect(sites.length).toBeGreaterThan(0);
    const changed = {
      "src/synthetic.ts": clean["src/synthetic.ts"].replace(
        'renderMessage(locale, "setup.saved", undefined)',
        'renderMessage(locale, "setup.saved", undefined) + " Untracked prose"',
      ),
    };
    expect(verifyInventory(changed, sites)).toContainEqual(
      expect.stringContaining("unmapped-expression"),
    );
  });
  it("follows imported wrappers and local helpers when copy changes", () => {
    const clean = {
      "src/synthetic.ts":
        'import { label as imported } from "./label.js"; function reply(ctx) { return ctx.reply(imported()); }',
      "src/label.ts":
        'export function label() { return renderMessage(locale, "setup.saved", undefined); }',
    };
    const inventory = discoverSurfaces(clean);
    expect(inventory[0]?.keys).toContain("setup.saved");
    expect(verifyInventory(clean, inventory)).toEqual([]);
    expect(
      verifyInventory(
        {
          ...clean,
          "src/label.ts": clean["src/label.ts"].replace(
            'renderMessage(locale, "setup.saved", undefined)',
            '"Untranslated helper"',
          ),
        },
        inventory,
      ),
    ).toContainEqual(expect.stringContaining("unmapped-dependency"));
  });
  it("rejects stale sites, missing keys and nonexistent test cases", () => {
    const source = {
      "src/synthetic.ts":
        'ctx.reply(renderMessage(locale, "setup.saved", undefined))',
    };
    const [site] = discoverSurfaces(source);
    if (!site) throw new Error("missing synthetic sink");
    expect(verifyInventory({ "src/synthetic.ts": "" }, [site])).toContainEqual(
      expect.stringContaining("stale-surface"),
    );
    expect(
      verifyInventory(source, [{ ...site, keys: ["missing.key"] }]),
    ).toContainEqual(expect.stringContaining("missing-key"));
    expect(
      verifyInventory(
        source,
        [
          {
            ...site,
            evidence: {
              file: "tests/unit/i18n.test.ts",
              case: "nonexistent case",
              locales: ["en", "uk"],
            },
          },
        ],
        true,
      ),
    ).toContainEqual(expect.stringContaining("missing-bilingual-evidence"));
  });
});
