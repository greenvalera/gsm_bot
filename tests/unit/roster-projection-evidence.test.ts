import { recordOutboundEvidence } from "../helpers/outbound-evidence.js";
import { describe, expect, it } from "vitest";
import { renderMessage } from "../../src/shared/i18n/index.js";
import {
  localizedMemberLabel,
  localizedPlainMemberLabel,
  memberLabel,
  plainMemberLabel,
  paginateRoster,
  renderRosterPage,
  renderRoster,
  renderRosterLoading,
  renderRosterFailure,
  renderRemovalConfirmation,
} from "../../src/telegram/roster-renderers.js";
import {
  rosterRemovalKeyboard,
  rosterRetryKeyboard,
  rosterRemovalConfirmationKeyboard,
} from "../../src/telegram/keyboards.js";

describe.each(["en", "uk"] as const)(
  "roster projection evidence in %s",
  (locale) => {
    it("renders empty and paginated roster states with safe identities and controls", () => {
      const phrase = (key: Parameters<typeof renderMessage>[1]) =>
        renderMessage(locale, key, undefined as never);
      const member = {
        membershipId: "member",
        telegramUserId: 123456789n,
        firstName: "Оля <&>",
        lastName: null,
        username: null,
      };
      const unnamed = { ...member, firstName: null };
      const masked = renderMessage(locale, "roster.fallback", {
        suffix: "6789",
      });
      expect(localizedPlainMemberLabel(unnamed, locale)).toBe(masked);
      expect(localizedMemberLabel(unnamed, locale)).toBe(masked);
      expect(plainMemberLabel(unnamed)).toBe(
        renderMessage("en", "roster.fallback", { suffix: "6789" }),
      );
      expect(memberLabel(member)).toBe("Оля &lt;&amp;&gt;");
      expect(
        localizedPlainMemberLabel({ ...member, username: "guitar" }, locale),
      ).toBe("Оля <&> — @guitar");
      expect(
        localizedPlainMemberLabel({ ...unnamed, username: "guitar" }, locale),
      ).toBe("@guitar");
      expect(renderRosterPage(paginateRoster([]), locale).text).toBe(
        `${phrase("roster.empty")}\n${phrase("roster.addHint")}`,
      );
      const members = Array.from({ length: 41 }, (_, index) => ({
        ...member,
        membershipId: `member-${index}`,
        telegramUserId: BigInt(123456789 + index),
      }));
      const middle = paginateRoster(members, 1);
      const text = renderRosterPage(middle, locale).text;
      expect(text).toContain(phrase("roster.title"));
      expect(text).toContain("• Оля &lt;&amp;&gt;");
      expect(text).toContain(renderMessage(locale, "roster.page", middle));
      expect(text).not.toContain("123456789");
      expect(renderRoster([unnamed], 0, locale).text).toBe(
        `${phrase("roster.title")}\n• ${masked}`,
      );
      expect(renderRosterLoading(locale).text).toBe(
        `${phrase("roster.title")}\n${phrase("roster.loading")}`,
      );
      expect(renderRosterFailure(locale).text).toBe(phrase("roster.failure"));
      expect(renderRemovalConfirmation(member, locale).text).toBe(
        `${renderMessage(locale, "roster.removeTitle", { label: "Оля &lt;&amp;&gt;" })}\n${phrase("roster.consequence")}`,
      );
      expect(
        rosterRemovalKeyboard(
          ["remove-1", "remove-2"],
          { previousToken: "previous", nextToken: "next" },
          locale,
        ).inline_keyboard,
      ).toEqual([
        [{ text: phrase("roster.remove"), callback_data: "remove-1" }],
        [{ text: phrase("roster.remove"), callback_data: "remove-2" }],
        [
          { text: phrase("button.previous"), callback_data: "previous" },
          { text: phrase("button.next"), callback_data: "next" },
        ],
      ]);
      expect(rosterRetryKeyboard("retry", locale).inline_keyboard).toEqual([
        [{ text: phrase("button.retry"), callback_data: "retry" }],
      ]);
      expect(
        rosterRemovalConfirmationKeyboard("remove", "keep", locale)
          .inline_keyboard,
      ).toEqual([
        [{ text: phrase("roster.remove"), callback_data: "remove" }],
        [{ text: phrase("roster.keep"), callback_data: "keep" }],
      ]);

      recordOutboundEvidence(
        [
          "src/telegram/keyboards.ts#module:factory.rosterRemovalKeyboard:1",
          "src/telegram/keyboards.ts#rosterRemovalKeyboard:keyboard.text:1",
          "src/telegram/keyboards.ts#rosterRemovalKeyboard:keyboard.text:2",
          "src/telegram/keyboards.ts#rosterRemovalKeyboard:keyboard.text:3",
          "src/telegram/keyboards.ts#module:factory.rosterRetryKeyboard:1",
          "src/telegram/keyboards.ts#rosterRetryKeyboard:keyboard.text:1",
          "src/telegram/keyboards.ts#module:factory.rosterRemovalConfirmationKeyboard:1",
          "src/telegram/keyboards.ts#rosterRemovalConfirmationKeyboard:keyboard.text:1",
          "src/telegram/keyboards.ts#rosterRemovalConfirmationKeyboard:keyboard.text:2",
          "src/telegram/roster-renderers.ts#module:factory.plainMemberLabel:1",
          "src/telegram/roster-renderers.ts#module:factory.localizedPlainMemberLabel:1",
          "src/telegram/roster-renderers.ts#module:factory.memberLabel:1",
          "src/telegram/roster-renderers.ts#module:factory.localizedMemberLabel:1",
          "src/telegram/roster-renderers.ts#module:factory.renderRosterPage:1",
          "src/telegram/roster-renderers.ts#renderRosterPage:text:1",
          "src/telegram/roster-renderers.ts#renderRosterPage:text:2",
          "src/telegram/roster-renderers.ts#module:factory.renderRoster:1",
          "src/telegram/roster-renderers.ts#module:factory.renderRosterLoading:1",
          "src/telegram/roster-renderers.ts#renderRosterLoading:text:1",
          "src/telegram/roster-renderers.ts#module:factory.renderRosterFailure:1",
          "src/telegram/roster-renderers.ts#renderRosterFailure:text:1",
          "src/telegram/roster-renderers.ts#module:factory.renderRemovalConfirmation:1",
          "src/telegram/roster-renderers.ts#renderRemovalConfirmation:text:1",
        ],
        locale,
      );
    });
  },
);
