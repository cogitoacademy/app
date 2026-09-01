"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@cogito-app/ui/components/selia/avatar";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import {
  IconAlertTriangle,
  IconBuildingBank,
  IconPhoto,
  IconSchool,
  IconShieldCheck,
  IconUser,
} from "@tabler/icons-react";

import { getUserFacingError } from "@/lib/error-message";
import { authClient } from "@/lib/auth-client";
import { ProfileImagePicker } from "@/components/profile/profile-image-picker";
import { orpc } from "@/utils/orpc";
import { TutorPricingFields } from "./tutor-pricing-fields";
import {
  TutorAchievementsDisplay,
  TutorAchievementsEditor,
  type TutorCompetitionAchievement,
  type TutorEducationEntry,
  validateTutorAchievementDraft,
} from "./tutor-achievements";
import {
  TutorExperiencesDisplay,
  TutorExperiencesEditor,
  type TutorExperienceEntry,
  validateTutorExperienceDraft,
} from "./tutor-experiences";
import {
  MAX_TUTOR_SUBJECTS,
  SubjectSelector,
  type TutorSubject,
} from "./subject-taxonomy";

type Modality = "online" | "offline" | "both";
type BankAccountOwnership = "self" | "trusted_person";

type TutorStatusBadge = {
  label: string;
  variant: "secondary" | "danger" | "warning" | "success" | "info";
};

const TUTOR_STATUS_BADGES: Record<string, TutorStatusBadge> = {
  draft: { label: "Draft", variant: "secondary" },
  pending_review: { label: "Needs review", variant: "warning" },
  changes_requested: { label: "Changes requested", variant: "danger" },
  approved_unpublished: { label: "Approved", variant: "info" },
  published: { label: "Published", variant: "success" },
  suspended: { label: "Suspended", variant: "danger" },
};

interface OnboardingFormProps {
  accountUser: {
    name: string;
    email: string;
    image: string | null;
  };
  profile: {
    id: string;
    displayName: string | null;
    shortBio: string | null;
    credentialsSummary: string | null;
    achievements: string | null;
    experiences: string | null;
    achievementProofUrls: string[] | null;
    experienceProofUrls: string[] | null;
    user?: { image: string | null } | null;
    education: TutorEducationEntry[] | null;
    competitionAchievements: TutorCompetitionAchievement[] | null;
    experienceEntries: TutorExperienceEntry[] | null;
    expertise: string[];
    subjects?: TutorSubject[] | null;
    modality: string | null;
    baseRatesIdr: Partial<{ online: number; offline: number }> | null;
    bankName: string | null;
    bankAccountNumber: string | null;
    bankAccountHolderName: string | null;
    bankAccountOpeningCity: string | null;
    bankAccountOwnership: BankAccountOwnership | null;
    bankTransferDisclaimerAccepted: boolean | null;
    prices: Record<string, number> | null;
    onboardingStatus: string;
    adminReviewNote: string | null;
    pendingProfileChanges: Partial<{
      displayName: string;
      achievements: string;
      experiences: string;
      achievementProofUrls: string[];
      experienceProofUrls: string[];
      profileImageUrl: string;
      credentialsSummary: string;
      education: TutorEducationEntry[];
      competitionAchievements: TutorCompetitionAchievement[];
      experienceEntries: TutorExperienceEntry[];
      expertise: string[];
      subjectIds: string[];
      modality: Modality;
      baseRatesIdr: Partial<{ online: number; offline: number }>;
      prices: Record<string, number>;
    }> | null;
    profileEditStatus: string;
    profileEditAdminNote: string | null;
    version: number;
  };
}

function haveSameSubjectIds(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((subjectId) => rightSet.has(subjectId));
}

const TUTOR_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  shortBio: "Short bio",
  competitionAchievements: "Competition achievements",
  experienceEntries: "Experience entries",
  profileImageUrl: "Profile photo",
  modality: "Teaching modality",
  bankName: "Bank",
  bankAccountNumber: "Account number",
  bankAccountHolderName: "Account holder name",
  bankAccountOpeningCity: "Account opening city/regency",
  bankAccountOwnership: "Account ownership",
  bankTransferDisclaimerAccepted: "Transfer-account confirmation",
  subjects: "Subjects and competition tracks",
  baseRatesIdr: "Base honorarium",
  education: "Education",
  achievementProofUrls: "Achievement proof links",
  experienceProofUrls: "Experience proof links",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isExternalHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function mapServerFieldKey(field: string) {
  if (field === "subjectIds" || field.startsWith("subjectIds.")) {
    return "subjects";
  }
  if (field === "prices") return "baseRatesIdr";
  if (field.startsWith("prices.")) {
    return `baseRatesIdr.${field.slice("prices.".length)}`;
  }
  return field;
}

function getTutorFieldLabel(field: string) {
  if (TUTOR_FIELD_LABELS[field]) return TUTOR_FIELD_LABELS[field];

  const educationField = field.match(/^education\.(\d+)\.(\w+)$/);
  if (educationField) {
    const [, index, name] = educationField;
    return `Education ${Number(index) + 1}: ${
      name === "university" ? "University" : "Degree"
    }`;
  }

  const achievementField = field.match(
    /^competitionAchievements\.(\d+)\.(\w+)$/,
  );
  if (achievementField) {
    const [, index, name] = achievementField;
    const labels: Record<string, string> = {
      competitionName: "Competition name",
      year: "Year",
      awards: "Award titles",
    };
    return `Achievement ${Number(index) + 1}: ${labels[name] ?? name}`;
  }

  const experienceField = field.match(/^experienceEntries\.(\d+)\.(\w+)$/);
  if (experienceField) {
    const [, index, name] = experienceField;
    const labels: Record<string, string> = {
      role: "Role or position",
      organization: "Organization or company",
      startYear: "Start year",
      endYear: "End year",
      description: "Description",
    };
    return `Experience ${Number(index) + 1}: ${labels[name] ?? name}`;
  }

  const rateField = field.match(/^baseRatesIdr\.(online|offline)$/);
  if (rateField) {
    return `${rateField[1] === "online" ? "Online" : "Offline"} base rate`;
  }

  const proofField = field.match(/^(achievement|experience)ProofUrls\.(\d+)$/);
  if (proofField) {
    return `${proofField[1] === "achievement" ? "Achievement" : "Experience"} proof link ${Number(proofField[2]) + 1}`;
  }

  return field.replaceAll(/([A-Z])/g, " $1");
}

function getVisibleTutorErrors(errors: Record<string, string>) {
  const keys = Object.keys(errors);
  return Object.entries(errors).filter(
    ([field]) =>
      !keys.some(
        (childField) =>
          childField !== field && childField.startsWith(`${field}.`),
      ),
  );
}

function getTutorErrorFocusTarget(
  field: string,
  hasCompetitionEntries: boolean,
  hasExperienceEntries: boolean,
) {
  const educationField = field.match(/^education\.(\d+)\.(university|degree)$/);
  if (educationField) {
    return `tutor-achievements-${educationField[2]}-${educationField[1]}`;
  }

  const achievementField = field.match(
    /^competitionAchievements\.(\d+)\.(competitionName|year|awards)$/,
  );
  if (achievementField) {
    return `tutor-achievements-${
      achievementField[3] === "competitionName"
        ? "competition"
        : achievementField[3]
    }-${achievementField[2]}`;
  }

  const experienceField = field.match(
    /^experienceEntries\.(\d+)\.(role|organization|startYear|endYear|description)$/,
  );
  if (experienceField) {
    return `tutor-experiences-${
      experienceField[3] === "startYear"
        ? "start-year"
        : experienceField[3] === "endYear"
          ? "end-year"
          : experienceField[3]
    }-${experienceField[2]}`;
  }

  const rateField = field.match(/^baseRatesIdr\.(online|offline)$/);
  if (rateField) return `tutor-base-rate-${rateField[1]}`;
  if (field === "subjects") return "tutor-subject-category";
  if (field === "education") return "tutor-achievements-university-0";
  if (field === "competitionAchievements") {
    return hasCompetitionEntries
      ? "tutor-achievements-competition-0"
      : "tutor-achievements-competition-add";
  }
  if (field === "experienceEntries") {
    return hasExperienceEntries
      ? "tutor-experiences-role-0"
      : "tutor-experiences-add";
  }
  if (field === "profileImageUrl") return "tutor-profile-image";
  if (field.startsWith("achievementProofUrls.")) {
    return "tutor-achievement-proofs";
  }
  if (field.startsWith("experienceProofUrls.")) {
    return "tutor-experience-proofs";
  }
  return `tutor-${field}`;
}

function readServerFieldErrors(error: unknown) {
  const fieldErrors: Record<string, string> = {};
  if (!isRecord(error) || !isRecord(error.data)) return fieldErrors;

  const data = error.data;
  if (Array.isArray(data.missingFields)) {
    for (const field of data.missingFields) {
      if (typeof field === "string") {
        fieldErrors[mapServerFieldKey(field)] = "Required.";
      }
    }
  }

  if (typeof data.pricingError === "string") {
    const normalized = data.pricingError.toLowerCase();
    const field = normalized.includes("offline")
      ? "baseRatesIdr.offline"
      : normalized.includes("online")
        ? "baseRatesIdr.online"
        : "baseRatesIdr";
    fieldErrors[field] = data.pricingError;
  }

  if (
    typeof data.reason === "string" &&
    ["required", "too_many", "duplicate", "not_child", "inactive"].includes(
      data.reason,
    )
  ) {
    fieldErrors.subjects =
      data.reason === "too_many"
        ? `Select no more than ${MAX_TUTOR_SUBJECTS} child subjects.`
        : data.reason === "required"
          ? "Select at least one child subject."
          : "Some selected subjects are no longer available. Update your selection.";
  }

  if (Array.isArray(data.issues)) {
    for (const issue of data.issues) {
      if (!isRecord(issue) || !Array.isArray(issue.path)) continue;
      const path = issue.path
        .filter(
          (part): part is string | number =>
            typeof part === "string" || typeof part === "number",
        )
        .filter((part) => part !== "json")
        .join(".");
      if (!path) continue;
      const message =
        typeof issue.message === "string"
          ? issue.message
          : "Check this field and try again.";
      fieldErrors[mapServerFieldKey(path)] = message;
    }
  }

  return fieldErrors;
}

export function OnboardingForm({ accountUser, profile }: OnboardingFormProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pending = profile.pendingProfileChanges ?? {};
  const legacySubjectIds = new Set(
    profile.subjects
      ?.filter((subject) => subject.isSelectable === false)
      .map((subject) => subject.id) ?? [],
  );
  const initialSubjectIds =
    pending.subjectIds?.filter(
      (subjectId) => !legacySubjectIds.has(subjectId),
    ) ??
    profile.subjects
      ?.filter((subject) => subject.isSelectable !== false)
      .map((subject) => subject.id) ??
    [];
  const [form, setForm] = useState({
    shortBio: profile.shortBio ?? "",
    achievements:
      pending.achievements ??
      profile.achievements ??
      profile.credentialsSummary ??
      "",
    experiences: pending.experiences ?? profile.experiences ?? "",
    achievementProofUrls:
      pending.achievementProofUrls ?? profile.achievementProofUrls ?? [],
    experienceProofUrls:
      pending.experienceProofUrls ?? profile.experienceProofUrls ?? [],
    profileImageUrl:
      pending.profileImageUrl ?? profile.user?.image ?? accountUser.image ?? "",
    education: pending.education ?? profile.education ?? [],
    competitionAchievements:
      pending.competitionAchievements ?? profile.competitionAchievements ?? [],
    experienceEntries:
      pending.experienceEntries ?? profile.experienceEntries ?? [],
    expertise: pending.expertise ?? profile.expertise ?? [],
    subjectIds: initialSubjectIds,
    modality: (pending.modality ?? profile.modality ?? "") as Modality | "",
    baseRatesIdr: pending.baseRatesIdr ??
      profile.baseRatesIdr ?? {
        online: 175_000,
        offline: 225_000,
      },
    bankName: profile.bankName ?? "",
    bankAccountNumber: profile.bankAccountNumber ?? "",
    bankAccountHolderName: profile.bankAccountHolderName ?? "",
    bankAccountOpeningCity: profile.bankAccountOpeningCity ?? "",
    bankAccountOwnership: (profile.bankAccountOwnership ?? "") as
      | BankAccountOwnership
      | "",
    bankTransferDisclaimerAccepted:
      profile.bankTransferDisclaimerAccepted ?? false,
  });
  const [name, setName] = useState(accountUser.name ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const publishedSubmitRef = useRef(false);
  const savedNameRef = useRef(accountUser.name.trim());

  const nameMutation = useMutation({
    mutationFn: async (nextName: string) => {
      const result = await authClient.updateUser({ name: nextName });
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.auth.me.key() });
    },
    onError: (error: unknown) => {
      toastManager.add({
        title: "Name could not be saved",
        description: getUserFacingError(error),
        type: "error",
      });
    },
  });

  async function saveCanonicalName() {
    const nextName = name.trim();
    if (nextName !== savedNameRef.current) {
      await nameMutation.mutateAsync(nextName);
      savedNameRef.current = nextName;
    }
  }

  function clearError(field: string) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${field}.`)) delete next[key];
      }
      return next;
    });
  }

  const updateMutation = useMutation(
    orpc.tutor.updateMyProfile.mutationOptions({
      onSuccess: () => {
        const submittedPublishedChanges = publishedSubmitRef.current;
        publishedSubmitRef.current = false;
        toastManager.add({
          title: submittedPublishedChanges
            ? "Profile changes submitted for review"
            : profile.onboardingStatus === "published"
              ? "Profile changes saved"
              : "Progress saved",
          description: submittedPublishedChanges
            ? "The latest profile changes are now waiting for admin review."
            : profile.onboardingStatus === "published"
              ? "Public details were updated. Honorarium changes apply to future bookings; verified details may wait for admin review."
              : undefined,
          type: "success",
        });
        void queryClient.invalidateQueries({
          queryKey: orpc.tutor.getMyProfile.key(),
        });
        void queryClient.invalidateQueries({ queryKey: orpc.auth.me.key() });
      },
      onError: (error: unknown) => {
        publishedSubmitRef.current = false;
        const fieldErrors = readServerFieldErrors(error);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors((current) => ({ ...current, ...fieldErrors }));
        }
        toastManager.add({
          title: "Tutor profile could not be saved",
          description:
            Object.keys(fieldErrors).length > 0
              ? "Check the highlighted fields and try again."
              : getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );

  const submitMutation = useMutation(
    orpc.tutor.submitForReview.mutationOptions({
      onSuccess: async () => {
        toastManager.add({
          title: "Profile submitted for review!",
          type: "success",
        });
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: orpc.tutor.getMyProfile.key(),
          }),
          queryClient.invalidateQueries({ queryKey: orpc.auth.me.key() }),
        ]);
        await navigate({ to: "/dashboard", replace: true });
      },
      onError: (error: unknown) => {
        const fieldErrors = readServerFieldErrors(error);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors((current) => ({ ...current, ...fieldErrors }));
        }
        toastManager.add({
          title: "Tutor profile could not be submitted",
          description:
            Object.keys(fieldErrors).length > 0
              ? "Check the highlighted fields and try again."
              : getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );

  function getSavePayload() {
    const payload: {
      version: number;
      shortBio?: string;
      achievements?: string;
      experiences?: string;
      achievementProofUrls?: string[];
      experienceProofUrls?: string[];
      profileImageUrl?: string;
      education?: TutorEducationEntry[];
      competitionAchievements?: TutorCompetitionAchievement[];
      experienceEntries?: TutorExperienceEntry[];
      expertise?: string[];
      subjectIds?: string[];
      modality?: Modality;
      baseRatesIdr?: Partial<{ online: number; offline: number }>;
      bankName?: string;
      bankAccountNumber?: string;
      bankAccountHolderName?: string;
      bankAccountOpeningCity?: string;
      bankAccountOwnership?: BankAccountOwnership;
      bankTransferDisclaimerAccepted?: boolean;
      prices?: Record<string, number>;
    } = { version: profile.version };
    const shortBio = form.shortBio.trim();
    const achievements = form.achievements.trim();
    const experiences = form.experiences.trim();
    const profileImageUrl = form.profileImageUrl.trim();
    const education = form.education.map((entry) => ({
      university: entry.university.trim(),
      degree: entry.degree.trim(),
    }));
    const competitionAchievements = form.competitionAchievements.map(
      (entry) => ({
        competitionName: entry.competitionName.trim(),
        year: entry.year,
        awards: entry.awards.map((award) => award.trim()),
      }),
    );
    const experienceEntries = form.experienceEntries.map((entry) => ({
      role: entry.role.trim(),
      organization: entry.organization.trim(),
      startYear: entry.startYear,
      endYear: entry.endYear,
      description: entry.description.trim(),
    }));
    const bankName = form.bankName.trim();
    const bankAccountNumber = form.bankAccountNumber.replaceAll(/\D/g, "");
    const bankAccountHolderName = form.bankAccountHolderName.trim();
    const bankAccountOpeningCity = form.bankAccountOpeningCity.trim();

    payload.shortBio = shortBio;
    payload.achievements = achievements;
    payload.experiences = experiences;
    payload.achievementProofUrls = form.achievementProofUrls;
    payload.experienceProofUrls = form.experienceProofUrls;
    if (profileImageUrl) payload.profileImageUrl = profileImageUrl;
    payload.education = education;
    payload.competitionAchievements = competitionAchievements;
    payload.experienceEntries = experienceEntries;
    if (form.expertise.length > 0) payload.expertise = form.expertise;
    if (
      form.subjectIds.length > 0 &&
      !haveSameSubjectIds(form.subjectIds, initialSubjectIds)
    ) {
      payload.subjectIds = form.subjectIds;
    }
    if (form.modality) payload.modality = form.modality;
    if (bankName) payload.bankName = bankName;
    if (bankAccountNumber) payload.bankAccountNumber = bankAccountNumber;
    if (bankAccountHolderName)
      payload.bankAccountHolderName = bankAccountHolderName;
    if (bankAccountOpeningCity)
      payload.bankAccountOpeningCity = bankAccountOpeningCity;
    if (form.bankAccountOwnership)
      payload.bankAccountOwnership = form.bankAccountOwnership;
    payload.bankTransferDisclaimerAccepted =
      form.bankTransferDisclaimerAccepted;
    if (form.baseRatesIdr && Object.keys(form.baseRatesIdr).length > 0) {
      const cleanBaseRates = Object.fromEntries(
        Object.entries(form.baseRatesIdr).filter(([, value]) => value > 0),
      );
      if (Object.keys(cleanBaseRates).length > 0) {
        payload.baseRatesIdr = cleanBaseRates as Partial<{
          online: number;
          offline: number;
        }>;
      }
    }
    return payload;
  }

  function validateTutorForm(requireComplete: boolean) {
    const validationErrors: Record<string, string> = {};
    const addError = (field: string, message: string) => {
      validationErrors[field] ??= message;
    };
    const canonicalName = name.trim();
    if (!canonicalName) addError("name", "Required.");
    if (canonicalName.length > 255) {
      addError("name", "Use 255 characters or fewer.");
    }
    const shortBio = form.shortBio.trim();
    const achievements = form.achievements.trim();
    const experiences = form.experiences.trim();
    const profileImageUrl = form.profileImageUrl.trim();
    const bankName = form.bankName.trim();
    const bankAccountNumber = form.bankAccountNumber.replaceAll(/\D/g, "");
    const bankAccountHolderName = form.bankAccountHolderName.trim();
    const bankAccountOpeningCity = form.bankAccountOpeningCity.trim();

    if (requireComplete && !shortBio) addError("shortBio", "Required.");
    if (form.shortBio.length > 2_000) {
      addError("shortBio", "Use 2,000 characters or fewer.");
    }
    if (form.achievements.length > 5_000) {
      addError("achievements", "Use 5,000 characters or fewer.");
    }
    if (form.experiences.length > 5_000) {
      addError("experiences", "Use 5,000 characters or fewer.");
    }

    if (
      requireComplete &&
      !achievements &&
      form.competitionAchievements.length === 0
    ) {
      addError(
        "competitionAchievements",
        "Add at least one competition achievement or achievement summary.",
      );
    }
    if (
      requireComplete &&
      !experiences &&
      form.experienceEntries.length === 0
    ) {
      addError(
        "experienceEntries",
        "Add at least one experience entry or experience summary.",
      );
    }
    if (requireComplete && !profileImageUrl) {
      addError("profileImageUrl", "Upload a profile photo.");
    }
    if (
      profileImageUrl &&
      !isExternalHttpUrl(profileImageUrl) &&
      !profileImageUrl.startsWith("/uploads/")
    ) {
      addError("profileImageUrl", "Upload a valid profile photo.");
    }

    Object.assign(
      validationErrors,
      validateTutorAchievementDraft(
        form.education,
        form.competitionAchievements,
      ),
    );
    Object.assign(
      validationErrors,
      validateTutorExperienceDraft(form.experienceEntries),
    );

    const validateProofUrls = (
      field: "achievementProofUrls" | "experienceProofUrls",
      urls: string[],
    ) => {
      if (urls.length > 20) {
        addError(field, "Add no more than 20 proof links.");
      }
      urls.forEach((url, index) => {
        if (url.length > 2_048 || !isExternalHttpUrl(url)) {
          addError(`${field}.${index}`, "Enter a valid http(s) URL.");
        }
      });
    };
    validateProofUrls("achievementProofUrls", form.achievementProofUrls);
    validateProofUrls("experienceProofUrls", form.experienceProofUrls);

    if (requireComplete && !form.modality) addError("modality", "Required.");
    if (
      form.modality &&
      !["online", "offline", "both"].includes(form.modality)
    ) {
      addError("modality", "Select a valid teaching format.");
    }

    if (requireComplete && !bankName) addError("bankName", "Required.");
    if (bankName && (bankName.length < 2 || bankName.length > 100)) {
      addError("bankName", "Use 2–100 characters.");
    }
    if (requireComplete && !bankAccountNumber) {
      addError("bankAccountNumber", "Enter a valid account number.");
    } else if (bankAccountNumber && !/^\d{6,30}$/.test(bankAccountNumber)) {
      addError("bankAccountNumber", "Enter 6–30 digits.");
    }
    if (requireComplete && !bankAccountHolderName) {
      addError("bankAccountHolderName", "Required.");
    }
    if (
      bankAccountHolderName &&
      (bankAccountHolderName.length < 2 || bankAccountHolderName.length > 100)
    ) {
      addError("bankAccountHolderName", "Use 2–100 characters.");
    }
    if (requireComplete && !bankAccountOpeningCity) {
      addError("bankAccountOpeningCity", "Required.");
    }
    if (
      bankAccountOpeningCity &&
      (bankAccountOpeningCity.length < 2 || bankAccountOpeningCity.length > 100)
    ) {
      addError("bankAccountOpeningCity", "Use 2–100 characters.");
    }
    if (
      form.bankAccountOwnership &&
      !["self", "trusted_person"].includes(form.bankAccountOwnership)
    ) {
      addError(
        "bankAccountOwnership",
        "Select a valid account ownership option.",
      );
    } else if (requireComplete && !form.bankAccountOwnership) {
      addError("bankAccountOwnership", "Select an account ownership option.");
    }
    if (requireComplete && !form.bankTransferDisclaimerAccepted) {
      addError(
        "bankTransferDisclaimerAccepted",
        "Please confirm the transfer-account responsibility statement.",
      );
    }

    if (form.subjectIds.length > MAX_TUTOR_SUBJECTS) {
      addError(
        "subjects",
        `Select no more than ${MAX_TUTOR_SUBJECTS} child subjects.`,
      );
    } else if (requireComplete && form.subjectIds.length === 0) {
      addError("subjects", "Select at least one child subject.");
    }

    const ratesToCheck =
      form.modality === "both"
        ? (["online", "offline"] as const)
        : form.modality === "online" || form.modality === "offline"
          ? ([form.modality] as const)
          : ([] as const);
    for (const key of ratesToCheck) {
      const value = form.baseRatesIdr[key];
      if (typeof value !== "number") {
        if (requireComplete) {
          addError(
            `baseRatesIdr.${key}`,
            `Add a valid ${key} IDR base honorarium.`,
          );
        }
        continue;
      }
      if (!Number.isInteger(value) || value < 50_000 || value % 5_000 !== 0) {
        addError(
          `baseRatesIdr.${key}`,
          `${key === "online" ? "Online" : "Offline"} base honorarium must be an IDR amount of at least Rp 50,000 in Rp 5,000 increments.`,
        );
      }
    }

    return validationErrors;
  }

  function showValidationErrors(
    validationErrors: Record<string, string>,
    title: string,
    description: string,
  ) {
    setErrors(validationErrors);
    const visibleErrors = getVisibleTutorErrors(validationErrors);
    toastManager.add({
      title,
      description: `${description} ${visibleErrors.length} field${visibleErrors.length === 1 ? "" : "s"} highlighted below.`,
      type: "error",
    });
    const firstError =
      visibleErrors[0]?.[0] ?? Object.keys(validationErrors)[0];
    if (!firstError) return;
    const focusTarget = getTutorErrorFocusTarget(
      firstError,
      form.competitionAchievements.length > 0,
      form.experienceEntries.length > 0,
    );
    window.setTimeout(() => document.getElementById(focusTarget)?.focus(), 0);
  }

  async function handleSaveProgress() {
    publishedSubmitRef.current = false;
    const validationErrors = validateTutorForm(false);
    if (Object.keys(validationErrors).length > 0) {
      showValidationErrors(
        validationErrors,
        "Some fields need attention",
        "Fix the highlighted fields before saving your progress.",
      );
      return;
    }

    setErrors({});
    try {
      await saveCanonicalName();
      await updateMutation.mutateAsync(getSavePayload());
    } catch {
      // handled by mutation callbacks
    }
  }

  async function handleSubmitForReview() {
    const validationErrors = validateTutorForm(true);
    if (Object.keys(validationErrors).length > 0) {
      showValidationErrors(
        validationErrors,
        "Please fix the highlighted fields",
        "Complete the required information before submitting for review.",
      );
      return;
    }

    try {
      await saveCanonicalName();
      if (profile.onboardingStatus === "published") {
        // Published profile edits are staged by updateMyProfile itself. The
        // explicit submit action runs the complete form gate before putting
        // the latest pending values into the admin review queue.
        publishedSubmitRef.current = true;
        await updateMutation.mutateAsync(getSavePayload());
        return;
      }
      await updateMutation.mutateAsync(getSavePayload());
      await submitMutation.mutateAsync();
    } catch {
      // handled by mutation callbacks
    }
  }

  const isDraft =
    profile.onboardingStatus === "draft" ||
    profile.onboardingStatus === "changes_requested";
  const isEditable = isDraft || profile.onboardingStatus === "published";
  const statusBadge = TUTOR_STATUS_BADGES[profile.onboardingStatus] ?? {
    label: profile.onboardingStatus.replaceAll("_", " "),
    variant: "secondary" as const,
  };
  const statusIconVariant =
    statusBadge.variant === "success"
      ? "success-subtle"
      : statusBadge.variant === "danger"
        ? "danger-subtle"
        : statusBadge.variant === "warning"
          ? "warning-subtle"
          : "info-subtle";
  const statusMessage = isDraft
    ? profile.onboardingStatus === "changes_requested"
      ? "Review the feedback below, update the requested fields, then submit your profile again."
      : "Complete the required sections below. You can save a draft at any time before submitting for review."
    : profile.onboardingStatus === "pending_review"
      ? "Your profile is under review. You will be notified once an admin approves it."
      : profile.onboardingStatus === "approved_unpublished"
        ? "Your profile has been approved and is waiting for publication by an admin."
        : profile.onboardingStatus === "published"
          ? profile.profileEditStatus === "pending_review"
            ? "Your profile is live. You can keep updating it while the latest changes are waiting for admin review."
            : profile.profileEditStatus === "changes_requested"
              ? "Your profile is live, but the admin requested revisions to your proposed changes."
              : "Your tutor profile is live. You can update it anytime. Honorarium changes apply to future bookings; other important changes are reviewed before going live."
          : profile.onboardingStatus === "suspended"
            ? "Your tutor profile has been suspended. Please contact admin for details."
            : "Your profile status will appear here as it moves through review.";
  const hasReviewFeedback =
    (profile.adminReviewNote &&
      profile.onboardingStatus === "changes_requested") ||
    (profile.profileEditAdminNote &&
      profile.profileEditStatus === "changes_requested");
  const visibleValidationErrors = getVisibleTutorErrors(errors);
  const currentProfileImageUrl =
    profile.user?.image?.trim() || accountUser.image?.trim() || "";
  const selectedProfileImageUrl = form.profileImageUrl.trim();
  const hasProposedProfileImage =
    Boolean(selectedProfileImageUrl) &&
    selectedProfileImageUrl !== currentProfileImageUrl;

  return (
    <div className="mx-auto flex w-full flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Badge variant="info" pill>
            Tutor profile
          </Badge>
          <Heading className="mt-3" size="lg">
            {isDraft ? "Build your tutor profile" : "Your tutor profile"}
          </Heading>
          <Text className="mt-2 max-w-2xl text-muted">
            Give students a clear picture of your expertise, teaching format,
            and availability.
          </Text>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Badge variant={statusBadge.variant} size="lg" pill>
            {statusBadge.label}
          </Badge>
          {profile.profileEditStatus === "pending_review" ? (
            <Badge variant="warning" size="lg" pill>
              Changes under review
            </Badge>
          ) : null}
        </div>
      </header>

      <Card>
        <CardBody className="flex items-start gap-3">
          <IconBox variant={statusIconVariant} circle>
            <IconShieldCheck aria-hidden="true" />
          </IconBox>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Heading size="sm">Profile status</Heading>
              <Badge variant={statusBadge.variant} size="sm" pill>
                {statusBadge.label}
              </Badge>
            </div>
            <Text className="mt-1 text-muted">{statusMessage}</Text>
          </div>
        </CardBody>
      </Card>

      {hasReviewFeedback ? (
        <Card className="ring-warning-border bg-warning/5" role="status">
          <CardHeader>
            <IconBox variant="warning-subtle">
              <IconAlertTriangle aria-hidden="true" />
            </IconBox>
            <CardTitle>Review feedback</CardTitle>
            <CardDescription>
              Update the relevant section before submitting again.
            </CardDescription>
          </CardHeader>
          <CardBody className="grid gap-4">
            {profile.adminReviewNote &&
            profile.onboardingStatus === "changes_requested" ? (
              <div>
                <Text className="font-medium">Admin feedback</Text>
                <Text className="mt-1 text-muted">
                  {profile.adminReviewNote}
                </Text>
              </div>
            ) : null}
            {profile.profileEditAdminNote &&
            profile.profileEditStatus === "changes_requested" ? (
              <div>
                <Text className="font-medium">Feedback on profile changes</Text>
                <Text className="mt-1 text-muted">
                  {profile.profileEditAdminNote}
                </Text>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {visibleValidationErrors.length > 0 ? (
        <Card className="border-danger-border/64 bg-danger/5" role="alert">
          <CardBody>
            <Text className="font-medium text-danger">
              Please fix the highlighted fields before continuing.
            </Text>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-danger">
              {visibleValidationErrors.map(([field, message]) => (
                <li key={field}>
                  <span className="font-medium">
                    {getTutorFieldLabel(field)}:
                  </span>{" "}
                  {message}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {isEditable ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleSaveProgress();
          }}
          className="flex flex-col gap-6"
        >
          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="min-w-0 xl:col-span-2">
              <CardHeader>
                <IconBox variant="tertiary-subtle">
                  <IconPhoto aria-hidden="true" />
                </IconBox>
                <CardTitle>Profile photo</CardTitle>
                <CardDescription>
                  Submit one clear photo. The Cogito team will apply the
                  standard background before publishing or updating it.
                </CardDescription>
              </CardHeader>
              <CardBody className="flex flex-wrap items-start gap-8">
                {profile.onboardingStatus === "published" ? (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Avatar size="lg" className="size-20!">
                      <AvatarImage
                        src={currentProfileImageUrl || undefined}
                        alt="Current public tutor profile"
                      />
                      <AvatarFallback>
                        {(accountUser.name.slice(0, 2) || "TU").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <Text className="text-sm font-medium">Current photo</Text>
                      <Text className="text-xs text-muted">
                        Visible to students
                      </Text>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col items-center gap-2 text-center">
                  <ProfileImagePicker
                    id="tutor-profile-image"
                    image={selectedProfileImageUrl}
                    disabled={isUploadingPhoto}
                    onUploadingChange={setIsUploadingPhoto}
                    onImageChange={(profileImageUrl) => {
                      setForm((current) => ({ ...current, profileImageUrl }));
                      clearError("profileImageUrl");
                    }}
                    compactTrigger={
                      <Avatar size="lg" className="size-20!">
                        <AvatarImage
                          src={selectedProfileImageUrl || undefined}
                          alt={
                            hasProposedProfileImage
                              ? "Proposed tutor profile"
                              : "Tutor profile"
                          }
                        />
                        <AvatarFallback>
                          {(accountUser.name.slice(0, 2) || "TU").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    }
                  />
                  <div>
                    <Text className="text-sm font-medium">
                      {profile.onboardingStatus === "published"
                        ? hasProposedProfileImage
                          ? "Proposed photo"
                          : "Change photo"
                        : "Profile photo"}
                    </Text>
                    <Text className="max-w-56 text-xs text-muted">
                      {profile.onboardingStatus === "published"
                        ? "Changes become public after admin approval."
                        : "Click the avatar to upload and crop your photo."}
                    </Text>
                  </div>
                  {hasProposedProfileImage ? (
                    <Badge variant="warning" size="sm" pill>
                      {profile.pendingProfileChanges?.profileImageUrl ===
                      selectedProfileImageUrl
                        ? "Awaiting review"
                        : "Ready to save"}
                    </Badge>
                  ) : null}
                </div>
                {errors.profileImageUrl ? (
                  <Field className="basis-full">
                    <FieldError id="tutor-profile-image-error">
                      {errors.profileImageUrl}
                    </FieldError>
                  </Field>
                ) : null}
              </CardBody>
            </Card>

            <Card className="min-w-0 xl:col-span-2">
              <CardHeader>
                <IconBox variant="secondary-subtle">
                  <IconUser aria-hidden="true" />
                </IconBox>
                <CardTitle>Public profile</CardTitle>
                <CardDescription>
                  This is the first information students use to understand your
                  teaching style.
                </CardDescription>
              </CardHeader>
              <CardBody className="grid gap-5 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="tutor-name">
                    Name <span aria-hidden="true">*</span>
                  </FieldLabel>
                  <FieldDescription>
                    The same account name is used across Cogito for every role.
                  </FieldDescription>
                  <Input
                    id="tutor-name"
                    name="name"
                    autoComplete="name"
                    value={name}
                    maxLength={255}
                    onChange={(event) => {
                      setName(event.target.value);
                      clearError("name");
                    }}
                    placeholder="Your name"
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={
                      errors.name ? "tutor-name-error" : undefined
                    }
                  />
                  {errors.name ? (
                    <FieldError id="tutor-name-error">{errors.name}</FieldError>
                  ) : null}
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="tutor-short-bio">
                    Short bio <span aria-hidden="true">*</span>
                  </FieldLabel>
                  <FieldDescription>
                    A concise introduction students can scan before booking.
                  </FieldDescription>
                  <Textarea
                    id="tutor-short-bio"
                    name="shortBio"
                    rows={4}
                    value={form.shortBio}
                    maxLength={2_000}
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        shortBio: event.target.value,
                      }));
                      clearError("shortBio");
                    }}
                    placeholder="Brief introduction about yourself"
                    aria-invalid={Boolean(errors.shortBio)}
                    aria-describedby={
                      errors.shortBio ? "tutor-short-bio-error" : undefined
                    }
                  />
                  {errors.shortBio ? (
                    <FieldError id="tutor-short-bio-error">
                      {errors.shortBio}
                    </FieldError>
                  ) : null}
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="tutor-subject-category">
                    Subjects and competition tracks *
                  </FieldLabel>
                  <FieldDescription>
                    Select the competition subcategories you teach. Students
                    will see these on your tutor profile. You can select up to{" "}
                    {MAX_TUTOR_SUBJECTS}.
                  </FieldDescription>
                  <SubjectSelector
                    triggerId="tutor-subject-category"
                    selectedIds={form.subjectIds}
                    selectedSubjects={profile.subjects}
                    onChange={(subjectIds) => {
                      setForm((current) => ({ ...current, subjectIds }));
                      clearError("subjects");
                    }}
                    error={errors.subjects}
                  />
                </Field>
              </CardBody>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <IconBox variant="info-subtle">
                  <IconSchool aria-hidden="true" />
                </IconBox>
                <CardTitle>Teaching setup</CardTitle>
                <CardDescription>
                  Set the session format and your IDR honorarium.
                </CardDescription>
              </CardHeader>
              <CardBody className="flex flex-col gap-5">
                <Field>
                  <FieldLabel htmlFor="tutor-modality">
                    Teaching modality <span aria-hidden="true">*</span>
                  </FieldLabel>
                  <Select
                    value={form.modality}
                    onValueChange={(val) => {
                      const modalityVal =
                        typeof val === "object" &&
                        val !== null &&
                        "value" in val
                          ? (val as { value: string }).value
                          : val;
                      setForm((current) => ({
                        ...current,
                        modality: modalityVal as Modality,
                      }));
                      clearError("modality");
                    }}
                  >
                    <SelectTrigger
                      id="tutor-modality"
                      aria-invalid={Boolean(errors.modality)}
                      aria-describedby={
                        errors.modality ? "tutor-modality-error" : undefined
                      }
                    >
                      <SelectValue placeholder="Select a teaching format" />
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectList>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="offline">
                          Offline (at Cogito campus)
                        </SelectItem>
                        <SelectItem value="both">
                          Both online and offline
                        </SelectItem>
                      </SelectList>
                    </SelectPopup>
                  </Select>
                  {errors.modality ? (
                    <FieldError id="tutor-modality-error">
                      {errors.modality}
                    </FieldError>
                  ) : null}
                </Field>

                {form.modality ? (
                  <TutorPricingFields
                    modality={form.modality}
                    baseRatesIdr={form.baseRatesIdr}
                    onChange={(baseRatesIdr) => {
                      setForm((current) => ({ ...current, baseRatesIdr }));
                      clearError("baseRatesIdr");
                    }}
                    errors={errors}
                  />
                ) : (
                  <Text className="rounded-lg bg-accent px-3 py-2 text-sm text-muted">
                    Choose a teaching modality to see the recommended group
                    pricing fields.
                  </Text>
                )}
              </CardBody>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <IconBox variant="success-subtle">
                  <IconBuildingBank aria-hidden="true" />
                </IconBox>
                <CardTitle>Payout account</CardTitle>
                <CardDescription>
                  Weekly honorarium payouts are sent to this bank account.
                </CardDescription>
              </CardHeader>
              <CardBody className="flex flex-col gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="tutor-bankName">
                      Bank <span aria-hidden="true">*</span>
                    </FieldLabel>
                    <Input
                      id="tutor-bankName"
                      value={form.bankName}
                      placeholder="BCA"
                      maxLength={100}
                      aria-invalid={Boolean(errors.bankName)}
                      aria-describedby={
                        errors.bankName ? "tutor-bankName-error" : undefined
                      }
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          bankName: event.target.value,
                        }));
                        clearError("bankName");
                      }}
                    />
                    <FieldDescription>
                      Only conventional BCA is fee-free. BCA Syariah and blu
                      (BCA Digital) are treated as non-BCA and incur a Rp2,500
                      transfer fee per payout.
                    </FieldDescription>
                    {errors.bankName ? (
                      <FieldError id="tutor-bankName-error">
                        {errors.bankName}
                      </FieldError>
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="tutor-bankAccountNumber">
                      Account number <span aria-hidden="true">*</span>
                    </FieldLabel>
                    <Input
                      id="tutor-bankAccountNumber"
                      inputMode="numeric"
                      autoComplete="off"
                      value={form.bankAccountNumber}
                      placeholder="Enter account number"
                      maxLength={30}
                      aria-invalid={Boolean(errors.bankAccountNumber)}
                      aria-describedby={
                        errors.bankAccountNumber
                          ? "tutor-bankAccountNumber-error"
                          : undefined
                      }
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          bankAccountNumber: event.target.value.replaceAll(
                            /\D/g,
                            "",
                          ),
                        }));
                        clearError("bankAccountNumber");
                      }}
                    />
                    {errors.bankAccountNumber ? (
                      <FieldError id="tutor-bankAccountNumber-error">
                        {errors.bankAccountNumber}
                      </FieldError>
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="tutor-bankAccountHolderName">
                      Account holder name <span aria-hidden="true">*</span>
                    </FieldLabel>
                    <Input
                      id="tutor-bankAccountHolderName"
                      autoComplete="name"
                      value={form.bankAccountHolderName}
                      placeholder="Name as registered by the bank"
                      maxLength={100}
                      aria-invalid={Boolean(errors.bankAccountHolderName)}
                      aria-describedby={
                        errors.bankAccountHolderName
                          ? "tutor-bankAccountHolderName-error"
                          : undefined
                      }
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          bankAccountHolderName: event.target.value,
                        }));
                        clearError("bankAccountHolderName");
                      }}
                    />
                    {errors.bankAccountHolderName ? (
                      <FieldError id="tutor-bankAccountHolderName-error">
                        {errors.bankAccountHolderName}
                      </FieldError>
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="tutor-bankAccountOpeningCity">
                      Account opening city/regency{" "}
                      <span aria-hidden="true">*</span>
                    </FieldLabel>
                    <Input
                      id="tutor-bankAccountOpeningCity"
                      value={form.bankAccountOpeningCity}
                      placeholder="e.g. Jakarta Selatan"
                      maxLength={100}
                      aria-invalid={Boolean(errors.bankAccountOpeningCity)}
                      aria-describedby={
                        errors.bankAccountOpeningCity
                          ? "tutor-bankAccountOpeningCity-error"
                          : undefined
                      }
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          bankAccountOpeningCity: event.target.value,
                        }));
                        clearError("bankAccountOpeningCity");
                      }}
                    />
                    {errors.bankAccountOpeningCity ? (
                      <FieldError id="tutor-bankAccountOpeningCity-error">
                        {errors.bankAccountOpeningCity}
                      </FieldError>
                    ) : null}
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="tutor-bankAccountOwnership">
                    Account ownership <span aria-hidden="true">*</span>
                  </FieldLabel>
                  <Select
                    value={form.bankAccountOwnership}
                    onValueChange={(value) => {
                      const ownership =
                        typeof value === "object" &&
                        value !== null &&
                        "value" in value
                          ? (value as { value: string }).value
                          : value;
                      if (
                        ownership !== "self" &&
                        ownership !== "trusted_person"
                      ) {
                        return;
                      }
                      setForm((current) => ({
                        ...current,
                        bankAccountOwnership: ownership,
                      }));
                      clearError("bankAccountOwnership");
                    }}
                  >
                    <SelectTrigger
                      id="tutor-bankAccountOwnership"
                      aria-invalid={Boolean(errors.bankAccountOwnership)}
                      aria-describedby={
                        errors.bankAccountOwnership
                          ? "tutor-bankAccountOwnership-error"
                          : undefined
                      }
                    >
                      <SelectValue placeholder="Select who owns this account" />
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectList>
                        <SelectItem value="self">
                          My own bank account
                        </SelectItem>
                        <SelectItem value="trusted_person">
                          A trusted person's account for this transfer
                        </SelectItem>
                      </SelectList>
                    </SelectPopup>
                  </Select>
                  {errors.bankAccountOwnership ? (
                    <FieldError id="tutor-bankAccountOwnership-error">
                      {errors.bankAccountOwnership}
                    </FieldError>
                  ) : null}
                </Field>

                <div
                  className={`flex items-start gap-3 rounded-lg border bg-item p-4 ${
                    errors.bankTransferDisclaimerAccepted
                      ? "border-danger-border/64 ring-2 ring-danger-border/24"
                      : "border-item-border"
                  }`}
                >
                  <Checkbox
                    id="tutor-bankTransferDisclaimerAccepted"
                    checked={form.bankTransferDisclaimerAccepted}
                    aria-invalid={Boolean(
                      errors.bankTransferDisclaimerAccepted,
                    )}
                    aria-describedby={
                      errors.bankTransferDisclaimerAccepted
                        ? "tutor-bankTransferDisclaimerAccepted-error"
                        : undefined
                    }
                    onCheckedChange={(checked) => {
                      setForm((current) => ({
                        ...current,
                        bankTransferDisclaimerAccepted: checked === true,
                      }));
                      clearError("bankTransferDisclaimerAccepted");
                    }}
                  />
                  <Field className="min-w-0">
                    <FieldLabel htmlFor="tutor-bankTransferDisclaimerAccepted">
                      I confirm the account can receive Cogito transfers
                    </FieldLabel>
                    <FieldDescription>
                      I confirm this is my own account or an account belonging
                      to someone I trust for receiving this transfer. Cogito is
                      not responsible for any issue after the transfer reaches
                      the account provided here.
                    </FieldDescription>
                    {errors.bankTransferDisclaimerAccepted ? (
                      <FieldError id="tutor-bankTransferDisclaimerAccepted-error">
                        {errors.bankTransferDisclaimerAccepted}
                      </FieldError>
                    ) : null}
                  </Field>
                </div>
              </CardBody>
            </Card>
          </div>

          <Card className="min-w-0">
            <CardHeader>
              <IconBox variant="info-subtle">
                <IconSchool aria-hidden="true" />
              </IconBox>
              <CardTitle>Achievements &amp; experience</CardTitle>
              <CardDescription>
                Add your education, competition achievements, and relevant
                teaching, work, or mentoring experience in one place.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <TutorAchievementsEditor
                education={form.education}
                competitionAchievements={form.competitionAchievements}
                onEducationChange={(education, changedField) => {
                  setForm((current) => ({ ...current, education }));
                  clearError(changedField ?? "education");
                }}
                onCompetitionAchievementsChange={(
                  competitionAchievements,
                  changedField,
                ) => {
                  setForm((current) => ({
                    ...current,
                    competitionAchievements,
                  }));
                  clearError(changedField ?? "competitionAchievements");
                }}
                errors={errors}
                showPreview={false}
              />
              <Field className="mt-6">
                <FieldLabel htmlFor="tutor-achievement-proofs">
                  Achievement proof links
                </FieldLabel>
                <FieldDescription>
                  Optional. Add one public certificate, result, or portfolio URL
                  per line. These links are only used for admin verification.
                </FieldDescription>
                <Textarea
                  id="tutor-achievement-proofs"
                  name="achievementProofUrls"
                  rows={3}
                  value={form.achievementProofUrls.join("\n")}
                  aria-invalid={Boolean(
                    errors.achievementProofUrls ||
                    Object.keys(errors).some((key) =>
                      key.startsWith("achievementProofUrls."),
                    ),
                  )}
                  aria-describedby={
                    errors.achievementProofUrls ||
                    Object.keys(errors).some((key) =>
                      key.startsWith("achievementProofUrls."),
                    )
                      ? "tutor-achievement-proofs-error"
                      : undefined
                  }
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      achievementProofUrls: event.target.value
                        .split(/\r?\n/)
                        .map((url) => url.trim())
                        .filter(Boolean),
                    }));
                    clearError("achievementProofUrls");
                  }}
                  placeholder="https://example.com/certificate"
                />
                {errors.achievementProofUrls ? (
                  <FieldError id="tutor-achievement-proofs-error">
                    {errors.achievementProofUrls}
                  </FieldError>
                ) : null}
                {!errors.achievementProofUrls &&
                Object.entries(errors).some(([key]) =>
                  key.startsWith("achievementProofUrls."),
                ) ? (
                  <FieldError id="tutor-achievement-proofs-error">
                    Check each proof link.
                  </FieldError>
                ) : null}
              </Field>
              <div className="mt-8 border-t border-card-separator pt-8">
                <TutorExperiencesEditor
                  experienceEntries={form.experienceEntries}
                  legacyText={form.experiences}
                  onExperienceEntriesChange={(
                    experienceEntries,
                    changedField,
                  ) => {
                    setForm((current) => ({
                      ...current,
                      experienceEntries,
                    }));
                    clearError(changedField ?? "experienceEntries");
                  }}
                  errors={errors}
                  showPreview={false}
                />
                <Field className="mt-6">
                  <FieldLabel htmlFor="tutor-experience-proofs">
                    Experience proof links
                  </FieldLabel>
                  <FieldDescription>
                    Optional. Add one public reference, portfolio, or supporting
                    URL per line. These links are only used for admin
                    verification.
                  </FieldDescription>
                  <Textarea
                    id="tutor-experience-proofs"
                    name="experienceProofUrls"
                    rows={3}
                    value={form.experienceProofUrls.join("\n")}
                    aria-invalid={Boolean(
                      errors.experienceProofUrls ||
                      Object.keys(errors).some((key) =>
                        key.startsWith("experienceProofUrls."),
                      ),
                    )}
                    aria-describedby={
                      errors.experienceProofUrls ||
                      Object.keys(errors).some((key) =>
                        key.startsWith("experienceProofUrls."),
                      )
                        ? "tutor-experience-proofs-error"
                        : undefined
                    }
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        experienceProofUrls: event.target.value
                          .split(/\r?\n/)
                          .map((url) => url.trim())
                          .filter(Boolean),
                      }));
                      clearError("experienceProofUrls");
                    }}
                    placeholder="https://example.com/reference"
                  />
                  {errors.experienceProofUrls ? (
                    <FieldError id="tutor-experience-proofs-error">
                      {errors.experienceProofUrls}
                    </FieldError>
                  ) : null}
                  {!errors.experienceProofUrls &&
                  Object.entries(errors).some(([key]) =>
                    key.startsWith("experienceProofUrls."),
                  ) ? (
                    <FieldError id="tutor-experience-proofs-error">
                      Check each proof link.
                    </FieldError>
                  ) : null}
                </Field>
                <div className="mt-6 rounded-lg border border-item-border bg-accent p-4">
                  <Text className="text-sm font-medium">Public preview</Text>
                  <Text className="mt-1 text-sm text-muted">
                    Education, achievements, and experiences are shown together
                    as students will see them on your profile.
                  </Text>
                  <div className="mt-4 flex flex-col gap-6">
                    {form.education.length > 0 ||
                    form.competitionAchievements.length > 0 ? (
                      <TutorAchievementsDisplay
                        education={form.education}
                        competitionAchievements={form.competitionAchievements}
                      />
                    ) : null}
                    {form.experienceEntries.length > 0 ? (
                      <TutorExperiencesDisplay
                        experienceEntries={form.experienceEntries}
                      />
                    ) : null}
                    {form.education.length === 0 &&
                    form.competitionAchievements.length === 0 &&
                    form.experienceEntries.length === 0 ? (
                      <Text className="text-sm italic text-dimmed">
                        Add an education, achievement, or experience to see the
                        public profile preview.
                      </Text>
                    ) : null}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card className="sticky bottom-0 z-10 overflow-hidden *:border-none">
            <CardFooter className="flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Text className="font-medium">
                  {isDraft
                    ? "Ready to move your profile forward?"
                    : "Profile updates"}
                </Text>
                <Text className="mt-1 text-sm text-muted">
                  {isDraft
                    ? "Save a draft while you work, or submit the completed profile for admin review."
                    : "Save changes while you work, or submit the latest version for admin review. You can continue updating during review."}
                </Text>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  progress={nameMutation.isPending || updateMutation.isPending}
                  disabled={
                    nameMutation.isPending ||
                    updateMutation.isPending ||
                    submitMutation.isPending
                  }
                  onClick={handleSaveProgress}
                >
                  {isDraft ? "Save draft" : "Save profile changes"}
                </Button>
                {isEditable ? (
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    progress={
                      nameMutation.isPending
                        ? true
                        : isDraft
                          ? submitMutation.isPending
                          : updateMutation.isPending
                    }
                    disabled={
                      nameMutation.isPending ||
                      updateMutation.isPending ||
                      submitMutation.isPending
                    }
                    onClick={handleSubmitForReview}
                  >
                    {isDraft
                      ? "Submit for review"
                      : "Submit changes for review"}
                  </Button>
                ) : null}
              </div>
            </CardFooter>
          </Card>
        </form>
      ) : null}
    </div>
  );
}
