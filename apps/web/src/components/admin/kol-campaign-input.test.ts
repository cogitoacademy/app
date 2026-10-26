import { expect, test } from "bun:test";
import { emptyCampaignDraft, parseCampaignDraft } from "./kol-campaign-input";

const draft = {
  ...emptyCampaignDraft,
  name: " Demo ",
  code: "demo2026",
  activationAt: "2030-01-01T09:15",
  expiresAt: "2030-02-01T10:30",
  percent: "12.34",
};
test("campaign input normalizes code and converts WIB and exact human percentage", () => {
  const { input } = parseCampaignDraft(draft);
  expect(input?.code).toBe("DEMO2026");
  expect(input?.name).toBe("Demo");
  expect(input?.activationAt?.toISOString()).toBe("2030-01-01T02:15:00.000Z");
  expect(input?.expiresAt.toISOString()).toBe("2030-02-01T03:30:00.000Z");
  expect(input?.percentBps).toBe(1234);
  expect(input?.attributionWindowDays).toBe(90);
});
test("campaign input rejects precision, bounds, missing dates and zero commission", () => {
  for (const patch of [
    { percent: "1.001" },
    { percent: "100.01" },
    { percent: "0" },
    { expiresAt: "" },
    { expiresAt: draft.activationAt },
    { code: "bad-code" },
    { attributionWindowDays: "366" },
    { flatAmountIdr: "1.5" },
    { flatAmountIdr: "" },
  ]) {
    expect(parseCampaignDraft({ ...draft, ...patch }).input).toBeNull();
  }
});
test("blank activation is omitted and expiry must be later than now", () => {
  expect(
    parseCampaignDraft({ ...draft, activationAt: "" }, new Date("2029-01-01"))
      .input?.activationAt,
  ).toBeUndefined();
  expect(
    parseCampaignDraft({ ...draft, activationAt: "" }, new Date("2031-01-01"))
      .errors.expiresAt,
  ).toBeTruthy();
  expect(
    parseCampaignDraft({ ...draft, percent: "0", flatAmountIdr: "25000" }).input
      ?.flatAmountIdr,
  ).toBe(25000);
});
