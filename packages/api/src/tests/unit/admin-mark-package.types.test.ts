import { describe, expect, test } from "bun:test";
import {
  createMarkPackageInput,
  setMarkPackageActiveInput,
  updateMarkPackageInput,
} from "../../modules/admin-mark-package/admin-mark-package.types";

describe("admin mark package types", () => {
  test("accepts a create payload, trims strings, and defaults active state", () => {
    const result = createMarkPackageInput.safeParse({
      code: "  starter  ",
      name: "  Starter Pack  ",
      marks: 50,
      priceIdr: 312_500,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        code: "starter",
        name: "Starter Pack",
        marks: 50,
        priceIdr: 312_500,
        isActive: true,
      });
    }
  });

  test("validates lowercase slug codes and positive bounded values", () => {
    expect(
      createMarkPackageInput.safeParse({
        code: "Starter Pack",
        name: "Starter",
        marks: 50,
        priceIdr: 100_000,
      }).success,
    ).toBe(false);
    expect(
      createMarkPackageInput.safeParse({
        code: "starter",
        name: "Starter",
        marks: 0,
        priceIdr: 100_000,
      }).success,
    ).toBe(false);
    expect(
      createMarkPackageInput.safeParse({
        code: "starter",
        name: "Starter",
        marks: 50,
        priceIdr: 0,
      }).success,
    ).toBe(false);
  });

  test("accepts immutable-code updates and activation changes", () => {
    expect(
      updateMarkPackageInput.safeParse({
        id: "package-1",
        name: "Updated Starter",
        marks: 75,
        priceIdr: 450_000,
      }).success,
    ).toBe(true);
    expect(
      setMarkPackageActiveInput.safeParse({
        id: "package-1",
        isActive: false,
      }).success,
    ).toBe(true);
    expect(updateMarkPackageInput.safeParse({ id: "package-1" }).success).toBe(
      false,
    );
  });
});
