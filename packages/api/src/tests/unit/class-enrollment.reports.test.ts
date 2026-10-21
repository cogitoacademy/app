import { expect, test } from "bun:test";
import { classSessionSettlementAmounts } from "../../modules/class-enrollment/class-enrollment.reports";

function allocation(
  id: string,
  state: "funded" | "released" | "unfunded_reserved",
  marks: { rate: number; funded: number; spent?: number; released?: number },
) {
  return {
    id,
    studentId: `student-${id}`,
    fundingSourceReference: `source-${id}`,
    state,
    rateMarks: marks.rate,
    fundedMarks: marks.funded,
    spentMarks: marks.spent ?? 0,
    releasedMarks: marks.released ?? 0,
  } as const;
}

test("settlement consumes only the remaining funded allocation balance", () => {
  const plan = classSessionSettlementAmounts([
    allocation("partial", "funded", {
      rate: 22,
      funded: 22,
      spent: 5,
      released: 3,
    }),
    allocation("fully-spent", "funded", {
      rate: 25,
      funded: 25,
      spent: 25,
    }),
    allocation("released", "released", {
      rate: 20,
      funded: 20,
      released: 20,
    }),
    allocation("unfunded", "unfunded_reserved", { rate: 20, funded: 0 }),
  ]);

  expect(plan.map(({ allocation: row, amount }) => [row.id, amount])).toEqual([
    ["partial", 14],
  ]);
});

test("zero residual funded seats do not make a session chargeable", () => {
  expect(
    classSessionSettlementAmounts([
      allocation("spent", "funded", { rate: 25, funded: 25, spent: 25 }),
      allocation("released", "released", {
        rate: 25,
        funded: 25,
        released: 25,
      }),
    ]),
  ).toEqual([]);
});
