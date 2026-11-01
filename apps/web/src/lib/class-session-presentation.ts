export function classSessionStart(value: Date | string) {
  return new Date(value).getTime();
}

export function formatClassSessionDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export function formatClassSessionTime(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export function classSessionReference(row: {
  classNumber: number;
  sequenceNumber: number;
}) {
  return `CLS-${row.classNumber}-S${row.sequenceNumber}`;
}

export function getClassSessionStatus(
  row: {
    state: "scheduled" | "completed" | "cancelled";
    startAt: Date | string;
    report: unknown;
  },
  now: number,
) {
  if (row.state === "cancelled") {
    return { label: "Cancelled", variant: "danger" as const };
  }
  if (row.state === "completed") {
    return { label: "Completed", variant: "secondary" as const };
  }
  if (row.report) {
    return { label: "Report recorded", variant: "success" as const };
  }
  if (classSessionStart(row.startAt) <= now) {
    return { label: "Report pending", variant: "warning" as const };
  }
  return { label: "Upcoming", variant: "info" as const };
}

/**
 * Catalog-facing status: students see whether a session already happened
 * instead of the tutor reporting markers.
 */
export type ClassSessionScheduleStatus = {
  label: "In progress" | "Upcoming" | "Completed" | "Cancelled";
  variant: "primary" | "info" | "secondary" | "danger";
};

export function getClassSessionScheduleStatus(
  row: {
    state: string;
    startAt: Date | string;
    endAt: Date | string;
  },
  now: number,
): ClassSessionScheduleStatus {
  if (row.state === "cancelled") {
    return { label: "Cancelled", variant: "danger" as const };
  }
  if (row.state === "completed" || classSessionStart(row.endAt) <= now) {
    return { label: "Completed", variant: "secondary" as const };
  }
  if (classSessionStart(row.startAt) <= now) {
    return { label: "In progress", variant: "primary" as const };
  }
  return { label: "Upcoming", variant: "info" as const };
}

const scheduleStatusRank = {
  "In progress": 0,
  Upcoming: 1,
  Completed: 2,
  Cancelled: 3,
} as const;

function sessionStartForSort(value: Date | string) {
  const time = classSessionStart(value);
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

/**
 * Keeps live and upcoming sessions before finished ones, so a completed
 * session never sits above the next session a student should prepare for.
 * Upcoming sessions read in time order; finished sessions read in curriculum
 * order.
 */
export function sortClassSessions<
  T extends {
    state: string;
    startAt: Date | string;
    endAt: Date | string;
    sequenceNumber: number;
  },
>(sessions: readonly T[], now: number) {
  return sessions.toSorted((left, right) => {
    const leftRank =
      scheduleStatusRank[getClassSessionScheduleStatus(left, now).label];
    const rightRank =
      scheduleStatusRank[getClassSessionScheduleStatus(right, now).label];
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (leftRank <= 1) {
      return (
        sessionStartForSort(left.startAt) - sessionStartForSort(right.startAt)
      );
    }
    return left.sequenceNumber - right.sequenceNumber;
  });
}
