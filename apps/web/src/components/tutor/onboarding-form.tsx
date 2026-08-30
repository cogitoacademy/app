"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
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

import { authClient } from "@/lib/auth-client";
import { AccountIdentityCard } from "@/components/profile/account-identity-card";
import { getUserFacingError } from "@/lib/error-message";
import { client, orpc } from "@/utils/orpc";
import { TutorPricingFields } from "./tutor-pricing-fields";
import {
  TutorAchievementsEditor,
  type TutorCompetitionAchievement,
  type TutorEducationEntry,
  validateTutorAchievementDraft,
} from "./tutor-achievements";
import { SubjectSelector, type TutorSubject } from "./subject-taxonomy";

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
    sourcePhotoUrl: string | null;
    education: TutorEducationEntry[] | null;
    competitionAchievements: TutorCompetitionAchievement[] | null;
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
      sourcePhotoUrl: string;
      credentialsSummary: string;
      education: TutorEducationEntry[];
      competitionAchievements: TutorCompetitionAchievement[];
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

export function OnboardingForm({ accountUser, profile }: OnboardingFormProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const [accountForm, setAccountForm] = useState({
    name: accountUser.name,
    image: accountUser.image ?? "",
  });
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
    displayName: pending.displayName ?? profile.displayName ?? "",
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
    sourcePhotoUrl: pending.sourcePhotoUrl ?? profile.sourcePhotoUrl ?? "",
    education: pending.education ?? profile.education ?? [],
    competitionAchievements:
      pending.competitionAchievements ?? profile.competitionAchievements ?? [],
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const accountChanged =
    accountForm.name.trim() !== accountUser.name.trim() ||
    accountForm.image.trim() !== (accountUser.image ?? "").trim();

  const accountMutation = useMutation({
    mutationFn: async () => {
      const name = accountForm.name.trim();
      if (!name) throw new Error("Account name is required");

      const result = await authClient.updateUser({
        name,
        image: accountForm.image.trim() || null,
      });
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.auth.me.key() });
      await router.invalidate();
      toastManager.add({
        title: "Account profile updated",
        type: "success",
      });
    },
    onError: (error: Error) => {
      toastManager.add({
        title: "Account profile could not be updated",
        description: getUserFacingError(error),
        type: "error",
      });
    },
  });

  function clearError(field: string) {
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  const updateMutation = useMutation(
    orpc.tutor.updateMyProfile.mutationOptions({
      onSuccess: () => {
        toastManager.add({
          title:
            profile.onboardingStatus === "published"
              ? "Profile changes saved"
              : "Progress saved",
          description:
            profile.onboardingStatus === "published"
              ? "Public details were updated. Verified details are waiting for admin review."
              : undefined,
          type: "success",
        });
        void queryClient.invalidateQueries({
          queryKey: orpc.tutor.getMyProfile.key(),
        });
        void queryClient.invalidateQueries({ queryKey: orpc.auth.me.key() });
      },
      onError: (error: unknown) => {
        toastManager.add({
          title: "Tutor profile could not be saved",
          description: getUserFacingError(error),
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
        toastManager.add({
          title: "Tutor profile could not be submitted",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );

  function getSavePayload() {
    const payload: {
      version: number;
      displayName?: string;
      shortBio?: string;
      achievements?: string;
      experiences?: string;
      achievementProofUrls?: string[];
      experienceProofUrls?: string[];
      sourcePhotoUrl?: string;
      education?: TutorEducationEntry[];
      competitionAchievements?: TutorCompetitionAchievement[];
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
    const displayName = form.displayName.trim();
    const shortBio = form.shortBio.trim();
    const achievements = form.achievements.trim();
    const experiences = form.experiences.trim();
    const sourcePhotoUrl = form.sourcePhotoUrl.trim();
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
    const bankName = form.bankName.trim();
    const bankAccountNumber = form.bankAccountNumber.replaceAll(/\D/g, "");
    const bankAccountHolderName = form.bankAccountHolderName.trim();
    const bankAccountOpeningCity = form.bankAccountOpeningCity.trim();

    if (displayName) payload.displayName = displayName;
    if (shortBio) payload.shortBio = shortBio;
    if (achievements) payload.achievements = achievements;
    if (experiences) payload.experiences = experiences;
    payload.achievementProofUrls = form.achievementProofUrls;
    payload.experienceProofUrls = form.experienceProofUrls;
    if (sourcePhotoUrl) payload.sourcePhotoUrl = sourcePhotoUrl;
    payload.education = education;
    payload.competitionAchievements = competitionAchievements;
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

  async function handleSubmitForReview() {
    const validationErrors: Record<string, string> = {};
    if (!form.displayName.trim()) validationErrors.displayName = "Required";
    if (!form.shortBio.trim()) validationErrors.shortBio = "Required";
    if (!form.achievements.trim()) validationErrors.achievements = "Required";
    if (!form.experiences.trim()) validationErrors.experiences = "Required";
    if (!form.sourcePhotoUrl.trim())
      validationErrors.sourcePhotoUrl = "Required";
    Object.assign(
      validationErrors,
      validateTutorAchievementDraft(
        form.education,
        form.competitionAchievements,
      ),
    );
    if (!form.modality) validationErrors.modality = "Required";
    if (!form.bankName.trim()) validationErrors.bankName = "Required";
    if (!/^\d{6,30}$/.test(form.bankAccountNumber.replaceAll(/\D/g, ""))) {
      validationErrors.bankAccountNumber = "Enter a valid account number";
    }
    if (!form.bankAccountHolderName.trim())
      validationErrors.bankAccountHolderName = "Required";
    if (!form.bankAccountOpeningCity.trim())
      validationErrors.bankAccountOpeningCity = "Required";
    if (!form.bankAccountOwnership)
      validationErrors.bankAccountOwnership =
        "Select an account ownership option";
    if (!form.bankTransferDisclaimerAccepted) {
      validationErrors.bankTransferDisclaimerAccepted =
        "Please confirm the transfer-account responsibility statement";
    }
    if (form.subjectIds.length === 0)
      validationErrors.subjects = "Select at least one child subject";
    const requiredRates =
      form.modality === "both"
        ? ["online", "offline"]
        : form.modality
          ? [form.modality]
          : [];
    if (
      requiredRates.some(
        (key) =>
          typeof form.baseRatesIdr[key as "online" | "offline"] !== "number",
      )
    ) {
      validationErrors.baseRatesIdr =
        "Add a valid IDR base honorarium for each selected modality";
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      toastManager.add({
        title: "Please fill all required fields",
        type: "error",
      });
      const firstError = Object.keys(validationErrors)[0];
      const focusTarget =
        firstError === "subjects"
          ? "tutor-subject-category"
          : firstError === "education"
            ? "tutor-achievements-university-0"
            : firstError === "competitionAchievements"
              ? "tutor-achievements-competition-0"
              : `tutor-${firstError}`;
      window.setTimeout(() => document.getElementById(focusTarget)?.focus(), 0);
      return;
    }

    try {
      await updateMutation.mutateAsync(getSavePayload());
      await submitMutation.mutateAsync();
    } catch {
      // handled by mutation callbacks
    }
  }

  async function uploadSourcePhoto(file: File) {
    setIsUploadingPhoto(true);
    try {
      const signed = await client.upload.createUploadUrl({
        filename: file.name,
        contentType: file.type as "image/png" | "image/jpeg" | "image/webp",
      });
      if (file.size > signed.maxBytes)
        throw new Error("Photo is larger than 5 MB");
      if (signed.method === "POST") {
        const body = new FormData();
        Object.entries(signed.fields ?? {}).forEach(([key, value]) =>
          body.append(key, value),
        );
        body.append("file", file);
        const response = await fetch(signed.uploadUrl, {
          method: "POST",
          body,
        });
        if (!response.ok) throw new Error("Photo upload failed");
      } else {
        const response = await fetch(signed.uploadUrl, {
          method: signed.method,
          headers: { "content-type": file.type },
          body: file,
        });
        if (!response.ok) throw new Error("Photo upload failed");
      }
      setForm((current) => ({ ...current, sourcePhotoUrl: signed.publicUrl }));
      clearError("sourcePhotoUrl");
      toastManager.add({ title: "Source photo uploaded", type: "success" });
    } catch (error) {
      toastManager.add({
        title: "Photo could not be uploaded",
        description: getUserFacingError(error),
        type: "error",
      });
    } finally {
      setIsUploadingPhoto(false);
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
            ? "Your profile is live. Important changes are waiting for admin review; students still see the approved version."
            : profile.profileEditStatus === "changes_requested"
              ? "Your profile is live, but the admin requested revisions to your proposed changes."
              : "Your tutor profile is live. You can update it anytime; important changes are reviewed before going live."
          : profile.onboardingStatus === "suspended"
            ? "Your tutor profile has been suspended. Please contact admin for details."
            : "Your profile status will appear here as it moves through review.";
  const hasReviewFeedback =
    (profile.adminReviewNote &&
      profile.onboardingStatus === "changes_requested") ||
    (profile.profileEditAdminNote &&
      profile.profileEditStatus === "changes_requested");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
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

      <AccountIdentityCard
        idPrefix="tutor-account"
        roleLabel="Tutor"
        name={accountForm.name}
        email={accountUser.email}
        image={accountForm.image}
        hasChanges={accountChanged}
        isSaving={accountMutation.isPending}
        footerNote="Your account name and photo are separate from the public tutor profile review."
        onNameChange={(name) =>
          setAccountForm((current) => ({ ...current, name }))
        }
        onImageChange={(image) =>
          setAccountForm((current) => ({ ...current, image }))
        }
        imageEditable={false}
        onSave={() => accountMutation.mutate()}
      />

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

      {isEditable ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            updateMutation.mutate(getSavePayload());
          }}
          className="flex flex-col gap-6"
        >
          <div className="grid gap-6 xl:grid-cols-2">
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
                  <FieldLabel htmlFor="tutor-display-name">
                    Display name <span aria-hidden="true">*</span>
                  </FieldLabel>
                  <Input
                    id="tutor-display-name"
                    name="displayName"
                    autoComplete="name"
                    value={form.displayName}
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        displayName: event.target.value,
                      }));
                      clearError("displayName");
                    }}
                    placeholder="How students will see your name"
                    aria-invalid={Boolean(errors.displayName)}
                  />
                  {errors.displayName ? (
                    <FieldError>{errors.displayName}</FieldError>
                  ) : null}
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="tutor-achievements">
                    Achievements <span aria-hidden="true">*</span>
                  </FieldLabel>
                  <FieldDescription>
                    Add one achievement per line. A structured editor will Add
                    non-competition achievements here, one per line.
                  </FieldDescription>
                  <Textarea
                    id="tutor-achievements"
                    name="achievements"
                    value={form.achievements}
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        achievements: event.target.value,
                      }));
                      clearError("achievements");
                    }}
                    rows={8}
                    placeholder="Mahasiswa Berprestasi Universitas Airlangga (Surabaya, 2025)"
                    aria-invalid={Boolean(errors.achievements)}
                  />
                  {errors.achievements ? (
                    <FieldError>{errors.achievements}</FieldError>
                  ) : null}
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="tutor-achievement-proofs">
                    Achievement proof links
                  </FieldLabel>
                  <FieldDescription>
                    Optional. Add one public certificate, result, or portfolio
                    URL per line. These links are only used for admin
                    verification.
                  </FieldDescription>
                  <Textarea
                    id="tutor-achievement-proofs"
                    name="achievementProofUrls"
                    rows={3}
                    value={form.achievementProofUrls.join("\n")}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        achievementProofUrls: event.target.value
                          .split(/\r?\n/)
                          .map((url) => url.trim())
                          .filter(Boolean),
                      }))
                    }
                    placeholder="https://example.com/certificate"
                  />
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="tutor-experiences">
                    Experiences <span aria-hidden="true">*</span>
                  </FieldLabel>
                  <FieldDescription>
                    Add one experience per line.
                  </FieldDescription>
                  <Textarea
                    id="tutor-experiences"
                    name="experiences"
                    rows={6}
                    value={form.experiences}
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        experiences: event.target.value,
                      }));
                      clearError("experiences");
                    }}
                    placeholder="Legal GRC Intern, PT Pelindo Energi Logistik (Surabaya, 2025)"
                    aria-invalid={Boolean(errors.experiences)}
                  />
                  {errors.experiences ? (
                    <FieldError>{errors.experiences}</FieldError>
                  ) : null}
                </Field>

                <Field className="sm:col-span-2">
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
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        experienceProofUrls: event.target.value
                          .split(/\r?\n/)
                          .map((url) => url.trim())
                          .filter(Boolean),
                      }))
                    }
                    placeholder="https://example.com/reference"
                  />
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
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        shortBio: event.target.value,
                      }));
                      clearError("shortBio");
                    }}
                    placeholder="Brief introduction about yourself"
                    aria-invalid={Boolean(errors.shortBio)}
                  />
                  {errors.shortBio ? (
                    <FieldError>{errors.shortBio}</FieldError>
                  ) : null}
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="tutor-subject-category">
                    Subjects and competition tracks *
                  </FieldLabel>
                  <FieldDescription>
                    Select the competition subcategories you teach. Students
                    will see these on your tutor profile.
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
                    <SelectTrigger id="tutor-modality">
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
                    <FieldError>{errors.modality}</FieldError>
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
                      aria-invalid={Boolean(errors.bankName)}
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
                      <FieldError>{errors.bankName}</FieldError>
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
                      aria-invalid={Boolean(errors.bankAccountNumber)}
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
                      <FieldError>{errors.bankAccountNumber}</FieldError>
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
                      aria-invalid={Boolean(errors.bankAccountHolderName)}
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          bankAccountHolderName: event.target.value,
                        }));
                        clearError("bankAccountHolderName");
                      }}
                    />
                    {errors.bankAccountHolderName ? (
                      <FieldError>{errors.bankAccountHolderName}</FieldError>
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
                      aria-invalid={Boolean(errors.bankAccountOpeningCity)}
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          bankAccountOpeningCity: event.target.value,
                        }));
                        clearError("bankAccountOpeningCity");
                      }}
                    />
                    {errors.bankAccountOpeningCity ? (
                      <FieldError>{errors.bankAccountOpeningCity}</FieldError>
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
                    <FieldError>{errors.bankAccountOwnership}</FieldError>
                  ) : null}
                </Field>

                <div className="flex items-start gap-3 rounded-lg border border-item-border bg-item p-4">
                  <Checkbox
                    id="tutor-bankTransferDisclaimerAccepted"
                    checked={form.bankTransferDisclaimerAccepted}
                    onCheckedChange={(checked) => {
                      setForm((current) => ({
                        ...current,
                        bankTransferDisclaimerAccepted: checked === true,
                      }));
                      clearError("bankTransferDisclaimerAccepted");
                    }}
                  />
                  <div className="min-w-0">
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
                      <FieldError>
                        {errors.bankTransferDisclaimerAccepted}
                      </FieldError>
                    ) : null}
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          <Card className="min-w-0">
            <CardHeader>
              <IconBox variant="info-subtle">
                <IconSchool aria-hidden="true" />
              </IconBox>
              <CardTitle>Tutor achievements</CardTitle>
              <CardDescription>
                Give students a clear, consistent record of your education and
                strongest competition results.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <TutorAchievementsEditor
                education={form.education}
                competitionAchievements={form.competitionAchievements}
                onEducationChange={(education) => {
                  setForm((current) => ({ ...current, education }));
                  clearError("education");
                }}
                onCompetitionAchievementsChange={(competitionAchievements) => {
                  setForm((current) => ({
                    ...current,
                    competitionAchievements,
                  }));
                  clearError("competitionAchievements");
                }}
                errors={{
                  education: errors.education,
                  competitionAchievements: errors.competitionAchievements,
                }}
              />
            </CardBody>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <IconBox variant="tertiary-subtle">
                <IconPhoto aria-hidden="true" />
              </IconBox>
              <CardTitle>Source profile photo</CardTitle>
              <CardDescription>
                Upload the original photo for the Cogito team to edit. It will
                not be shown publicly until an admin publishes the edited
                version.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <Field>
                <FieldLabel htmlFor="tutor-source-photo">
                  Original photo <span aria-hidden="true">*</span>
                </FieldLabel>
                <FieldDescription>
                  JPG, PNG, or WebP, maximum 5 MB. Use a clear, high-resolution
                  portrait.
                </FieldDescription>
                <Input
                  id="tutor-source-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={isUploadingPhoto}
                  aria-invalid={Boolean(errors.sourcePhotoUrl)}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadSourcePhoto(file);
                  }}
                />
                {form.sourcePhotoUrl ? (
                  <Text className="text-sm text-success">
                    Photo received and ready for admin editing.
                  </Text>
                ) : null}
                {errors.sourcePhotoUrl ? (
                  <FieldError>{errors.sourcePhotoUrl}</FieldError>
                ) : null}
              </Field>
            </CardBody>
          </Card>

          <Card className="sticky bottom-4 z-10 overflow-hidden">
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
                    : "Save public changes here; trust-sensitive edits may wait for admin review."}
                </Text>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button
                  type="submit"
                  variant={isDraft ? "secondary" : "primary"}
                  className="w-full sm:w-auto"
                  progress={updateMutation.isPending}
                  disabled={
                    updateMutation.isPending || submitMutation.isPending
                  }
                >
                  {isDraft ? "Save draft" : "Save profile changes"}
                </Button>
                {isDraft ? (
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    progress={submitMutation.isPending}
                    disabled={
                      updateMutation.isPending || submitMutation.isPending
                    }
                    onClick={handleSubmitForReview}
                  >
                    Submit for review
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
