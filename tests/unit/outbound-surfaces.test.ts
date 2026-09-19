import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  discoverSurfaces,
  outboundSurfaces,
  verifyInventory,
  productionSources,
  verifyNonProduction,
  verifyEvidenceRuns,
} from "../fixtures/outbound-surfaces.js";

describe("outbound source inventory", () => {
  if (process.env.OUTBOUND_EVIDENCE_REPORTS) {
    it("requires fresh passing executed evidence for both locales at every site", () => {
      const reports = process.env
        .OUTBOUND_EVIDENCE_REPORTS!.split(";")
        .map((file) => JSON.parse(readFileSync(file, "utf8")));
      expect(verifyEvidenceRuns(outboundSurfaces, reports)).toEqual([]);
    });
  }
  it("does not accept a successful run containing an unrelated named test as executed branch coverage", () => {
    const site = outboundSurfaces.find(
      (site) =>
        site.id ===
        "src/telegram/roster-handlers.ts#handleRosterAddCommand:reply:1",
    )!;
    expect(
      verifyEvidenceRuns(
        [site],
        [
          {
            success: true,
            numPendingTests: 0,
            testResults: [
              {
                name: site.evidence!.file,
                assertionResults: [
                  {
                    title: "preserves safe add and duplicate identity in en",
                    status: "passed",
                    meta: {
                      outboundEvidence: {
                        sites: [site.id],
                        locales: ["en", "uk"],
                        sourceHashes: {},
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      ),
    ).toContain(`unregistered-case-evidence: ${site.id}`);
  });
  it("proves legacy rows have no production references and dominated setup fallbacks have no reachable caller", () => {
    const sources = productionSources();
    const exempt = outboundSurfaces.filter((site) => site.nonProduction);
    expect(exempt).toHaveLength(13);
    for (const site of exempt) {
      expect(verifyNonProduction(sources, site), site.id).toBe(true);
      expect(site.evidence).toBeUndefined();
    }
    const legacy = exempt.find(
      (site) => site.nonProduction === "legacy-keyboard-row",
    )!;
    expect(
      verifyNonProduction(
        {
          ...sources,
          "src/new-route.ts": "api.sendMessage(chatId, PLANNING_BOOKING_ROWS);",
        },
        legacy,
      ),
    ).toBe(false);
    const fallback = exempt.find(
      (site) => site.nonProduction === "dominated-setup-fallback",
    )!;
    expect(
      verifyNonProduction(
        {
          ...sources,
          "src/new-route.ts":
            'import * as keyboard from "./telegram/keyboards.js"; api.sendMessage(chat, keyboard[name]);',
        },
        legacy,
      ),
    ).toBe(false);
    expect(
      verifyNonProduction(
        {
          ...sources,
          "src/new-route.ts":
            "dispatchSetupCallback(ctx, deps, context, foreignKind, now);",
        },
        fallback,
      ),
    ).toBe(false);
    expect(
      verifyNonProduction(
        {
          ...sources,
          [fallback.file]: sources[fallback.file]!.replace(
            'if (setupTarget.success && setupTarget.data.action === "save")',
            "if (false)",
          ),
        },
        fallback,
      ),
    ).toBe(false);
    expect(
      verifyNonProduction(sources, {
        ...fallback,
        locator: "dispatchSetupCallback:reply:1",
      }),
    ).toBe(false);
  });
  it("reconciles production output sites and catalog paths", () => {
    expect(verifyInventory(productionSources(), outboundSurfaces)).toEqual([]);
  });
  it("validates case-scoped executable site registrations and rejects residual branch evidence", () => {
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
  it("rejects an existing unrelated test even when the correct site is registered elsewhere in that file", () => {
    const id = "src/telegram/roster-handlers.ts#handleRosterAddCommand:reply:1";
    const site = outboundSurfaces.find((site) => site.id === id)!;
    expect(site.evidence?.case).toBe(
      "gives corrective reply guidance in %s without adding members",
    );
    const changed = outboundSurfaces.map((row) =>
      row.id === id
        ? {
            ...row,
            evidence: {
              ...site.evidence!,
              case: "preserves safe add and duplicate identity in %s",
            },
          }
        : row,
    );
    expect(verifyInventory(productionSources(), changed, true)).toContain(
      `missing-bilingual-evidence: ${id}`,
    );
  });
  it("keeps a declared residual visible even when the case registration exists", () => {
    const id = "src/telegram/roster-handlers.ts#handleRosterAddCommand:reply:1";
    const changed = outboundSurfaces.map((site) =>
      site.id === id ? { ...site, residual: "branch not proven" } : site,
    );
    expect(verifyInventory(productionSources(), changed, true)).toContain(
      `pending-branch-evidence: ${id}: branch not proven`,
    );
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
