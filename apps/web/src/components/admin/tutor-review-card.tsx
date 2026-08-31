"use client";

import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  CardHeader,
  CardHeaderAction,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@cogito-app/ui/components/selia/dialog";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import {
  IconAlertTriangle,
  IconCertificate,
  IconCoins,
  IconMail,
  IconSchool,
} from "@tabler/icons-react";

import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";
import {
  TutorAchievementsDisplay,
  TutorAchievementsEditor,
  type TutorCompetitionAchievement,
  type TutorEducationEntry,
  validateTutorAchievementDraft,
} from "@/components/tutor/tutor-achievements";
import {
  TutorExperiencesDisplay,
  type TutorExperienceEntry,
} from "@/components/tutor/tutor-experiences";

const FLOOR_ONLINE: Record<string, number> = {
  "1": 42,
  "2": 35,
  "3": 28,
  "4": 24,
  "5": 21,
  "6": 19,
};
const FLOOR_OFFLINE: Record<string, number> = {
  "1": 50,
  "2": 45,
  "3": 40,
  "4": 35,
  "5": 30,
  "6": 27,
};
const NON_BCA_TRANSFER_FEE_IDR = 2_500;

const STATUS_BADGE: Record<
  string,
  {
    label: string;
    variant:
      | "primary"
      | "secondary"
      | "danger"
      | "warning"
      | "success"
      | "info";
  }
> = {
  draft: { label: "Draft", variant: "secondary" },
  pending_review: { label: "Needs review", variant: "warning" },
  changes_requested: { label: "Changes requested", variant: "danger" },
  approved_unpublished: { label: "Approved", variant: "info" },
  published: { label: "Published", variant: "success" },
  suspended: { label: "Suspended", variant: "danger" },
};

interface TutorReviewCardProps {
  profile: {
    id: string;
    displayName: string | null;
    shortBio: string | null;
    credentialsSummary: string | null;
    achievements: string | null;
    experiences: string | null;
    achievementProofUrls: string[] | null;
    experienceProofUrls: string[] | null;
    education: TutorEducationEntry[] | null;
    competitionAchievements: TutorCompetitionAchievement[] | null;
    experienceEntries: TutorExperienceEntry[] | null;
    expertise: string[] | null;
    modality: string | null;
    bankName: string | null;
    bankAccountNumber: string | null;
    bankAccountHolderName: string | null;
    bankAccountOpeningCity: string | null;
    bankAccountOwnership: "self" | "trusted_person" | null;
    bankTransferDisclaimerAccepted: boolean | null;
    prices: Record<string, number> | null;
    availabilitySummary: string | null;
    sourcePhotoUrl: string | null;
    onboardingStatus: string;
    adminReviewNote: string | null;
    pendingProfileChanges: Record<string, unknown> | null;
    profileEditStatus: string;
    profileEditAdminNote: string | null;
    version: number;
    user?: { id: string; name: string; email: string } | null;
  };
  subjectLabels: ReadonlyMap<string, string>;
  onAction?: () => void;
  footerTarget?: HTMLElement | null;
}

function getInitials(name?: string | null) {
  return (name ?? "Tutor")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readEducationEntries(value: unknown): TutorEducationEntry[] | null {
  if (!Array.isArray(value)) return null;

  const entries: TutorEducationEntry[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.university !== "string" ||
      typeof entry.degree !== "string"
    ) {
      return null;
    }
    entries.push({ university: entry.university, degree: entry.degree });
  }
  return entries;
}

function readCompetitionAchievements(
  value: unknown,
): TutorCompetitionAchievement[] | null {
  if (!Array.isArray(value)) return null;

  const entries: TutorCompetitionAchievement[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.competitionName !== "string" ||
      typeof entry.year !== "number" ||
      !Array.isArray(entry.awards) ||
      entry.awards.some((award) => typeof award !== "string")
    ) {
      return null;
    }
    entries.push({
      competitionName: entry.competitionName,
      year: entry.year,
      awards: entry.awards,
    });
  }
  return entries;
}

function readExperienceEntries(value: unknown): TutorExperienceEntry[] | null {
  if (!Array.isArray(value)) return null;

  const entries: TutorExperienceEntry[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.role !== "string" ||
      typeof entry.organization !== "string" ||
      typeof entry.startYear !== "number" ||
      (entry.endYear !== null && typeof entry.endYear !== "number") ||
      typeof entry.description !== "string"
    ) {
      return null;
    }
    entries.push({
      role: entry.role,
      organization: entry.organization,
      startYear: entry.startYear,
      endYear: entry.endYear,
      description: entry.description,
    });
  }
  return entries;
}

function formatPendingField(field: string) {
  if (field === "subjectIds") return "Subjects";
  return field.replace(/([A-Z])/g, " $1");
}

function PendingChangeValue({
  field,
  value,
  subjectLabels,
  idPrefix,
}: {
  field: string;
  value: unknown;
  subjectLabels: ReadonlyMap<string, string>;
  idPrefix: string;
}) {
  if (field === "subjectIds" && Array.isArray(value)) {
    return (
      <div
        className="flex min-w-0 flex-wrap gap-1.5"
        aria-label="Proposed subjects"
      >
        {value.map((subjectId) => {
          const id = String(subjectId);
          return (
            <Badge
              key={id}
              variant="secondary"
              className="h-auto min-h-5.5 max-w-full whitespace-normal break-words py-0.5"
            >
              {subjectLabels.get(id) ?? "Subject unavailable"}
            </Badge>
          );
        })}
      </div>
    );
  }

  if (field === "education") {
    const entries = readEducationEntries(value);
    if (entries) {
      return (
        <TutorAchievementsDisplay
          education={entries}
          competitionAchievements={[]}
          idPrefix={`${idPrefix}-education`}
        />
      );
    }
  }

  if (field === "competitionAchievements") {
    const entries = readCompetitionAchievements(value);
    if (entries) {
      return (
        <TutorAchievementsDisplay
          education={[]}
          competitionAchievements={entries}
          idPrefix={`${idPrefix}-competition`}
        />
      );
    }
  }

  if (field === "experienceEntries") {
    const entries = readExperienceEntries(value);
    if (entries) {
      return (
        <TutorExperiencesDisplay
          experienceEntries={entries}
          idPrefix={`${idPrefix}-experiences`}
        />
      );
    }
  }

  const displayValue =
    value === null || value === undefined
      ? "—"
      : Array.isArray(value)
        ? value.map((entry) => String(entry)).join(", ")
        : typeof value === "object"
          ? (JSON.stringify(value) ?? "—")
          : String(value);

  return (
    <Text className="break-words text-sm font-medium">{displayValue}</Text>
  );
}

export function TutorReviewCard({
  profile,
  subjectLabels,
  onAction,
  footerTarget,
}: TutorReviewCardProps) {
  const queryClient = useQueryClient();
  const pendingPayout = useQuery({
    ...orpc.admin.getPendingTutorPayouts.queryOptions({
      input: { tutorId: profile.user?.id ?? "" },
    }),
    enabled: Boolean(profile.user?.id),
  });
  const markPayoutMutation = useMutation(
    orpc.admin.markTutorPayoutPaid.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: orpc.admin.getPendingTutorPayouts.key(),
        });
        toastManager.add({
          title: "Tutor payout marked as paid",
          type: "success",
        });
      },
      onError: (error: unknown) => {
        toastManager.add({
          title: "Tutor payout could not be marked paid",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );
  const [noteAction, setNoteAction] = useState<
    "request_changes" | "request_edit_changes" | "suspend" | null
  >(null);
  const [adminNote, setAdminNote] = useState("");
  const [publicPhotoUrl, setPublicPhotoUrl] = useState("");
  const reviewMutation = useMutation(
    orpc.adminTutor.reviewTutorProfile.mutationOptions({
      onSuccess: () => {
        setNoteAction(null);
        setAdminNote("");
        void queryClient.invalidateQueries({
          queryKey: orpc.adminTutor.listTutorProfiles.key(),
        });
        toastManager.add({ title: "Tutor profile updated", type: "success" });
        onAction?.();
      },
      onError: (error: unknown) => {
        toastManager.add({
          title: "Tutor profile could not be updated",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );
  const [achievementsEditOpen, setAchievementsEditOpen] = useState(false);
  const [achievementDraft, setAchievementDraft] = useState({
    education: [] as TutorEducationEntry[],
    competitionAchievements: [] as TutorCompetitionAchievement[],
  });
  const achievementsUpdateMutation = useMutation(
    orpc.adminTutor.updateTutorAchievements.mutationOptions({
      onSuccess: () => {
        setAchievementsEditOpen(false);
        void queryClient.invalidateQueries({
          queryKey: orpc.adminTutor.listTutorProfiles.key(),
        });
        toastManager.add({
          title: "Tutor achievements updated",
          description: "The corrected format is now ready for review.",
          type: "success",
        });
        onAction?.();
      },
      onError: (error: unknown) => {
        toastManager.add({
          title: "Tutor achievements could not be updated",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );

  function openAchievementsEditor() {
    const pendingEducation = readEducationEntries(
      profile.pendingProfileChanges?.education,
    );
    const pendingCompetitionAchievements = readCompetitionAchievements(
      profile.pendingProfileChanges?.competitionAchievements,
    );
    setAchievementDraft({
      education: pendingEducation ?? profile.education ?? [],
      competitionAchievements:
        pendingCompetitionAchievements ?? profile.competitionAchievements ?? [],
    });
    setAchievementsEditOpen(true);
  }

  function saveAchievements() {
    const validation = validateTutorAchievementDraft(
      achievementDraft.education,
      achievementDraft.competitionAchievements,
    );
    if (validation.education || validation.competitionAchievements) {
      toastManager.add({
        title: "Check the achievement entries",
        description: validation.education ?? validation.competitionAchievements,
        type: "error",
      });
      return;
    }

    achievementsUpdateMutation.mutate({
      tutorProfileId: profile.id,
      version: profile.version,
      education: achievementDraft.education.map((entry) => ({
        university: entry.university.trim(),
        degree: entry.degree.trim(),
      })),
      competitionAchievements: achievementDraft.competitionAchievements.map(
        (entry) => ({
          competitionName: entry.competitionName.trim(),
          year: entry.year,
          awards: entry.awards.map((award) => award.trim()),
        }),
      ),
    });
  }

  function handleAction(
    action:
      | "request_changes"
      | "approve_unpublished"
      | "publish"
      | "unpublish"
      | "suspend"
      | "approve_edits"
      | "request_edit_changes",
    note?: string,
  ) {
    reviewMutation.mutate({
      tutorProfileId: profile.id,
      action,
      adminNote: note,
      publicPhotoUrl: publicPhotoUrl.trim() || undefined,
    });
  }

  function submitNoteAction() {
    const note = adminNote.trim();
    if (noteAction && note) handleAction(noteAction, note);
  }

  const badge =
    profile.profileEditStatus === "pending_review"
      ? ({ label: "Edit review", variant: "warning" } as const)
      : (STATUS_BADGE[profile.onboardingStatus] ?? {
          label: profile.onboardingStatus,
          variant: "secondary" as const,
        });
  const floorPrices =
    profile.modality === "offline" ? FLOOR_OFFLINE : FLOOR_ONLINE;
  const priceEntries = Object.entries(profile.prices ?? {}).toSorted(
    ([a], [b]) => Number(a) - Number(b),
  );
  const reviewAction = reviewMutation.variables?.action;
  const isPending = reviewMutation.isPending;
  const hasCompletePayoutDetails = Boolean(
    profile.bankName?.trim() &&
    profile.bankAccountNumber?.trim() &&
    profile.bankAccountHolderName?.trim() &&
    profile.bankAccountOpeningCity?.trim() &&
    profile.bankAccountOwnership &&
    profile.bankTransferDisclaimerAccepted,
  );
  const pendingHonorarium = pendingPayout.data?.tutorPayoutIdr ?? 0;
  const usesBca = profile.bankName?.trim().toUpperCase() === "BCA";
  const transferFee =
    pendingHonorarium > 0 && profile.bankName?.trim() && !usesBca
      ? NON_BCA_TRANSFER_FEE_IDR
      : 0;
  const netHonorarium = Math.max(0, pendingHonorarium - transferFee);

  return (
    <>
      <Card className="flex min-w-0 flex-col overflow-hidden">
        <CardHeader className="items-start">
          <Avatar>
            <AvatarImage
              src={profile.sourcePhotoUrl ?? undefined}
              alt="Tutor source portrait"
            />
            <AvatarFallback>
              {getInitials(profile.displayName ?? profile.user?.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <CardTitle className="truncate">
              {profile.displayName ?? profile.user?.name ?? "Unnamed tutor"}
            </CardTitle>
            {profile.user ? (
              <div className="mt-1 flex items-center gap-1.5 text-muted">
                <IconMail className="size-3.5 shrink-0" />
                <Text className="truncate text-sm">{profile.user.email}</Text>
              </div>
            ) : null}
          </div>
          <CardHeaderAction>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </CardHeaderAction>
        </CardHeader>

        <CardBody className="flex-1">
          <Stack direction="column" spacing="md" className="m-0!">
            <Text
              className={
                profile.shortBio
                  ? "leading-relaxed text-muted"
                  : "italic text-dimmed"
              }
            >
              {profile.shortBio ?? "No tutor introduction provided."}
            </Text>

            <div className="grid gap-3 sm:grid-cols-2">
              <ReviewDetail
                icon={<IconSchool />}
                label="Teaching mode"
                value={
                  profile.modality
                    ? `${profile.modality} sessions`
                    : "Not specified"
                }
                capitalize={Boolean(profile.modality)}
              />
            </div>

            <section className="rounded-lg border border-item-border bg-item p-3">
              <div className="flex items-center gap-2">
                <IconCoins className="size-4 text-muted" />
                <Text className="text-xs font-semibold uppercase tracking-wide text-dimmed">
                  Unpaid honorarium
                </Text>
              </div>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <Text className="text-xs text-muted">
                    {pendingPayout.data?.completedSessions ?? 0} completed
                    session(s)
                    {profile.bankName
                      ? ` · ${profile.bankName}`
                      : " · Bank not set"}
                  </Text>
                  <div className="mt-2 grid gap-1 text-sm">
                    <div className="flex items-center justify-between gap-6">
                      <Text className="text-muted">Gross honorarium</Text>
                      <Text className="font-semibold">
                        Rp{pendingHonorarium.toLocaleString("id-ID")}
                      </Text>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <Text className="text-muted">Transfer fee</Text>
                      <Text className="font-medium">
                        {transferFee > 0
                          ? `−Rp${transferFee.toLocaleString("id-ID")}`
                          : "Rp0"}
                      </Text>
                    </div>
                    <div className="flex items-center justify-between gap-6 border-t border-item-border pt-1">
                      <Text className="font-medium">Net to transfer</Text>
                      <Text className="font-semibold">
                        Rp{netHonorarium.toLocaleString("id-ID")}
                      </Text>
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  progress={markPayoutMutation.isPending}
                  disabled={
                    markPayoutMutation.isPending ||
                    pendingHonorarium <= 0 ||
                    !hasCompletePayoutDetails
                  }
                  onClick={() => {
                    if (profile.user?.id) {
                      markPayoutMutation.mutate({ tutorId: profile.user.id });
                    }
                  }}
                >
                  Mark as paid
                </Button>
              </div>
              <Text className="mt-3 text-xs text-muted">
                Only conventional BCA (enter BCA as the bank name) has no
                transfer deduction. BCA Syariah, blu (BCA Digital), and other
                banks deduct Rp2.500 once from this payout; mark as paid after
                transferring the net amount.
              </Text>
              {profile.bankAccountNumber ? (
                <Text className="mt-2 text-xs text-muted">
                  Account ending in {profile.bankAccountNumber.slice(-4)}
                </Text>
              ) : null}
              {profile.bankAccountHolderName ? (
                <Text className="mt-1 text-xs text-muted">
                  Account holder: {profile.bankAccountHolderName}
                </Text>
              ) : null}
              {profile.bankAccountOpeningCity ? (
                <Text className="mt-1 text-xs text-muted">
                  Opened in: {profile.bankAccountOpeningCity}
                </Text>
              ) : null}
              {profile.bankAccountOwnership ? (
                <Text className="mt-1 text-xs text-muted">
                  Ownership:{" "}
                  {profile.bankAccountOwnership === "self"
                    ? "Tutor's own account"
                    : "Trusted person's account"}
                </Text>
              ) : null}
              {!hasCompletePayoutDetails ? (
                <Text className="mt-2 text-xs text-warning">
                  Tutor must complete and confirm all payout account details
                  before transfer.
                </Text>
              ) : null}
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2">
                <IconCertificate className="size-4 text-muted" />
                <Text className="text-xs font-semibold uppercase tracking-wide text-dimmed">
                  Achievements
                </Text>
              </div>
              <Text
                className={
                  profile.credentialsSummary
                    ? "text-sm"
                    : "text-sm italic text-dimmed"
                }
              >
                {profile.achievements ??
                  profile.credentialsSummary ??
                  "No achievements provided."}
              </Text>
            </section>

            <ProofLinks
              label="Achievement proof"
              urls={profile.achievementProofUrls}
            />

            {profile.experienceEntries?.length ? (
              <TutorExperiencesDisplay
                experienceEntries={profile.experienceEntries}
                idPrefix={`admin-${profile.id}-experiences`}
              />
            ) : (
              <section>
                <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
                  Experiences
                </Text>
                <Text
                  className={
                    profile.experiences
                      ? "whitespace-pre-line text-sm"
                      : "text-sm italic text-dimmed"
                  }
                >
                  {profile.experiences ?? "No experiences provided."}
                </Text>
              </section>
            )}

            <ProofLinks
              label="Experience proof"
              urls={profile.experienceProofUrls}
            />

            <section>
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
                Edited public photo
              </Text>
              {profile.sourcePhotoUrl ? (
                <a
                  href={profile.sourcePhotoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm underline underline-offset-2"
                >
                  Download original tutor photo
                </a>
              ) : (
                <Text className="text-sm italic text-dimmed">
                  No source photo uploaded.
                </Text>
              )}
              <Input
                className="mt-2"
                type="url"
                value={publicPhotoUrl}
                onChange={(event) => setPublicPhotoUrl(event.target.value)}
                placeholder="Paste the edited public image URL"
                aria-label="Edited public tutor photo URL"
              />
              <Text className="mt-1 text-xs text-muted">
                Only this admin-provided image can replace the tutor's public
                photo.
              </Text>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-dimmed">
                  Tutor achievements
                </Text>
                <Button
                  type="button"
                  variant="plain"
                  size="xs"
                  onClick={openAchievementsEditor}
                >
                  Edit format
                </Button>
              </div>
              <TutorAchievementsDisplay
                education={profile.education}
                competitionAchievements={profile.competitionAchievements}
                idPrefix={`admin-${profile.id}-achievements`}
                emptyMessage="No structured education or competition achievements provided."
              />
            </section>

            <section>
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
                Expertise
              </Text>
              {profile.expertise?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.expertise.map((expertise) => (
                    <Badge key={expertise} variant="secondary">
                      {expertise}
                    </Badge>
                  ))}
                </div>
              ) : (
                <Text className="text-sm italic text-dimmed">
                  No subjects listed.
                </Text>
              )}
            </section>

            <section>
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
                Marks per student
              </Text>
              {priceEntries.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {priceEntries.map(([size, price]) => {
                    const floor = floorPrices[size];
                    const belowFloor = floor !== undefined && price < floor;
                    return (
                      <div
                        key={size}
                        className="rounded-lg border border-item-border bg-item p-2.5"
                      >
                        <Text className="text-xs text-muted">
                          {size} {size === "1" ? "student" : "students"}
                        </Text>
                        <Text
                          className={
                            belowFloor
                              ? "mt-0.5 font-semibold text-danger"
                              : "mt-0.5 font-semibold"
                          }
                        >
                          {price} Marks
                        </Text>
                        <Text
                          className={
                            belowFloor
                              ? "mt-1 flex items-center gap-1 text-xs text-danger"
                              : "mt-1 text-xs text-dimmed"
                          }
                        >
                          {belowFloor ? (
                            <IconAlertTriangle className="size-3" />
                          ) : null}
                          Minimum {floor ?? "—"}
                        </Text>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Text className="text-sm italic text-dimmed">
                  No price list provided.
                </Text>
              )}
            </section>

            {profile.adminReviewNote ? (
              <div className="rounded-lg border border-warning-border bg-warning/10 p-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-warning">
                  Latest review note
                </Text>
                <Text className="mt-1 text-sm">{profile.adminReviewNote}</Text>
              </div>
            ) : null}
            {profile.pendingProfileChanges ? (
              <section className="rounded-lg border border-warning-border bg-warning/10 p-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-warning">
                  Proposed profile changes
                </Text>
                <Stack spacing="sm" className="mt-2">
                  {Object.entries(profile.pendingProfileChanges).map(
                    ([field, value]) => (
                      <div key={field} className="min-w-0">
                        <Text className="text-xs capitalize text-muted">
                          {formatPendingField(field)}
                        </Text>
                        <PendingChangeValue
                          field={field}
                          value={value}
                          subjectLabels={subjectLabels}
                          idPrefix={`admin-${profile.id}-pending-${field}`}
                        />
                      </div>
                    ),
                  )}
                </Stack>
                {profile.profileEditAdminNote ? (
                  <Text className="mt-2 text-sm">
                    {profile.profileEditAdminNote}
                  </Text>
                ) : null}
              </section>
            ) : null}
          </Stack>
        </CardBody>

        {footerTarget
          ? createPortal(
              <>
                {profile.onboardingStatus === "published" &&
                profile.profileEditStatus === "pending_review" ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setNoteAction("request_edit_changes")}
                      disabled={isPending}
                    >
                      Request revision
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleAction("approve_edits")}
                      progress={isPending && reviewAction === "approve_edits"}
                      disabled={isPending}
                    >
                      Approve changes
                    </Button>
                  </>
                ) : null}
                {profile.onboardingStatus === "pending_review" ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setNoteAction("request_changes")}
                      disabled={isPending}
                    >
                      Request changes
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleAction("approve_unpublished")}
                      progress={
                        isPending && reviewAction === "approve_unpublished"
                      }
                      disabled={isPending}
                    >
                      Approve profile
                    </Button>
                  </>
                ) : null}

                {profile.onboardingStatus === "approved_unpublished" ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setNoteAction("request_changes")}
                      disabled={isPending}
                    >
                      Request changes
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleAction("publish")}
                      progress={isPending && reviewAction === "publish"}
                      disabled={isPending}
                    >
                      Publish profile
                    </Button>
                  </>
                ) : null}

                {profile.onboardingStatus === "published" &&
                profile.profileEditStatus !== "pending_review" ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleAction("unpublish")}
                      progress={isPending && reviewAction === "unpublish"}
                      disabled={isPending}
                    >
                      Unpublish
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setNoteAction("suspend")}
                      disabled={isPending}
                    >
                      Suspend
                    </Button>
                  </>
                ) : null}
              </>,
              footerTarget,
            )
          : null}
      </Card>

      <Dialog
        open={noteAction !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) {
            setNoteAction(null);
            setAdminNote("");
          }
        }}
      >
        <DialogPopup>
          <DialogHeader className="flex-col items-start gap-1.5">
            <DialogTitle>
              {noteAction === "suspend"
                ? "Suspend tutor?"
                : noteAction === "request_edit_changes"
                  ? "Request revisions?"
                  : "Request profile changes?"}
            </DialogTitle>
            <DialogDescription>
              {noteAction === "suspend"
                ? "Explain why this tutor is being removed from discovery."
                : "Give clear, actionable feedback before the tutor resubmits."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field>
              <FieldLabel htmlFor="tutor-review-note">Review note</FieldLabel>
              <FieldDescription>
                This note will be visible to the tutor.
              </FieldDescription>
              <Input
                id="tutor-review-note"
                value={adminNote}
                onChange={(event) => setAdminNote(event.target.value)}
                placeholder={
                  noteAction === "suspend"
                    ? "Reason for suspension"
                    : "What needs to be updated?"
                }
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setNoteAction(null);
                setAdminNote("");
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant={noteAction === "suspend" ? "danger" : "primary"}
              onClick={submitNoteAction}
              progress={isPending}
              disabled={!adminNote.trim() || isPending}
            >
              {noteAction === "suspend" ? "Suspend tutor" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={achievementsEditOpen}
        onOpenChange={(open) => {
          if (!achievementsUpdateMutation.isPending)
            setAchievementsEditOpen(open);
        }}
      >
        <DialogPopup className="max-w-4xl">
          <DialogHeader className="flex-col items-start gap-1.5">
            <DialogTitle>Edit tutor achievements</DialogTitle>
            <DialogDescription>
              Normalize the education and competition entries before approving
              this tutor profile.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="min-h-0">
            <TutorAchievementsEditor
              education={achievementDraft.education}
              competitionAchievements={achievementDraft.competitionAchievements}
              onEducationChange={(education) =>
                setAchievementDraft((current) => ({ ...current, education }))
              }
              onCompetitionAchievementsChange={(competitionAchievements) =>
                setAchievementDraft((current) => ({
                  ...current,
                  competitionAchievements,
                }))
              }
              idPrefix={`admin-edit-${profile.id}-achievements`}
            />
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAchievementsEditOpen(false)}
              disabled={achievementsUpdateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveAchievements}
              progress={achievementsUpdateMutation.isPending}
              disabled={achievementsUpdateMutation.isPending}
            >
              Save achievements
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}

function ReviewDetail({
  icon,
  label,
  value,
  capitalize = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="rounded-lg bg-accent p-3">
      <div className="flex items-center gap-1.5 text-muted">
        {icon}
        <Text className="text-xs">{label}</Text>
      </div>
      <Text
        className={
          capitalize
            ? "mt-1 text-sm font-medium capitalize"
            : "mt-1 text-sm font-medium"
        }
      >
        {value}
      </Text>
    </div>
  );
}

function ProofLinks({ label, urls }: { label: string; urls: string[] | null }) {
  if (!urls?.length) return null;

  return (
    <section>
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
        {label}
      </Text>
      <ul className="space-y-1">
        {urls.map((url) => (
          <li key={url}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-sm underline underline-offset-2"
            >
              {url}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
