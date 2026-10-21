import { describe, expect, test } from "bun:test";
import {
  assertAllocationCanBeFunded,
  planAllocationRelease,
  planAllocationSpend,
  remainingAllocationMarks,
} from "../../modules/class-enrollment/class-enrollment.funding";

const funded = {
  state: "funded" as const,
  rateMarks: 22,
  fundedMarks: 22,
  spentMarks: 0,
  releasedMarks: 0,
};

describe("class enrollment allocation funding [REQ-ENROLL-01..04]", () => {
  test("a hold funds one session allocation exactly once", () => {
    assertAllocationCanBeFunded({
      ...funded,
      state: "checkout_reserved",
      fundedMarks: 0,
    });
    assertAllocationCanBeFunded({
      ...funded,
      state: "unfunded_reserved",
      fundedMarks: 0,
    });
    expect(() => assertAllocationCanBeFunded(funded)).toThrow();
    expect(() =>
      assertAllocationCanBeFunded({
        ...funded,
        state: "released",
        fundedMarks: 0,
      }),
    ).toThrow();
  });

  test("spend is limited to funded remainder and ignores unpaid reservations", () => {
    expect(remainingAllocationMarks(funded)).toBe(22);
    expect(planAllocationSpend(funded, 20)).toMatchObject({
      spentMarks: 20,
      remainingMarks: 2,
    });
    expect(() => planAllocationSpend(funded, 23)).toThrow();
    expect(() =>
      planAllocationSpend(
        {
          ...funded,
          state: "unfunded_reserved",
          fundedMarks: 0,
        },
        1,
      ),
    ).toThrow();
    expect(() =>
      planAllocationSpend({ ...funded, state: "released" }, 1),
    ).toThrow();
  });

  test("spent plus released never exceeds funded Marks", () => {
    const spent = planAllocationSpend(funded, 8);
    const released = planAllocationRelease(spent);
    expect(released).toMatchObject({
      state: "released",
      fundedMarks: 22,
      spentMarks: 8,
      releasedMarks: 14,
      remainingMarks: 0,
    });
    expect(released.spentMarks + released.releasedMarks).toBe(
      released.fundedMarks,
    );
    expect(() => planAllocationRelease(released)).toThrow();
  });

  test("an unpaid half reservation is released with no funded residual", () => {
    const released = planAllocationRelease({
      ...funded,
      state: "unfunded_reserved",
      fundedMarks: 0,
    });
    expect(released).toMatchObject({
      state: "released",
      fundedMarks: 0,
      spentMarks: 0,
      releasedMarks: 0,
      remainingMarks: 0,
    });
    expect(() =>
      planAllocationRelease({
        ...funded,
        state: "unfunded_reserved",
      }),
    ).toThrow();
  });

  test("corrupt or over-released balances fail closed", () => {
    expect(() =>
      remainingAllocationMarks({ ...funded, spentMarks: 20, releasedMarks: 3 }),
    ).toThrow();
    expect(() =>
      remainingAllocationMarks({ ...funded, fundedMarks: 23 }),
    ).toThrow();
  });
});
