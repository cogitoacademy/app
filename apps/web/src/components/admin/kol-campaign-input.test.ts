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

test("internal campaigns allow zero commission and optional partner details", () => {
  const { input } = parseCampaignDraft({
    ...draft,
    campaignType: "internal",
    percent: "0",
  });
  expect(input?.campaignType).toBe("internal");
  expect(input?.partnerName).toBeNull();
  expect(input?.bankAccountNumber).toBeNull();
  expect(
    parseCampaignDraft({ ...draft, campaignType: "kol", percent: "0" }).input,
  ).toBeNull();
});

test("partner details are trimmed and account numbers retain leading zeroes", () => {
  const { input } = parseCampaignDraft({
    ...draft,
    partnerName: " Alya ",
    bankName: " BCA ",
    bankAccountNumber: " 0012345678 ",
    bankAccountHolderName: " Alya Putri ",
    notes: " November launch ",
  });
  expect(input).toMatchObject({
    partnerName: "Alya",
    bankName: "BCA",
    bankAccountNumber: "0012345678",
    bankAccountHolderName: "Alya Putri",
    notes: "November launch",
  });
  for (const field of [
    "partnerName",
    "bankName",
    "bankAccountNumber",
    "bankAccountHolderName",
    "notes",
  ] as const) {
    const result = parseCampaignDraft({
      ...draft,
      [field]: "x".repeat(field === "notes" ? 601 : 101),
    });
    expect(result.input).toBeNull();
    expect(result.errors[field]).toBeTruthy();
  }
});

test("campaign Marks accept zero and custom amounts but reject missing or invalid values", () => {
  for (const amount of ["0", "20", "50", "100000"]) {
    expect(
      parseCampaignDraft({ ...draft, welcomeMarks: amount }).input
        ?.welcomeMarks,
    ).toBe(Number(amount));
  }
  for (const amount of ["", " ", "-1", "1.5", "100001", "nope"]) {
    const result = parseCampaignDraft({ ...draft, welcomeMarks: amount });
    expect(result.input).toBeNull();
    expect(result.errors.welcomeMarks).toBeTruthy();
  }
});
