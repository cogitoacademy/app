import { expect, test } from "bun:test";
import {
  officeActionAppUrl,
  officeEscalationDeadline,
} from "./office-contract";

test("action links use existing app routes, with blog record context", () => {
  for (const [action, path] of [
    ["referrals.createKolCampaign", "admin-referrals"],
    ["referrals.retireKolCampaign", "admin-referrals"],
    ["blog.saveDraft", "admin-blog/article-1"],
    ["blog.publish", "admin-blog/article-1"],
    ["faq.saveDraft", "faq"],
    ["faq.publish", "faq"],
    ["activities.saveDraft", "activities"],
    ["activities.publish", "activities"],
    ["calendar.saveDraft", "calendar"],
    ["calendar.publish", "calendar"],
    ["knowledge.addDraft", "knowledge-bank"],
  ])
    expect(officeActionAppUrl(action!, "article-1")).toBe(
      `https://app.cogitoacademy.id/${path}`,
    );
});

test("resolved booking states never create overdue Office escalations", () => {
  const meta = { overriddenAt: "2026-11-02T02:00:00Z" };
  const now = new Date("2026-11-12T10:00:00Z");
  expect(officeEscalationDeadline("scheduled", meta, now)).toBeInstanceOf(Date);
  for (const state of ["completed", "cancelled", "late_cancelled", "expired"])
    expect(officeEscalationDeadline(state, meta, now)).toBeNull();
  for (const bad of [
    null,
    {},
    { overriddenAt: "bad" },
    { overriddenAt: "2099-01-01" },
  ])
    expect(officeEscalationDeadline("scheduled", bad, now)).toBeNull();
});
