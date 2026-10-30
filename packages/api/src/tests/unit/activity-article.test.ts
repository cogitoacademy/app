import { describe, expect, test } from "bun:test";
import { saveActivityInput } from "../../modules/activity/activity.types";
const value = {
  titleEn: "Community discussion",
  titleId: null,
  descriptionEn: "A discussion",
  descriptionId: null,
  coverUrl: "https://example.com/cover.jpg",
  location: "Online",
  startAt: "2026-11-14T03:00:00Z",
  endAt: "2026-11-14T05:00:00Z",
  state: "draft",
  bodyEn: {
    type: "doc",
    blocks: [
      {
        type: "paragraph",
        content: [
          { text: "Register here", href: "https://example.com/register" },
        ],
      },
    ],
  },
  bodyId: null,
};
describe("Activity article validation", () => {
  test("accepts rich text registration links without a separate registration field", () => {
    expect(saveActivityInput.safeParse(value).success).toBe(true);
    expect(
      saveActivityInput.safeParse({
        ...value,
        registrationLink: "https://example.com",
      }).success,
    ).toBe(false);
  });
  test("requires English and a valid schedule", () => {
    expect(
      saveActivityInput.safeParse({ ...value, titleEn: " " }).success,
    ).toBe(false);
    expect(
      saveActivityInput.safeParse({ ...value, endAt: "2026-11-13T05:00:00Z" })
        .success,
    ).toBe(false);
  });
  test("requires optimistic version for an update", () => {
    expect(
      saveActivityInput.safeParse({ ...value, id: "article" }).success,
    ).toBe(false);
    expect(
      saveActivityInput.safeParse({
        ...value,
        id: "article",
        expectedVersion: 1,
      }).success,
    ).toBe(true);
  });
  test("rejects unsafe rich text links and image schemes", () => {
    expect(
      saveActivityInput.safeParse({ ...value, coverUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
    expect(
      saveActivityInput.safeParse({
        ...value,
        bodyEn: {
          type: "doc",
          blocks: [
            {
              type: "paragraph",
              content: [{ text: "bad", href: "javascript:alert(1)" }],
            },
          ],
        },
      }).success,
    ).toBe(false);
  });
});
