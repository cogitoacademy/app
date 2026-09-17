"use client";

import { type ReactNode, useState } from "react";
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
  CardFooter,
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
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cogito-app/ui/components/selia/table";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { IconAlertTriangle, IconMail } from "@tabler/icons-react";

import { getUserFacingError } from "@/lib/error-message";
import { CogitoMarks } from "@/components/cogito-marks";
import { getCompetitionFieldClass } from "@/lib/competition-colors";
import { resolveProfileImageUrl } from "@/lib/profile-image-url";
import { cn } from "@cogito-app/ui/lib/utils";
import { client, orpc } from "@/utils/orpc";
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
import { ProfilePhotoHistory } from "@/components/tutor/profile-photo-history";

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

const MODALITY_LABELS: Record<string, string> = {
  online: "Online",
  offline: "Offline (Campus)",
  both: "Online & Offline",
};

const MODALITY_VARIANTS: Record<string, "info" | "success" | "warning"> = {
  online: "info",
  offline: "success",
  both: "warning",
};

interface TutorReviewCardProps {
  profile: {
    id: string;
    shortBio: string | null;
    achievementProofUrls: string[] | null;
    experienceProofUrls: string[] | null;
    education: TutorEducationEntry[] | null;
    competitionAchievements: TutorCompetitionAchievement[] | null;
    experienceEntries: TutorExperienceEntry[] | null;
    subjects?: Array<{
      subject: {
        id: string;
        name: string;
        slug: string;
        parent?: { name: string; slug: string } | null;
      };
    }> | null;
    modality: string | null;
    bankName: string | null;
    bankAccountNumber: string | null;
    bankAccountHolderName: string | null;
    bankAccountOpeningCity: string | null;
    bankAccountOwnership: "self" | "trusted_person" | null;
    bankTransferDisclaimerAccepted: boolean | null;
    prices: Record<string, number> | null;
    baseRatesIdr: Partial<{ online: number; offline: number }> | null;
    onboardingStatus: string;
    adminReviewNote: string | null;
    pendingProfileChanges: Record<string, unknown> | null;
    profileEditStatus: string;
    profileEditAdminNote: string | null;
    version: number;
    user?: {
      id: string;
      name: string;
      email: string;
      image: string | null;
    } | null;
  };
  subjectLabels: ReadonlyMap<string, string>;
  subjectFieldSlugs?: ReadonlyMap<string, string>;
  onAction?: () => void;
}

function getInitials(name?: string | null) {
  const cleaned = (name ?? "Tutor").replace(/[^a-zA-Z\s]/g, "");
  return cleaned
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

function readProfileImageUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function PhotoReviewPanel({
  label,
  description,
  imageUrl,
  fallback,
  proposed = false,
}: {
  label: string;
  description: string;
  imageUrl: string | null;
  fallback: string;
  proposed?: boolean;
}) {
  const resolvedImageUrl = resolveProfileImageUrl(imageUrl);

  return (
    <div className="rounded-lg border border-item-border bg-item p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <Text className="text-sm font-medium">{label}</Text>
          <Text className="text-xs text-muted">{description}</Text>
        </div>
        {proposed ? (
          <Badge variant="warning" size="sm" pill>
            Pending
          </Badge>
        ) : null}
      </div>
      {resolvedImageUrl ? (
        <a href={resolvedImageUrl} target="_blank" rel="noreferrer">
          <img
            src={resolvedImageUrl}
            alt={label}
            width={512}
            height={512}
            className="aspect-square w-full rounded-lg object-cover max-w-50"
          />
        </a>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-accent text-xl font-semibold text-muted max-w-50">
          {fallback}
        </div>
      )}
    </div>
  );
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

const PENDING_FIELD_LABELS: Record<string, string> = {
  subjectIds: "Specializations",
  baseRatesIdr: "Base rates",
  displayName: "Display name",
  credentialsSummary: "Credentials summary",
  achievements: "Achievements (text)",
  experiences: "Experiences (text)",
  achievementProofUrls: "Achievement proof",
  experienceProofUrls: "Experience proof",
  proofUrls: "Proof links",
  education: "Education",
  competitionAchievements: "Competition achievements",
  experienceEntries: "Experience entries",
  expertise: "Expertise (legacy)",
  modality: "Teaching mode",
  prices: "Marks prices",
  profileImageUrl: "Profile photo",
};

function formatPendingField(field: string) {
  return PENDING_FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, " $1").trim();
}

function isPricesRecord(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([size, price]) => !Number.isNaN(Number(size)) && typeof price === "number",
  );
}

export type SpecializationItem = { label: string; field?: string };

function SpecBadges({ items }: { items: SpecializationItem[] }) {
  if (items.length === 0) {
    return <Text className="text-sm text-dimmed">—</Text>;
  }
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {items.map(({ label, field }, index) => (
        <Badge
          key={`${label}-${index}`}
          variant="secondary"
          className={cn(
            "h-auto min-h-5.5 max-w-full whitespace-normal break-words py-0.5",
            field ? getCompetitionFieldClass(field, "solid") : undefined,
          )}
        >
          {label}
        </Badge>
      ))}
    </div>
  );
}

function UrlList({ urls }: { urls: unknown }) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return <Text className="text-sm text-dimmed">—</Text>;
  }
  return (
    <ul className="space-y-1">
      {urls.map((url) => (
        <li key={String(url)}>
          <a
            href={String(url)}
            target="_blank"
            rel="noreferrer"
            className="break-all text-sm underline underline-offset-2"
          >
            {String(url)}
          </a>
        </li>
      ))}
    </ul>
  );
}

function PricesMini({ prices }: { prices: unknown }) {
  if (!isPricesRecord(prices) || Object.keys(prices).length === 0) {
    return <Text className="text-sm text-dimmed">—</Text>;
  }
  const rows = Object.entries(prices).toSorted(
    ([a], [b]) => Number(a) - Number(b),
  );
  return (
    <div className="overflow-hidden rounded-lg border border-item-border">
      <Table className="text-sm">
        <TableBody>
          {rows.map(([size, price]) => (
            <TableRow key={size}>
              <TableCell className="py-1.5! text-muted">
                {size} {size === "1" ? "student" : "students"}
              </TableCell>
              <TableCell className="py-1.5! text-right font-medium">
                <CogitoMarks value={price} size="3" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatBaseRates(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const rates = Object.entries(value).filter(
    ([, rate]) => typeof rate === "number",
  );
  if (rates.length === 0) return null;
  return rates
    .map(
      ([mode, rate]) =>
        `${mode === "online" ? "Online" : "Offline"} Rp${Number(rate).toLocaleString("id-ID")}`,
    )
    .join(" · ");
}

function modalityLabel(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  if (value === "both") return "Online & offline sessions";
  return `${value[0]?.toUpperCase()}${value.slice(1)} sessions`;
}

function plainText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.trim() ? value : "—";
  if (Array.isArray(value)) {
    return value.length > 0
      ? value.map((entry) => String(entry)).join(", ")
      : "—";
  }
  return "—";
}

type PendingPair = { current: ReactNode; proposed: ReactNode };

function PendingChangePair({
  field,
  current,
  proposed,
  currentSpecializations,
  subjectLabels,
  subjectFieldSlugs,
  idPrefix,
}: {
  field: string;
  current: unknown;
  proposed: unknown;
  currentSpecializations: SpecializationItem[];
  subjectLabels: ReadonlyMap<string, string>;
  subjectFieldSlugs?: ReadonlyMap<string, string>;
  idPrefix: string;
}): PendingPair {
  if (field === "subjectIds" && Array.isArray(proposed)) {
    return {
      current: <SpecBadges items={currentSpecializations} />,
      proposed: (
        <SpecBadges
          items={proposed.map((subjectId) => {
            const id = String(subjectId);
            return {
              label: subjectLabels.get(id) ?? "Specialization unavailable",
              field: subjectFieldSlugs?.get(id),
            };
          })}
        />
      ),
    };
  }

  if (field === "education") {
    const proposedEntries = readEducationEntries(proposed);
    const currentEntries = readEducationEntries(current);
    if (proposedEntries || currentEntries) {
      return {
        current: (
          <TutorAchievementsDisplay
            education={currentEntries ?? []}
            competitionAchievements={[]}
            idPrefix={`${idPrefix}-current-education`}
          />
        ),
        proposed: (
          <TutorAchievementsDisplay
            education={proposedEntries ?? []}
            competitionAchievements={[]}
            idPrefix={`${idPrefix}-education`}
          />
        ),
      };
    }
  }

  if (field === "competitionAchievements") {
    const proposedEntries = readCompetitionAchievements(proposed);
    const currentEntries = readCompetitionAchievements(current);
    if (proposedEntries || currentEntries) {
      return {
        current: (
          <TutorAchievementsDisplay
            education={[]}
            competitionAchievements={currentEntries ?? []}
            idPrefix={`${idPrefix}-current-competition`}
          />
        ),
        proposed: (
          <TutorAchievementsDisplay
            education={[]}
            competitionAchievements={proposedEntries ?? []}
            idPrefix={`${idPrefix}-competition`}
          />
        ),
      };
    }
  }

  if (field === "experienceEntries") {
    const proposedEntries = readExperienceEntries(proposed);
    const currentEntries = readExperienceEntries(current);
    if (proposedEntries || currentEntries) {
      return {
        current: (
          <TutorExperiencesDisplay
            experienceEntries={currentEntries ?? []}
            emptyMessage="—"
            idPrefix={`${idPrefix}-current-experiences`}
          />
        ),
        proposed: (
          <TutorExperiencesDisplay
            experienceEntries={proposedEntries ?? []}
            emptyMessage="—"
            idPrefix={`${idPrefix}-experiences`}
          />
        ),
      };
    }
  }

  if (field === "modality") {
    return {
      current: (
        <Text className="text-sm text-muted">{modalityLabel(current)}</Text>
      ),
      proposed: (
        <Text className="text-sm font-medium">{modalityLabel(proposed)}</Text>
      ),
    };
  }

  if (field === "prices") {
    return {
      current: <PricesMini prices={current} />,
      proposed: <PricesMini prices={proposed} />,
    };
  }

  if (field === "baseRatesIdr") {
    return {
      current: (
        <Text className="text-sm text-muted">
          {formatBaseRates(current) ?? "—"}
        </Text>
      ),
      proposed: (
        <Text className="text-sm font-medium">
          {formatBaseRates(proposed) ?? "—"}
        </Text>
      ),
    };
  }

  if (
    field === "achievementProofUrls" ||
    field === "experienceProofUrls" ||
    field === "proofUrls"
  ) {
    return {
      current: <UrlList urls={current} />,
      proposed: <UrlList urls={proposed} />,
    };
  }

  return {
    current: (
      <Text className="whitespace-pre-line break-words text-sm text-muted">
        {plainText(current)}
      </Text>
    ),
    proposed: (
      <Text className="whitespace-pre-line break-words text-sm font-medium">
        {plainText(proposed)}
      </Text>
    ),
  };
}

export function TutorReviewCard({
  profile,
  subjectLabels,
  subjectFieldSlugs,
  onAction,
}: TutorReviewCardProps) {
  const queryClient = useQueryClient();
  const { data: profileHistory = [] } = useQuery(
    orpc.adminTutor.listTutorProfileHistory.queryOptions({
      input: { tutorProfileId: profile.id },
    }),
  );
  const [noteAction, setNoteAction] = useState<
    "request_changes" | "request_edit_changes" | "suspend" | null
  >(null);
  const [adminNote, setAdminNote] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [isUploadingProfilePhoto, setIsUploadingProfilePhoto] = useState(false);
  const reviewMutation = useMutation(
    orpc.adminTutor.reviewTutorProfile.mutationOptions({
      onSuccess: () => {
        setNoteAction(null);
        setAdminNote("");
        void queryClient.invalidateQueries({
          queryKey: orpc.adminTutor.listTutorProfiles.key(),
        });
        void queryClient.invalidateQueries({
          queryKey: orpc.adminTutor.listTutorProfileHistory.key(),
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
    if (isUploadingProfilePhoto) {
      toastManager.add({
        title: "Photo upload still in progress",
        description: "Wait for the edited photo to finish uploading first.",
        type: "info",
      });
      return;
    }
    reviewMutation.mutate({
      tutorProfileId: profile.id,
      action,
      adminNote: note,
      profileImageUrl: profileImageUrl.trim() || undefined,
    });
  }

  async function uploadEditedProfilePhoto(file: File) {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toastManager.add({
        title: "Unsupported photo format",
        description: "Choose a JPG, PNG, or WebP image.",
        type: "error",
      });
      return;
    }

    setIsUploadingProfilePhoto(true);
    try {
      const signed = await client.upload.createUploadUrl({
        filename: `tutor-${profile.id}-edited.${file.type.split("/")[1]}`,
        contentType: file.type as "image/png" | "image/jpeg" | "image/webp",
        contentLength: file.size,
      });
      if (file.size > signed.maxBytes) {
        throw new Error("Photo must be 5 MB or smaller.");
      }

      const uploadUrl =
        resolveProfileImageUrl(signed.uploadUrl) ?? signed.uploadUrl;
      const isLocalUpload = signed.uploadUrl.startsWith("/");
      const fields = signed.fields ?? {};
      let response: Response;
      if (Object.keys(fields).length > 0) {
        const body = new FormData();
        Object.entries(fields).forEach(([key, value]) =>
          body.append(key, value),
        );
        body.append("file", file);
        response = await fetch(uploadUrl, {
          method: signed.method,
          body,
        });
      } else {
        response = await fetch(uploadUrl, {
          method: signed.method,
          credentials: isLocalUpload ? "include" : "omit",
          headers: { "content-type": file.type },
          body: file,
        });
      }
      if (!response.ok) throw new Error("Photo upload failed.");

      setProfileImageUrl(
        resolveProfileImageUrl(signed.publicUrl) ?? signed.publicUrl,
      );
      toastManager.add({
        title: "Edited profile photo uploaded",
        description: "Approve or publish the profile to apply this photo.",
        type: "success",
      });
    } catch (error) {
      toastManager.add({
        title: "Edited photo could not be uploaded",
        description: getUserFacingError(error),
        type: "error",
      });
    } finally {
      setIsUploadingProfilePhoto(false);
    }
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
  const pendingProfileImageUrl = readProfileImageUrl(
    profile.pendingProfileChanges?.profileImageUrl,
  );
  const currentProfileImageUrl = profile.user?.image ?? null;
  const pendingChangesWithoutPhoto = Object.entries(
    profile.pendingProfileChanges ?? {},
  ).filter(([field]) => field !== "profileImageUrl");
  function readCurrentPendingValue(field: string): unknown {
    switch (field) {
      case "achievementProofUrls":
        return profile.achievementProofUrls;
      case "experienceProofUrls":
        return profile.experienceProofUrls;
      case "education":
        return profile.education;
      case "competitionAchievements":
        return profile.competitionAchievements;
      case "experienceEntries":
        return profile.experienceEntries;
      case "modality":
        return profile.modality;
      case "baseRatesIdr":
        return profile.baseRatesIdr;
      case "prices":
        return profile.prices;
      default:
        return undefined;
    }
  }
  const specializationItems: SpecializationItem[] = (profile.subjects ?? [])
    .map((entry) => ({
      id: entry.subject.id,
      label: entry.subject.parent?.name
        ? `${entry.subject.parent.name} · ${entry.subject.name}`
        : entry.subject.name,
      field: entry.subject.parent?.slug ?? entry.subject.slug,
    }))
    .filter(
      (item, index, all) =>
        all.findIndex((other) => other.id === item.id) === index,
    )
    .map(({ label, field }) => ({ label, field }));
  const hasEducation = Boolean(profile.education?.length);
  const hasAchievements = Boolean(profile.competitionAchievements?.length);
  const hasExperiences = Boolean(profile.experienceEntries?.length);
  const proofRows: Array<{ label: string; url: string }> = [
    ...(profile.achievementProofUrls ?? []).map((url) => ({
      label: "Achievement",
      url,
    })),
    ...(profile.experienceProofUrls ?? []).map((url) => ({
      label: "Experience",
      url,
    })),
  ];
  const payoutRows: Array<{ label: string; value: string }> = [
    profile.bankName ? { label: "Bank", value: profile.bankName } : null,
    profile.bankAccountNumber
      ? { label: "Account number", value: profile.bankAccountNumber }
      : null,
    profile.bankAccountHolderName
      ? { label: "Holder", value: profile.bankAccountHolderName }
      : null,
    profile.bankAccountOpeningCity
      ? { label: "Opening city", value: profile.bankAccountOpeningCity }
      : null,
    profile.bankAccountOwnership
      ? {
          label: "Ownership",
          value:
            profile.bankAccountOwnership === "self"
              ? "Self-owned"
              : "Trusted person",
        }
      : null,
  ].filter((row): row is { label: string; value: string } => row !== null);

  return (
    <>
      <Card className="flex min-w-0 flex-col overflow-hidden">
        <CardHeader className="items-start">
          <div className="flex min-w-0 items-start gap-3.5">
            <Avatar className="shrink-0">
              <AvatarImage
                src={resolveProfileImageUrl(currentProfileImageUrl)}
                alt="Tutor profile"
              />
              <AvatarFallback>{getInitials(profile.user?.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <CardTitle className="truncate">
                {profile.user?.name ?? "Unnamed tutor"}
              </CardTitle>
              {profile.user ? (
                <div className="mt-1 flex items-center gap-1.5 text-muted">
                  <IconMail className="size-3.5 shrink-0" />
                  <Text className="truncate text-sm">{profile.user.email}</Text>
                </div>
              ) : null}
            </div>
          </div>
          <CardHeaderAction>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </CardHeaderAction>
        </CardHeader>

        <CardBody className="flex-1">
          <Stack direction="column" spacing="md" className="m-0!">
            {pendingChangesWithoutPhoto.length > 0 ? (
              <section className="rounded-lg border border-warning-border bg-warning/10 p-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-warning">
                  Proposed profile changes
                </Text>
                <div className="mt-2 overflow-hidden rounded-lg border border-warning-border/60 bg-background">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="py-2!">Field</TableHead>
                        <TableHead className="py-2!">Current</TableHead>
                        <TableHead className="py-2!">Proposed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingChangesWithoutPhoto.map(([field, value]) => {
                        const pair = PendingChangePair({
                          field,
                          current: readCurrentPendingValue(field),
                          proposed: value,
                          currentSpecializations: specializationItems,
                          subjectLabels,
                          subjectFieldSlugs,
                          idPrefix: `admin-${profile.id}-pending-${field}`,
                        });
                        return (
                          <TableRow key={field}>
                            <TableCell className="py-2! align-top whitespace-nowrap text-muted capitalize">
                              {formatPendingField(field)}
                            </TableCell>
                            <TableCell className="py-2! align-top">
                              {pair.current}
                            </TableCell>
                            <TableCell className="py-2! align-top">
                              {pair.proposed}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {profile.profileEditAdminNote ? (
                  <Text className="mt-2 text-sm">
                    {profile.profileEditAdminNote}
                  </Text>
                ) : null}
              </section>
            ) : null}

            {profile.adminReviewNote ? (
              <div className="rounded-lg border border-warning-border bg-warning/10 p-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-warning">
                  Latest review note
                </Text>
                <Text className="mt-1 text-sm">{profile.adminReviewNote}</Text>
              </div>
            ) : null}

            <ReviewSection title="Profile">
              <Text
                className={
                  profile.shortBio
                    ? "leading-relaxed text-muted"
                    : "italic text-dimmed"
                }
              >
                {profile.shortBio ?? "No tutor introduction provided."}
              </Text>
            </ReviewSection>

            <ReviewSection title="Teaching setup">
              <div className="overflow-hidden rounded-lg border border-item-border">
                <Table className="text-sm">
                  <TableBody>
                    <TableRow>
                      <TableCell className="py-2! align-top whitespace-nowrap text-muted">
                        Teaching mode
                      </TableCell>
                      <TableCell className="py-2!">
                        {profile.modality ? (
                          <Badge
                            variant={
                              MODALITY_VARIANTS[profile.modality] ?? "secondary"
                            }
                          >
                            {MODALITY_LABELS[profile.modality] ??
                              profile.modality}
                          </Badge>
                        ) : (
                          <Text className="text-sm italic text-dimmed">
                            Not specified
                          </Text>
                        )}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="py-2! align-top whitespace-nowrap text-muted">
                        Specializations
                      </TableCell>
                      <TableCell className="py-2!">
                        {specializationItems.length ? (
                          <SpecBadges items={specializationItems} />
                        ) : (
                          <Text className="text-sm italic text-dimmed">
                            No specializations listed.
                          </Text>
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </ReviewSection>

            <ReviewSection
              title="Credentials"
              action={
                <Button
                  type="button"
                  variant="plain"
                  size="xs"
                  onClick={openAchievementsEditor}
                >
                  Edit format
                </Button>
              }
            >
              {hasEducation || hasAchievements || hasExperiences ? (
                <div className="flex flex-col gap-3">
                  {hasEducation ? (
                    <Card className="bg-accent shadow-none">
                      <CardBody className="p-4">
                        <TutorAchievementsDisplay
                          education={profile.education}
                          competitionAchievements={[]}
                          idPrefix={`admin-${profile.id}-achievements`}
                        />
                      </CardBody>
                    </Card>
                  ) : null}
                  {hasAchievements ? (
                    <Card className="bg-accent shadow-none">
                      <CardBody className="p-4">
                        <TutorAchievementsDisplay
                          education={[]}
                          competitionAchievements={
                            profile.competitionAchievements
                          }
                          idPrefix={`admin-${profile.id}-achievements`}
                        />
                      </CardBody>
                    </Card>
                  ) : null}
                  {hasExperiences ? (
                    <Card className="bg-accent shadow-none">
                      <CardBody className="p-4">
                        <TutorAchievementsDisplay
                          education={[]}
                          experienceEntries={profile.experienceEntries}
                          idPrefix={`admin-${profile.id}-experiences`}
                        />
                      </CardBody>
                    </Card>
                  ) : null}
                </div>
              ) : (
                <Text className="text-sm italic text-dimmed">
                  No education, achievements, or experiences provided.
                </Text>
              )}
            </ReviewSection>

            {proofRows.length > 0 ? (
              <ReviewSection title="Proofs">
                <div className="overflow-hidden rounded-lg border border-item-border">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="py-2!">Type</TableHead>
                        <TableHead className="py-2!">Link</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {proofRows.map((row) => (
                        <TableRow key={`${row.label}-${row.url}`}>
                          <TableCell className="py-2! align-top whitespace-nowrap text-muted">
                            {row.label}
                          </TableCell>
                          <TableCell className="py-2!">
                            <a
                              href={row.url}
                              target="_blank"
                              rel="noreferrer"
                              className="break-all underline underline-offset-2"
                            >
                              {row.url}
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ReviewSection>
            ) : null}

            <ReviewSection title="Marks per student">
              {priceEntries.length ? (
                <div className="overflow-hidden rounded-lg border border-item-border">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="py-2!">Group size</TableHead>
                        <TableHead className="py-2! text-right">
                          Marks
                        </TableHead>
                        <TableHead className="py-2! text-right">
                          Minimum
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {priceEntries.map(([size, price]) => {
                        const floor = floorPrices[size];
                        const belowFloor = floor !== undefined && price < floor;
                        return (
                          <TableRow key={size}>
                            <TableCell className="py-2!">
                              {size} {size === "1" ? "student" : "students"}
                            </TableCell>
                            <TableCell className="py-2! text-right font-medium">
                              <span className="inline-flex items-center justify-end gap-1.5">
                                <CogitoMarks value={price} size="4" />
                                {belowFloor ? (
                                  <Badge variant="danger" size="sm" pill>
                                    Below min
                                  </Badge>
                                ) : null}
                              </span>
                            </TableCell>
                            <TableCell className="py-2! text-right text-muted">
                              {floor ?? "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <Text className="text-sm italic text-dimmed">
                  No price list provided.
                </Text>
              )}
              {priceEntries.some(([size, price]) => {
                const floor = floorPrices[size];
                return floor !== undefined && price < floor;
              }) ? (
                <Text className="mt-2 flex items-center gap-1 text-xs text-danger">
                  <IconAlertTriangle className="size-3" />
                  One or more sizes fall below the modality minimum. Confirm
                  before approving.
                </Text>
              ) : null}
            </ReviewSection>

            <ReviewSection title="Profile photo">
              <div className="grid gap-3 sm:grid-cols-2">
                <PhotoReviewPanel
                  label="Current photo"
                  description="Visible to students now"
                  imageUrl={currentProfileImageUrl}
                  fallback={getInitials(profile.user?.name)}
                />
                {pendingProfileImageUrl ? (
                  <PhotoReviewPanel
                    label="Proposed photo"
                    description="Applies only after approval"
                    imageUrl={pendingProfileImageUrl}
                    fallback={getInitials(profile.user?.name)}
                    proposed
                  />
                ) : null}
              </div>
              <div className="mt-4 grid gap-3">
                <Field>
                  <FieldLabel htmlFor={`admin-${profile.id}-edited-photo`}>
                    Upload edited photo
                  </FieldLabel>
                  <Input
                    id={`admin-${profile.id}-edited-photo`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={isUploadingProfilePhoto}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.currentTarget.value = "";
                      if (file) void uploadEditedProfilePhoto(file);
                    }}
                  />
                  <FieldDescription>
                    Upload the Cogito-standardized version. It will be applied
                    only when the review action is approved.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`admin-${profile.id}-edited-photo-url`}>
                    Or paste edited photo URL
                  </FieldLabel>
                  <Input
                    id={`admin-${profile.id}-edited-photo-url`}
                    type="url"
                    value={profileImageUrl}
                    onChange={(event) => setProfileImageUrl(event.target.value)}
                    placeholder="https://…"
                  />
                  <FieldDescription>
                    Use this only when the edited asset is already hosted.
                  </FieldDescription>
                </Field>
                {profileImageUrl.trim() ? (
                  <div className="rounded-lg border border-success-border bg-success/5 p-3">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-success">
                      Edited photo ready
                    </Text>
                    <Text className="mt-2 text-sm text-muted">
                      The hosted photo will be applied when this review action
                      is approved.
                    </Text>
                  </div>
                ) : null}
              </div>
            </ReviewSection>

            {payoutRows.length > 0 ? (
              <ReviewSection title="Payout account">
                <div className="overflow-hidden rounded-lg border border-item-border">
                  <Table className="text-sm">
                    <TableBody>
                      {payoutRows.map((row) => (
                        <TableRow key={row.label}>
                          <TableCell className="py-2! align-top whitespace-nowrap text-muted">
                            {row.label}
                          </TableCell>
                          <TableCell className="py-2! font-medium break-words">
                            {row.value}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ReviewSection>
            ) : null}
            <ProfilePhotoHistory
              entries={profileHistory}
              title="Review history"
            />
          </Stack>
        </CardBody>

        <CardFooter className="fixed inset-x-0 bottom-0 z-40 flex-wrap justify-center gap-2 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:justify-end lg:static lg:justify-end">
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
                progress={isPending && reviewAction === "approve_unpublished"}
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
        </CardFooter>
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

function ReviewSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <Heading size="sm">{title}</Heading>
        {action}
      </div>
      {children}
    </section>
  );
}
