export type EnrollmentAllocationState =
  | "checkout_reserved"
  | "unfunded_reserved"
  | "funded"
  | "released";

export type EnrollmentAllocationFunding = {
  state: EnrollmentAllocationState;
  rateMarks: number;
  fundedMarks: number;
  spentMarks: number;
  releasedMarks: number;
};

export class EnrollmentFundingInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnrollmentFundingInvariantError";
  }
}

export function remainingAllocationMarks(
  allocation: EnrollmentAllocationFunding,
) {
  const values = [
    allocation.rateMarks,
    allocation.fundedMarks,
    allocation.spentMarks,
    allocation.releasedMarks,
  ];
  if (
    values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    allocation.rateMarks < 1 ||
    allocation.fundedMarks > allocation.rateMarks ||
    allocation.spentMarks + allocation.releasedMarks > allocation.fundedMarks
  ) {
    throw new EnrollmentFundingInvariantError(
      "Class allocation Marks accounting is inconsistent",
    );
  }
  return (
    allocation.fundedMarks - allocation.spentMarks - allocation.releasedMarks
  );
}

export function assertAllocationCanBeFunded(
  allocation: EnrollmentAllocationFunding,
) {
  if (
    (allocation.state !== "checkout_reserved" &&
      allocation.state !== "unfunded_reserved") ||
    allocation.fundedMarks !== 0 ||
    allocation.spentMarks !== 0 ||
    allocation.releasedMarks !== 0
  ) {
    throw new EnrollmentFundingInvariantError(
      "Only an unfunded active reservation can be funded",
    );
  }
  remainingAllocationMarks(allocation);
}

export function planAllocationSpend(
  allocation: EnrollmentAllocationFunding,
  amountMarks: number,
) {
  if (allocation.state !== "funded") {
    throw new EnrollmentFundingInvariantError(
      "Only a funded class allocation can be spent",
    );
  }
  const remainingMarks = remainingAllocationMarks(allocation);
  if (
    !Number.isSafeInteger(amountMarks) ||
    amountMarks < 1 ||
    amountMarks > remainingMarks
  ) {
    throw new EnrollmentFundingInvariantError(
      "Class allocation spend exceeds its funded remainder",
    );
  }
  return {
    ...allocation,
    spentMarks: allocation.spentMarks + amountMarks,
    remainingMarks: remainingMarks - amountMarks,
  };
}

export function planAllocationRelease(allocation: EnrollmentAllocationFunding) {
  if (allocation.state === "released") {
    throw new EnrollmentFundingInvariantError(
      "A released class allocation cannot be released again",
    );
  }
  const remainingMarks = remainingAllocationMarks(allocation);
  if (
    allocation.state !== "funded" &&
    (allocation.fundedMarks !== 0 ||
      allocation.spentMarks !== 0 ||
      allocation.releasedMarks !== 0)
  ) {
    throw new EnrollmentFundingInvariantError(
      "An unfunded class allocation cannot contain wallet Marks",
    );
  }
  return {
    state: "released" as const,
    rateMarks: allocation.rateMarks,
    fundedMarks: allocation.fundedMarks,
    spentMarks: allocation.spentMarks,
    releasedMarks: allocation.releasedMarks + remainingMarks,
    remainingMarks: 0,
  };
}
