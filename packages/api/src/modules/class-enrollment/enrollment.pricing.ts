export type EnrollmentPlan = "full" | "half" | "single" | "masterclass";

export interface EnrollmentRateSnapshot {
  cohortFullRateMarks: number | null;
  cohortHalfRateMarks: number | null;
  cohortSingleRateMarks: number | null;
  masterclassRateMarks: number | null;
}

export interface EnrollmentSessionCandidate {
  id: string;
  sequenceNumber: number;
  startAt: Date;
  state: string;
}

export interface EnrollmentQuote {
  plan: EnrollmentPlan;
  selectedSessionIds: string[];
  sessionCount: number;
  firstRateMarks: number;
  secondRateMarks: number | null;
  firstInstallmentMarks: number;
  secondInstallmentMarks: number;
  totalMarks: number;
  allocations: {
    sessionId: string;
    ordinal: number;
    sequenceNumber: number;
    rateMarks: number;
    installmentOrdinal: 1 | 2;
  }[];
  installments: {
    ordinal: 1 | 2;
    rateMarks: number;
    sessionIds: string[];
    amountMarks: number;
    dueAt: Date | null;
  }[];
}

export class InvalidEnrollmentQuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEnrollmentQuoteError";
  }
}

function requireRate(value: number | null, label: string): number {
  if (!Number.isSafeInteger(value) || value! < 1) {
    throw new InvalidEnrollmentQuoteError(
      `The published class has no valid ${label} rate`,
    );
  }
  return value!;
}

function sortSessions(sessions: readonly EnrollmentSessionCandidate[]) {
  return sessions
    .filter((session) => session.state === "scheduled")
    .toSorted(
      (left, right) =>
        left.startAt.getTime() - right.startAt.getTime() ||
        left.sequenceNumber - right.sequenceNumber ||
        left.id.localeCompare(right.id),
    );
}

export function quoteClassEnrollment(input: {
  kind: "cohort" | "masterclass";
  plan: EnrollmentPlan;
  sessionId?: string;
  rates: EnrollmentRateSnapshot;
  sessions: readonly EnrollmentSessionCandidate[];
  now: Date;
}): EnrollmentQuote {
  const upcoming = sortSessions(input.sessions).filter(
    (session) => session.startAt > input.now,
  );
  if (upcoming.length === 0) {
    throw new InvalidEnrollmentQuoteError(
      "There are no upcoming scheduled sessions available to enroll in",
    );
  }

  if (input.kind === "masterclass") {
    if (input.plan !== "masterclass") {
      throw new InvalidEnrollmentQuoteError(
        "Choose the masterclass plan for this class",
      );
    }
    if (upcoming.length !== 1) {
      throw new InvalidEnrollmentQuoteError(
        "A masterclass must have exactly one upcoming scheduled session",
      );
    }
    if (input.sessionId && input.sessionId !== upcoming[0]!.id) {
      throw new InvalidEnrollmentQuoteError(
        "The selected session does not belong to this masterclass",
      );
    }
    const rate = requireRate(input.rates.masterclassRateMarks, "masterclass");
    return makeQuote("masterclass", [upcoming[0]!], rate, null, 1);
  }

  if (input.plan === "masterclass") {
    throw new InvalidEnrollmentQuoteError(
      "A cohort cannot use the masterclass plan",
    );
  }

  if (input.plan === "single") {
    if (!input.sessionId) {
      throw new InvalidEnrollmentQuoteError(
        "Choose one upcoming session for a single-session enrollment",
      );
    }
    const selected = upcoming.find((session) => session.id === input.sessionId);
    if (!selected) {
      throw new InvalidEnrollmentQuoteError(
        "The selected session is no longer available",
      );
    }
    const rate = requireRate(
      input.rates.cohortSingleRateMarks,
      "single-session",
    );
    return makeQuote("single", [selected], rate, null, 1);
  }

  if (input.sessionId) {
    throw new InvalidEnrollmentQuoteError(
      "Choose full or half for all remaining upcoming sessions",
    );
  }

  if (input.plan === "full") {
    const rate = requireRate(input.rates.cohortFullRateMarks, "full-plan");
    return makeQuote("full", upcoming, rate, null, upcoming.length);
  }

  const rate = requireRate(input.rates.cohortHalfRateMarks, "half-plan");
  const firstCount = Math.ceil(upcoming.length / 2);
  return makeQuote("half", upcoming, rate, rate, firstCount);
}

function makeQuote(
  plan: EnrollmentPlan,
  sessions: readonly EnrollmentSessionCandidate[],
  firstRateMarks: number,
  secondRateMarks: number | null,
  firstCount: number,
): EnrollmentQuote {
  const firstSessions = sessions.slice(0, firstCount);
  const secondSessions = sessions.slice(firstCount);
  const firstInstallmentMarks = firstSessions.length * firstRateMarks;
  const secondInstallmentMarks = secondSessions.length * (secondRateMarks ?? 0);
  const installments: EnrollmentQuote["installments"] = [
    {
      ordinal: 1,
      rateMarks: firstRateMarks,
      sessionIds: firstSessions.map((session) => session.id),
      amountMarks: firstInstallmentMarks,
      dueAt: null,
    },
  ];
  if (secondSessions.length > 0 && secondRateMarks !== null) {
    installments.push({
      ordinal: 2,
      rateMarks: secondRateMarks,
      sessionIds: secondSessions.map((session) => session.id),
      amountMarks: secondInstallmentMarks,
      dueAt: secondSessions[0]!.startAt,
    });
  }

  return {
    plan,
    selectedSessionIds: sessions.map((session) => session.id),
    sessionCount: sessions.length,
    firstRateMarks,
    secondRateMarks,
    firstInstallmentMarks,
    secondInstallmentMarks,
    totalMarks: firstInstallmentMarks + secondInstallmentMarks,
    allocations: sessions.map((session, index) => ({
      sessionId: session.id,
      ordinal: index + 1,
      sequenceNumber: session.sequenceNumber,
      rateMarks: index < firstCount ? firstRateMarks : secondRateMarks!,
      installmentOrdinal: index < firstCount ? 1 : 2,
    })),
    installments,
  };
}
