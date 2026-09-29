const PROFILE_FIELDS = [
  "shortBio",
  "affiliation",
  "achievementProofUrls",
  "experienceProofUrls",
  "education",
  "achievements",
  "experiences",
  "modality",
  "prices",
  "baseRatesIdr",
  "onlineMaxClassSize",
  "offlineMaxClassSize",
  "bankName",
  "bankAccountNumber",
  "bankAccountHolderName",
  "bankAccountOpeningCity",
  "bankAccountOwnership",
  "bankTransferDisclaimerAccepted",
  "termsOfServiceAcceptedAt",
  "termsOfServiceVersion",
  "onboardingStatus",
  "adminReviewNote",
  "pendingProfileChanges",
  "profileEditStatus",
  "profileEditAdminNote",
  "publishedAt",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneAuditValue(value: unknown, key?: string): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const values = value.map((entry) => cloneAuditValue(entry));
    return key === "subjectIds" &&
      values.every((entry) => typeof entry === "string")
      ? values.toSorted()
      : values;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .toSorted()
        .map((entryKey) => [
          entryKey,
          cloneAuditValue(value[entryKey], entryKey),
        ]),
    );
  }
  return value;
}

function readSubjectIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!isRecord(entry)) return null;
      if (typeof entry.subjectId === "string") return entry.subjectId;
      const subject = entry.subject;
      return isRecord(subject) && typeof subject.id === "string"
        ? subject.id
        : null;
    })
    .filter((id): id is string => id !== null)
    .toSorted();
}

export function createTutorProfileAuditSnapshot(
  source: unknown,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const profile = isRecord(source) ? source : {};
  const user = isRecord(profile.user) ? profile.user : {};
  const subjects = Object.prototype.hasOwnProperty.call(overrides, "subjectIds")
    ? overrides.subjectIds
    : readSubjectIds(profile.subjects);
  const image = Object.prototype.hasOwnProperty.call(
    overrides,
    "profileImageUrl",
  )
    ? overrides.profileImageUrl
    : user.image;

  const snapshot: Record<string, unknown> = {
    displayName: user.name ?? null,
    profileImageUrl: cloneAuditValue(image, "profileImageUrl"),
    subjectIds: cloneAuditValue(subjects, "subjectIds"),
  };

  for (const field of PROFILE_FIELDS) {
    const value = Object.prototype.hasOwnProperty.call(overrides, field)
      ? overrides[field]
      : profile[field];
    snapshot[field] = cloneAuditValue(value, field);
  }

  return snapshot;
}

function sameAuditValue(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(cloneAuditValue(left)) ===
    JSON.stringify(cloneAuditValue(right))
  );
}

function collectChangedFields(
  before: unknown,
  after: unknown,
  path: string,
  changed: string[],
) {
  if (sameAuditValue(before, after)) return;
  if (isRecord(before) && isRecord(after)) {
    for (const key of Array.from(
      new Set([...Object.keys(before), ...Object.keys(after)]),
    ).toSorted()) {
      collectChangedFields(
        before[key],
        after[key],
        path ? `${path}.${key}` : key,
        changed,
      );
    }
    return;
  }
  changed.push(path);
}

export function getChangedTutorProfileAuditFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const changed: string[] = [];
  collectChangedFields(before, after, "", changed);
  return changed;
}
