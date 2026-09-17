export const TUTOR_REVIEW_DIFF_FILTERS = [
  "all",
  "added",
  "modified",
  "removed",
  "empty",
] as const;

export type TutorReviewDiffFilter = (typeof TUTOR_REVIEW_DIFF_FILTERS)[number];

export type TutorReviewDiffStatus =
  | "added"
  | "modified"
  | "removed"
  | "filled"
  | "empty";

export type TutorReviewDiff = {
  field: string;
  label: string;
  current: unknown;
  proposed: unknown;
  status: TutorReviewDiffStatus;
};

export type TutorReviewDiffSummary = Record<TutorReviewDiffStatus, number>;

export function isTutorReviewValueEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (typeof value === "number") {
    return value === 0 || !Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isTutorReviewValueEmpty);
  }
  if (typeof value === "object") {
    const entries = Object.values(value as Record<string, unknown>);
    return entries.every(isTutorReviewValueEmpty);
  }
  return false;
}

function normalizeTutorReviewValue(value: unknown, field: string): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    const normalized = value.map((entry) =>
      normalizeTutorReviewValue(entry, field),
    );
    if (field === "subjectIds") {
      return Array.from(
        new Set(
          normalized
            .filter((entry) => !isTutorReviewValueEmpty(entry))
            .map(String),
        ),
      ).toSorted();
    }
    return normalized;
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .toSorted()
        .map((key) => [
          key,
          normalizeTutorReviewValue(
            (value as Record<string, unknown>)[key],
            field,
          ),
        ]),
    );
  }
  return value;
}

function haveSameTutorReviewValue(
  left: unknown,
  right: unknown,
  field: string,
): boolean {
  return (
    JSON.stringify(normalizeTutorReviewValue(left, field)) ===
    JSON.stringify(normalizeTutorReviewValue(right, field))
  );
}

export function getTutorReviewDiffStatus(
  current: unknown,
  proposed: unknown,
  field = "",
): TutorReviewDiffStatus {
  const currentEmpty = isTutorReviewValueEmpty(current);
  const proposedEmpty = isTutorReviewValueEmpty(proposed);

  if (currentEmpty && proposedEmpty) return "empty";
  if (currentEmpty) return "added";
  if (proposedEmpty) return "removed";
  return haveSameTutorReviewValue(current, proposed, field)
    ? "filled"
    : "modified";
}

export function buildTutorReviewDiffs(
  entries: readonly (readonly [string, unknown])[],
  readCurrent: (field: string) => unknown,
  labelFor: (field: string) => string,
): TutorReviewDiff[] {
  return entries.map(([field, proposed]) => {
    const current = readCurrent(field);
    return {
      field,
      label: labelFor(field),
      current,
      proposed,
      status: getTutorReviewDiffStatus(current, proposed, field),
    };
  });
}

export function filterTutorReviewDiffs(
  entries: readonly TutorReviewDiff[],
  filter: TutorReviewDiffFilter,
  search: string,
): TutorReviewDiff[] {
  const query = search.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter !== "all" && entry.status !== filter) return false;
    if (!query) return true;
    return `${entry.label} ${entry.field}`.toLowerCase().includes(query);
  });
}

export function summarizeTutorReviewDiffs(
  entries: readonly TutorReviewDiff[],
): TutorReviewDiffSummary {
  const summary: TutorReviewDiffSummary = {
    added: 0,
    modified: 0,
    removed: 0,
    filled: 0,
    empty: 0,
  };
  for (const entry of entries) summary[entry.status] += 1;
  return summary;
}
