export const TUTOR_PROFILE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Needs review",
  changes_requested: "Changes requested",
  approved_unpublished: "Approved",
  published: "Published",
  suspended: "Suspended",
  none: "No pending review",
};

const FIELD_LABELS: Record<string, string> = {
  displayName: "Display name",
  shortBio: "Short bio",
  affiliation: "Affiliation",
  achievementProofUrls: "Achievement proof",
  experienceProofUrls: "Experience proof",
  education: "Education",
  achievements: "Achievements",
  experiences: "Experiences",
  subjectIds: "Specializations",
  modality: "Teaching mode",
  baseRatesIdr: "Base rates",
  onlineMaxClassSize: "Online class capacity",
  offlineMaxClassSize: "Offline class capacity",
  prices: "Marks prices",
  bankName: "Bank",
  bankAccountNumber: "Bank account number",
  bankAccountHolderName: "Account holder",
  bankAccountOpeningCity: "Account opening city",
  bankAccountOwnership: "Account ownership",
  bankTransferDisclaimerAccepted: "Transfer disclaimer",
  termsOfServiceAcceptedAt: "Terms accepted at",
  termsOfServiceVersion: "Terms version",
  onboardingStatus: "Onboarding status",
  adminReviewNote: "Admin review note",
  pendingProfileChanges: "Pending profile changes",
  profileEditStatus: "Profile edit status",
  profileEditAdminNote: "Profile edit admin note",
  publishedAt: "Published at",
  profileImageUrl: "Profile photo",
};

export type TutorProfileFieldKind =
  | "text"
  | "prose"
  | "subjects"
  | "education"
  | "achievements"
  | "experiences"
  | "urls"
  | "modality"
  | "money"
  | "marks"
  | "capacity"
  | "status"
  | "date"
  | "boolean"
  | "image"
  | "unknown";

export function stripPendingProfileChangesPrefix(path: string) {
  return path.startsWith("pendingProfileChanges.")
    ? path.slice("pendingProfileChanges.".length)
    : path;
}

export function getTutorProfileFieldRoot(path: string) {
  return stripPendingProfileChangesPrefix(path).split(".")[0] ?? path;
}

function humanize(value: string) {
  return value
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

export function getTutorProfileFieldLabel(path: string) {
  const normalizedPath = stripPendingProfileChangesPrefix(path);
  const [root, index, child] = normalizedPath.split(".");
  const rootLabel = FIELD_LABELS[root] ?? humanize(root);

  if (root === "prices" && index) {
    return `${rootLabel} · ${index} ${index === "1" ? "student" : "students"}`;
  }
  if (root === "baseRatesIdr" && index) {
    return `${index === "online" ? "Online" : "Offline"} base rate`;
  }
  if (root === "education" && index && child) {
    return `Education ${Number(index) + 1} · ${child === "university" ? "University" : "Degree"}`;
  }
  if (root === "achievements" && index && child) {
    const childLabel =
      child === "competitionName"
        ? "Competition"
        : child === "awards"
          ? "Awards"
          : humanize(child);
    return `Achievement ${Number(index) + 1} · ${childLabel}`;
  }
  if (root === "experiences" && index && child) {
    return `Experience ${Number(index) + 1} · ${humanize(child)}`;
  }
  if (
    (root === "achievementProofUrls" || root === "experienceProofUrls") &&
    index
  ) {
    const kind = root === "achievementProofUrls" ? "Achievement" : "Experience";
    return `${kind} proof link ${Number(index) + 1}`;
  }

  return rootLabel;
}

export function getTutorProfileFieldKind(path: string): TutorProfileFieldKind {
  const normalizedPath = stripPendingProfileChangesPrefix(path);
  const root = normalizedPath.split(".")[0];

  if (root === "subjectIds") return "subjects";
  if (root === "education") return "education";
  if (root === "achievements") return "achievements";
  if (root === "experiences") return "experiences";
  if (root === "achievementProofUrls" || root === "experienceProofUrls") {
    return "urls";
  }
  if (root === "modality") return "modality";
  if (root === "baseRatesIdr") return "money";
  if (root === "prices") return "marks";
  if (root === "onlineMaxClassSize" || root === "offlineMaxClassSize") {
    return "capacity";
  }
  if (root === "profileImageUrl") return "image";
  if (
    root === "onboardingStatus" ||
    root === "profileEditStatus" ||
    root === "termsOfServiceVersion"
  ) {
    return "status";
  }
  if (root === "termsOfServiceAcceptedAt" || root === "publishedAt") {
    return "date";
  }
  if (root === "bankTransferDisclaimerAccepted") return "boolean";
  if (root === "shortBio" || root === "affiliation") return "prose";
  if (root === "displayName" || root === "name") return "text";
  return "unknown";
}

export function getTutorStatusLabel(value: unknown) {
  if (typeof value !== "string" || !value) return "Not set";
  return TUTOR_PROFILE_STATUS_LABELS[value] ?? humanize(value);
}
