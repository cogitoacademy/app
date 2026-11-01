import { expect, test } from "bun:test";
import { getStudentResourceFileInput } from "../../modules/content/content.types";

test("student resource file input requires a non-empty resource id", () => {
  expect(
    getStudentResourceFileInput.parse({ resourceId: "resource-123" }),
  ).toEqual({
    resourceId: "resource-123",
  });
  expect(() => getStudentResourceFileInput.parse({ resourceId: "" })).toThrow();
});
