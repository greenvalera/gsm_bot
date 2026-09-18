import { describe, expect, it } from "vitest";
import { discoverSurfaces, outboundSurfaces, verifyInventory, productionSources } from "../fixtures/outbound-surfaces.js";

describe("outbound source inventory", () => {
  it("reconciles production output sites with catalog and bilingual evidence", () => {
    expect(verifyInventory(productionSources(), outboundSurfaces)).toEqual([]);
  });
  it.each([
    ['sendMessage', 'api.sendMessage(1, "Untranslated prose")'],
    ['reply wrapper', 'function reply(ctx) { return ctx.reply("Untranslated prose"); }'],
    ['edit wrapper', 'function edit(ctx) { return ctx.editMessageText("Untranslated prose"); }'],
    ['keyboard', 'new InlineKeyboard().text("Untranslated prose", "token")'],
    ['alert', 'ctx.answerCallbackQuery({ text: "Untranslated prose" })'],
  ])("rejects an uncovered %s", (_, source) => {
    expect(verifyInventory({ "src/synthetic.ts": source }, [])).toContainEqual(expect.stringContaining("uncovered-surface"));
  });
  it("detects copy added to an already inventoried renderer", () => {
    const clean = { "src/synthetic.ts": 'function renderCard() { return { text: renderMessage(locale, "setup.saved", undefined) }; }' };
    const sites = discoverSurfaces(clean);
    expect(sites.length).toBeGreaterThan(0);
    const changed = { "src/synthetic.ts": clean["src/synthetic.ts"].replace('renderMessage(locale, "setup.saved", undefined)', 'renderMessage(locale, "setup.saved", undefined) + " Untracked prose"') };
    expect(verifyInventory(changed, sites)).toContainEqual(expect.stringContaining("unmapped-expression"));
  });
});
