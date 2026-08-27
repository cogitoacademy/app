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
  IconCalendarClock,
  IconSchool,
  IconShieldCheck,
  IconUser,
} from "@tabler/icons-react";

import { authClient } from "@/lib/auth-client";
import { AccountIdentityCard } from "@/components/profile/account-identity-card";
import { EmptyState } from "@/components/empty-state";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";
import { TutorPricingFields } from "./tutor-pricing-fields";
import { SubjectSelector, type TutorSubject } from "./subject-taxonomy";

type Modality = "online" | "offline" | "both";

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
    expertise: string[];
    subjects?: TutorSubject[] | null;
    modality: string | null;
    baseRatesIdr: Partial<{ online: number; offline: number }> | null;
    prices: Record<string, number> | null;
    availabilitySummary: string | null;
    proofUrls: string[];
    onboardingStatus: string;
    adminReviewNote: string | null;
    pendingProfileChanges: Partial<{
      displayName: string;
      credentialsSummary: string;
      expertise: string[];
      subjectIds: string[];
      modality: Modality;
      baseRatesIdr: Partial<{ online: number; offline: number }>;
      prices: Record<string, number>;
      proofUrls: string[];
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
    credentialsSummary:
      pending.credentialsSummary ?? profile.credentialsSummary ?? "",
    expertise: pending.expertise ?? profile.expertise ?? [],
    subjectIds: initialSubjectIds,
    modality: (pending.modality ?? profile.modality ?? "") as Modality | "",
    baseRatesIdr: pending.baseRatesIdr ??
      profile.baseRatesIdr ?? {
        online: 175_000,
        offline: 225_000,
      },
    availabilitySummary: profile.availabilitySummary ?? "",
    proofUrls: pending.proofUrls ?? profile.proofUrls ?? [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newProofUrl, setNewProofUrl] = useState("");

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
          title: "Availability could not be saved",
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
      credentialsSummary?: string;
      expertise?: string[];
      subjectIds?: string[];
      modality?: Modality;
      baseRatesIdr?: Partial<{ online: number; offline: number }>;
      prices?: Record<string, number>;
      availabilitySummary?: string;
      proofUrls?: string[];
    } = { version: profile.version };
    const displayName = form.displayName.trim();
    const shortBio = form.shortBio.trim();
    const credentialsSummary = form.credentialsSummary.trim();
    const availabilitySummary = form.availabilitySummary.trim();

    if (displayName) payload.displayName = displayName;
    if (shortBio) payload.shortBio = shortBio;
    if (credentialsSummary) payload.credentialsSummary = credentialsSummary;
    if (form.expertise.length > 0) payload.expertise = form.expertise;
    if (
      form.subjectIds.length > 0 &&
      !haveSameSubjectIds(form.subjectIds, initialSubjectIds)
    ) {
      payload.subjectIds = form.subjectIds;
    }
    if (form.modality) payload.modality = form.modality;
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
    if (availabilitySummary) payload.availabilitySummary = availabilitySummary;
    if (form.proofUrls.length > 0) payload.proofUrls = form.proofUrls;
    return payload;
  }

  async function handleSubmitForReview() {
    const validationErrors: Record<string, string> = {};
    if (!form.displayName.trim()) validationErrors.displayName = "Required";
    if (!form.shortBio.trim()) validationErrors.shortBio = "Required";
    if (!form.credentialsSummary.trim())
      validationErrors.credentialsSummary = "Required";
    if (!form.modality) validationErrors.modality = "Required";
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

  function addProofUrl() {
    const proofUrl = newProofUrl.trim();
    if (!proofUrl || form.proofUrls.includes(proofUrl)) return;

    setForm((current) => ({
      ...current,
      proofUrls: [...current.proofUrls, proofUrl],
    }));
    setNewProofUrl("");
  }

  function removeProofUrl(url: string) {
    setForm((current) => ({
      ...current,
      proofUrls: current.proofUrls.filter((item) => item !== url),
    }));
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
            <Card className="min-w-0">
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

                <Field>
                  <FieldLabel htmlFor="tutor-credentials-summary">
                    Credentials summary <span aria-hidden="true">*</span>
                  </FieldLabel>
                  <Input
                    id="tutor-credentials-summary"
                    name="credentialsSummary"
                    value={form.credentialsSummary}
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        credentialsSummary: event.target.value,
                      }));
                      clearError("credentialsSummary");
                    }}
                    placeholder="Degrees, certifications, achievements"
                    aria-invalid={Boolean(errors.credentialsSummary)}
                  />
                  {errors.credentialsSummary ? (
                    <FieldError>{errors.credentialsSummary}</FieldError>
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
                  Set the session format and your IDR honorarium. Cogito
                  calculates the student Marks price from the active economy.
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
          </div>

          <Card className="min-w-0">
            <CardHeader>
              <IconBox variant="tertiary-subtle">
                <IconCalendarClock aria-hidden="true" />
              </IconBox>
              <CardTitle>Availability and proof</CardTitle>
              <CardDescription>
                Give students a useful scheduling hint and add optional evidence
                for admin review.
              </CardDescription>
            </CardHeader>
            <CardBody className="grid gap-6 lg:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="tutor-availability-summary">
                  Availability summary
                </FieldLabel>
                <FieldDescription>
                  A short guide; exact bookable windows are managed separately
                  in Availability.
                </FieldDescription>
                <Input
                  id="tutor-availability-summary"
                  name="availabilitySummary"
                  value={form.availabilitySummary}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      availabilitySummary: event.target.value,
                    }))
                  }
                  placeholder="e.g. Weekdays 3–6 PM, Saturdays 9 AM–12 PM"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="tutor-proof-url">
                  Credential proof URLs
                </FieldLabel>
                <FieldDescription>
                  Optional public links to certificates, portfolios, or results.
                </FieldDescription>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="tutor-proof-url"
                    name="proofUrl"
                    type="url"
                    autoComplete="url"
                    value={newProofUrl}
                    onChange={(event) => setNewProofUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addProofUrl();
                      }
                    }}
                    placeholder="https://..."
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0 sm:w-auto"
                    onClick={addProofUrl}
                    disabled={!newProofUrl.trim()}
                  >
                    Add link
                  </Button>
                </div>
                {form.proofUrls.length > 0 ? (
                  <ul
                    className="mt-2 flex flex-col gap-2"
                    aria-label="Credential proof links"
                  >
                    {form.proofUrls.map((url) => (
                      <li
                        key={url}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-item px-3 py-2"
                      >
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 truncate text-sm text-foreground underline underline-offset-2"
                        >
                          {url}
                        </a>
                        <Button
                          type="button"
                          variant="plain"
                          size="xs"
                          onClick={() => removeProofUrl(url)}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    icon={<IconShieldCheck />}
                    title="No proof links yet"
                    description="Add a public proof link when you have one, such as a certificate or portfolio."
                    tone="secondary"
                    size="inline"
                    className="mt-2 rounded-lg border border-item-border"
                  />
                )}
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
