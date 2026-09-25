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
import { Chip } from "@cogito-app/ui/components/selia/chip";
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
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
import {
  InputGroup,
  InputGroupAddon,
} from "@cogito-app/ui/components/selia/input-group";
import {
  Item,
  ItemAction,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";
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
import {
  IconAlertTriangle,
  IconChevronDown,
  IconInbox,
  IconSearch,
} from "@tabler/icons-react";

import { getUserFacingError } from "@/lib/error-message";
import { CogitoMarks } from "@/components/cogito-marks";
import { EmptyState } from "@/components/empty-state";
import { getCompetitionFieldClass } from "@/lib/competition-colors";
import { resolveProfileImageUrl } from "@/lib/profile-image-url";
import { cn } from "@cogito-app/ui/lib/utils";
import { client, orpc } from "@/utils/orpc";
import {
  TutorAchievementsDisplay,
  TutorAchievementsEditor,
  type TutorAchievement,
  type TutorEducationEntry,
  validateTutorAchievementDraft,
} from "@/components/tutor/tutor-achievements";
import {
  TutorExperiencesDisplay,
  type TutorExperience,
} from "@/components/tutor/tutor-experiences";
import { ProfilePhotoHistory } from "@/components/tutor/profile-photo-history";
import {
  buildTutorReviewDiffs,
  filterTutorReviewDiffs,
  getTutorReviewDiffStatus,
  isTutorReviewValueEmpty,
  summarizeTutorReviewDiffs,
  TUTOR_REVIEW_DIFF_FILTERS,
  type TutorReviewDiff,
  type TutorReviewDiffFilter,
  type TutorReviewDiffStatus,
} from "@/components/admin/tutor-review-diff";

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
    affiliation: string | null;
    achievementProofUrls: string[] | null;
    experienceProofUrls: string[] | null;
    education: TutorEducationEntry[] | null;
    achievements: TutorAchievement[] | null;
    experiences: TutorExperience[] | null;
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

function readAchievements(value: unknown): TutorAchievement[] | null {
  if (!Array.isArray(value)) return null;

  const entries: TutorAchievement[] = [];
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

function readExperiences(value: unknown): TutorExperience[] | null {
  if (!Array.isArray(value)) return null;

  const entries: TutorExperience[] = [];
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
  shortBio: "Short bio",
  affiliation: "Affiliation",
  achievements: "Achievements",
  experiences: "Experiences",
  achievementProofUrls: "Achievement proof",
  experienceProofUrls: "Experience proof",
  proofUrls: "Proof links",
  education: "Education",
  modality: "Teaching mode",
  prices: "Marks prices",
  profileImageUrl: "Profile photo",
};

function formatPendingField(field: string) {
  return PENDING_FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, " $1").trim();
}

const DIFF_STATUS_META: Record<
  TutorReviewDiffStatus,
  {
    label: string;
    symbol: string;
    variant: "secondary" | "success" | "warning" | "danger";
  }
> = {
  added: { label: "Added", symbol: "+", variant: "success" },
  modified: { label: "Changed", symbol: "~", variant: "warning" },
  removed: { label: "Removed", symbol: "−", variant: "danger" },
  filled: { label: "Filled", symbol: "✓", variant: "secondary" },
  empty: { label: "Empty", symbol: "○", variant: "secondary" },
};

const DIFF_FILTER_LABELS: Record<TutorReviewDiffFilter, string> = {
  all: "All",
  added: "Added",
  modified: "Changed",
  removed: "Removed",
  empty: "Empty",
};

const REVIEW_SECTION_FIELDS = {
  profile: ["shortBio", "affiliation", "displayName", "name"],
  teaching: ["modality", "subjectIds", "expertise"],
  credentials: ["education", "achievements", "experiences"],
  proofs: ["achievementProofUrls", "experienceProofUrls", "proofUrls"],
  marks: ["prices", "baseRatesIdr"],
  photo: ["profileImageUrl"],
  payout: [
    "bankName",
    "bankAccountNumber",
    "bankAccountHolderName",
    "bankAccountOpeningCity",
    "bankAccountOwnership",
  ],
} as const;

const REVIEW_SECTION_TITLES: Record<
  keyof typeof REVIEW_SECTION_FIELDS,
  string
> = {
  profile: "Profile",
  teaching: "Teaching setup",
  credentials: "Credentials",
  proofs: "Proofs",
  marks: "Marks per student",
  photo: "Profile photo",
  payout: "Payout account",
};

type ReviewSectionStatus = "changes" | "empty" | undefined;

function isActualTutorReviewChange(status: TutorReviewDiffStatus) {
  return status === "added" || status === "modified" || status === "removed";
}

function getReviewSectionStatus(
  fields: readonly string[],
  diffs: readonly TutorReviewDiff[],
  isEmpty: boolean,
): ReviewSectionStatus {
  if (
    diffs.some(
      (diff) =>
        fields.includes(diff.field) && isActualTutorReviewChange(diff.status),
    )
  ) {
    return "changes";
  }
  return isEmpty ? "empty" : undefined;
}

function sectionMatchesReviewFilters(
  title: string,
  fields: readonly string[],
  status: ReviewSectionStatus,
  diffs: readonly TutorReviewDiff[],
  filter: TutorReviewDiffFilter,
  search: string,
) {
  const query = search.trim().toLowerCase();
  const sectionDiffs = diffs.filter((diff) => fields.includes(diff.field));
  const sectionSearchText = [
    title,
    ...fields.map(formatPendingField),
    ...sectionDiffs.map((diff) => diff.label),
  ]
    .join(" ")
    .toLowerCase();

  if (query && !sectionSearchText.includes(query)) return false;
  if (filter === "all") return true;
  if (filter === "empty") {
    return (
      status === "empty" || sectionDiffs.some((diff) => diff.status === "empty")
    );
  }
  return sectionDiffs.some((diff) => diff.status === filter);
}

function DiffStatusBadge({ status }: { status: TutorReviewDiffStatus }) {
  const meta = DIFF_STATUS_META[status];
  return (
    <Badge
      variant={meta.variant}
      size="sm"
      pill
      aria-label={`${meta.symbol} ${meta.label}`}
    >
      <span aria-hidden="true">{meta.symbol}</span>
      {meta.label}
    </Badge>
  );
}

function ReviewEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <EmptyState
      icon={<IconInbox aria-hidden="true" />}
      title={title}
      description={description}
      tone="secondary"
      size="inline"
      className="rounded-lg"
    />
  );
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
      {items.map(({ label, field }) => (
        <Badge
          key={`${field ?? "specialization"}-${label}`}
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

function renderPendingChangePair({
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
            achievements={[]}
            idPrefix={`${idPrefix}-current-education`}
          />
        ),
        proposed: (
          <TutorAchievementsDisplay
            education={proposedEntries ?? []}
            achievements={[]}
            idPrefix={`${idPrefix}-education`}
          />
        ),
      };
    }
  }

  if (field === "achievements") {
    const proposedEntries = readAchievements(proposed);
    const currentEntries = readAchievements(current);
    if (proposedEntries || currentEntries) {
      return {
        current: (
          <TutorAchievementsDisplay
            education={[]}
            achievements={currentEntries ?? []}
            idPrefix={`${idPrefix}-current-competition`}
          />
        ),
        proposed: (
          <TutorAchievementsDisplay
            education={[]}
            achievements={proposedEntries ?? []}
            idPrefix={`${idPrefix}-competition`}
          />
        ),
      };
    }
  }

  if (field === "experiences") {
    const proposedEntries = readExperiences(proposed);
    const currentEntries = readExperiences(current);
    if (proposedEntries || currentEntries) {
      return {
        current: (
          <TutorExperiencesDisplay
            experiences={currentEntries ?? []}
            emptyMessage="—"
            idPrefix={`${idPrefix}-current-experiences`}
          />
        ),
        proposed: (
          <TutorExperiencesDisplay
            experiences={proposedEntries ?? []}
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

function formatPendingValueSummary(field: string, value: unknown): string {
  if (isTutorReviewValueEmpty(value)) return "Empty";

  if (field === "subjectIds" && Array.isArray(value)) {
    const count = value.length;
    return `${count} specialization${count === 1 ? "" : "s"}`;
  }

  if (
    field === "education" ||
    field === "achievements" ||
    field === "experiences"
  ) {
    const count = Array.isArray(value) ? value.length : 0;
    const label =
      field === "education"
        ? "education entr"
        : field === "achievements"
          ? "achievement entr"
          : "experience entr";
    return `${count} ${label}${count === 1 ? "y" : "ies"}`;
  }

  if (
    field === "achievementProofUrls" ||
    field === "experienceProofUrls" ||
    field === "proofUrls"
  ) {
    const count = Array.isArray(value) ? value.length : 0;
    return `${count} proof link${count === 1 ? "" : "s"}`;
  }

  if (field === "prices" && isRecord(value)) {
    const count = Object.keys(value).length;
    return `${count} group-size price${count === 1 ? "" : "s"}`;
  }

  if (field === "baseRatesIdr") return formatBaseRates(value) ?? "Empty";
  if (field === "modality") return modalityLabel(value);

  const summary = plainText(value).replace(/\s+/g, " ").trim();
  return summary.length > 120 ? `${summary.slice(0, 117)}…` : summary;
}

function PendingChangeRow({
  diff,
  expanded,
  onToggle,
  currentSpecializations,
  subjectLabels,
  subjectFieldSlugs,
  idPrefix,
}: {
  diff: TutorReviewDiff;
  expanded: boolean;
  onToggle: () => void;
  currentSpecializations: SpecializationItem[];
  subjectLabels: ReadonlyMap<string, string>;
  subjectFieldSlugs?: ReadonlyMap<string, string>;
  idPrefix: string;
}) {
  const pair = renderPendingChangePair({
    field: diff.field,
    current: diff.current,
    proposed: diff.proposed,
    currentSpecializations,
    subjectLabels,
    subjectFieldSlugs,
    idPrefix,
  });
  const detailsId = `${idPrefix}-details`;
  const meta = DIFF_STATUS_META[diff.status];
  const currentSummary = formatPendingValueSummary(diff.field, diff.current);
  const proposedSummary = formatPendingValueSummary(diff.field, diff.proposed);

  return (
    <Item
      variant="outline"
      direction="column"
      size="sm"
      className="overflow-hidden gap-0! p-0!"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={onToggle}
        className="flex min-w-0 items-start gap-3 p-3 text-left focus-visible:z-1 focus-visible:outline-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <ItemMedia className="pt-0.5">
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-full border border-border bg-background font-mono text-sm font-semibold"
          >
            {meta.symbol}
          </span>
        </ItemMedia>
        <ItemContent className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ItemTitle className="text-sm">{diff.label}</ItemTitle>
            <DiffStatusBadge status={diff.status} />
          </div>
          <ItemDescription className="min-w-0 max-w-full truncate text-sm">
            <span>{currentSummary}</span>
            <span aria-hidden="true" className="mx-1.5 text-dimmed">
              →
            </span>
            <span className="font-medium text-foreground">
              {proposedSummary}
            </span>
          </ItemDescription>
        </ItemContent>
        <ItemAction className="shrink-0 pt-1">
          <IconChevronDown
            aria-hidden="true"
            className={cn("size-4 text-dimmed", expanded && "rotate-180")}
          />
          <span className="sr-only">
            {expanded ? `Collapse ${diff.label}` : `Expand ${diff.label}`}
          </span>
        </ItemAction>
      </button>
      <div
        id={detailsId}
        hidden={!expanded}
        className="border-t border-item-border bg-background p-3"
      >
        {diff.status === "empty" ? (
          <ReviewEmptyState
            title="No value submitted"
            description="This field is empty in both the current profile and the proposal."
          />
        ) : (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-lg border border-item-border bg-item p-3">
              <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
                Current
              </Text>
              <div className="mt-2 min-w-0">{pair.current}</div>
            </div>
            <div className="min-w-0 rounded-lg border border-warning-border/60 bg-warning/5 p-3">
              <Text className="text-xs font-semibold uppercase tracking-wide text-warning">
                Proposed
              </Text>
              <div className="mt-2 min-w-0">{pair.proposed}</div>
            </div>
          </div>
        )}
      </div>
    </Item>
  );
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
  const [diffFilter, setDiffFilter] = useState<TutorReviewDiffFilter>("all");
  const [diffSearch, setDiffSearch] = useState("");
  const [expandedDiffFields, setExpandedDiffFields] = useState<Set<string>>(
    () => new Set(),
  );
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
    achievements: [] as TutorAchievement[],
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
    const pendingAchievements = readAchievements(
      profile.pendingProfileChanges?.achievements,
    );
    setAchievementDraft({
      education: pendingEducation ?? profile.education ?? [],
      achievements: pendingAchievements ?? profile.achievements ?? [],
    });
    setAchievementsEditOpen(true);
  }

  function saveAchievements() {
    const validation = validateTutorAchievementDraft(
      achievementDraft.education,
      achievementDraft.achievements,
    );
    if (validation.education || validation.achievements) {
      toastManager.add({
        title: "Check the achievement entries",
        description: validation.education ?? validation.achievements,
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
      achievements: achievementDraft.achievements.map((entry) => ({
        competitionName: entry.competitionName.trim(),
        year: entry.year,
        awards: entry.awards.map((award) => award.trim()),
      })),
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
  const currentProfileImageUrl = profile.user?.image ?? null;
  const pendingProfileImageUrl = readProfileImageUrl(
    profile.pendingProfileChanges?.profileImageUrl,
  );
  const pendingChangesWithoutPhoto = Object.entries(
    profile.pendingProfileChanges ?? {},
  ).filter(([field]) => field !== "profileImageUrl");
  const currentSpecializationItems = (profile.subjects ?? [])
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
    );
  const currentSubjectIds = currentSpecializationItems.map((item) => item.id);
  const specializationItems: SpecializationItem[] =
    currentSpecializationItems.map(({ label, field }) => ({ label, field }));
  const currentPendingValues: Record<string, unknown> = {
    name: profile.user?.name,
    displayName: profile.user?.name,
    shortBio: profile.shortBio,
    affiliation: profile.affiliation,
    subjectIds: currentSubjectIds,
    achievementProofUrls: profile.achievementProofUrls,
    experienceProofUrls: profile.experienceProofUrls,
    education: profile.education,
    achievements: profile.achievements,
    experiences: profile.experiences,
    modality: profile.modality,
    baseRatesIdr: profile.baseRatesIdr,
    prices: profile.prices,
    bankName: profile.bankName,
    bankAccountNumber: profile.bankAccountNumber,
    bankAccountHolderName: profile.bankAccountHolderName,
    bankAccountOpeningCity: profile.bankAccountOpeningCity,
    bankAccountOwnership: profile.bankAccountOwnership,
    profileImageUrl: currentProfileImageUrl,
  };
  function readCurrentPendingValue(field: string): unknown {
    const [rootField, ...path] = field.split(".");
    let value = currentPendingValues[rootField];
    for (const pathPart of path) {
      if (!isRecord(value)) return undefined;
      value = value[pathPart];
    }
    return value;
  }
  const diffEntries = buildTutorReviewDiffs(
    pendingChangesWithoutPhoto,
    readCurrentPendingValue,
    formatPendingField,
  );
  const diffSummary = summarizeTutorReviewDiffs(diffEntries);
  const filteredDiffEntries = filterTutorReviewDiffs(
    diffEntries,
    diffFilter,
    diffSearch,
  );
  function toggleDiffField(field: string) {
    setExpandedDiffFields((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }
  const hasEducation = Boolean(profile.education?.length);
  const hasAchievements = Boolean(profile.achievements?.length);
  const hasExperiences = Boolean(profile.experiences?.length);
  const hasTeachingSetup =
    !isTutorReviewValueEmpty(profile.modality) ||
    specializationItems.length > 0;
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
  const sectionStatuses = {
    profile: getReviewSectionStatus(
      REVIEW_SECTION_FIELDS.profile,
      diffEntries,
      isTutorReviewValueEmpty(profile.shortBio),
    ),
    teaching: getReviewSectionStatus(
      REVIEW_SECTION_FIELDS.teaching,
      diffEntries,
      !hasTeachingSetup,
    ),
    credentials: getReviewSectionStatus(
      REVIEW_SECTION_FIELDS.credentials,
      diffEntries,
      !hasEducation && !hasAchievements && !hasExperiences,
    ),
    proofs: getReviewSectionStatus(
      REVIEW_SECTION_FIELDS.proofs,
      diffEntries,
      proofRows.length === 0,
    ),
    marks: getReviewSectionStatus(
      REVIEW_SECTION_FIELDS.marks,
      diffEntries,
      priceEntries.length === 0,
    ),
    photo:
      pendingProfileImageUrl &&
      isActualTutorReviewChange(
        getTutorReviewDiffStatus(
          currentProfileImageUrl,
          pendingProfileImageUrl,
          "profileImageUrl",
        ),
      )
        ? "changes"
        : !currentProfileImageUrl && !pendingProfileImageUrl
          ? "empty"
          : undefined,
    payout: getReviewSectionStatus(
      REVIEW_SECTION_FIELDS.payout,
      diffEntries,
      payoutRows.length === 0,
    ),
  } satisfies Record<keyof typeof REVIEW_SECTION_FIELDS, ReviewSectionStatus>;
  const showSectionStatus = (key: keyof typeof REVIEW_SECTION_FIELDS) =>
    sectionMatchesReviewFilters(
      REVIEW_SECTION_TITLES[key],
      REVIEW_SECTION_FIELDS[key],
      sectionStatuses[key],
      diffEntries,
      diffFilter,
      diffSearch,
    );

  return (
    <>
      <Card className="flex min-w-0 flex-col overflow-hidden">
        <CardHeader>
          <div className="flex min-w-0 gap-3.5">
            <Avatar className="shrink-0">
              <AvatarImage
                src={resolveProfileImageUrl(currentProfileImageUrl)}
                alt="Tutor profile"
              />
              <AvatarFallback>{getInitials(profile.user?.name)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col items-start justify-center">
              <CardTitle className="truncate">
                {profile.user?.name ?? "Unnamed tutor"}
              </CardTitle>
              {profile.user ? (
                <div className="mt-1 flex items-center gap-1.5 text-muted">
                  <Text className="truncate text-sm">{profile.user.email}</Text>
                </div>
              ) : null}
            </div>
          </div>
          <Badge variant={badge.variant} className="shrink-0">
            {badge.label}
          </Badge>
        </CardHeader>

        <CardBody className="flex-1">
          <Stack direction="column" spacing="md" className="m-0!">
            {diffEntries.length > 0 ? (
              <section className="rounded-lg border border-warning-border bg-warning/10 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-warning">
                      Proposed profile changes
                    </Text>
                    <Text className="mt-1 text-sm text-muted">
                      Tutor profile <span aria-hidden="true">→</span> review
                    </Text>
                  </div>
                  <div
                    className="flex flex-wrap gap-1.5"
                    aria-label={`${diffSummary.added} added, ${diffSummary.modified} changed, ${diffSummary.removed} removed, ${diffSummary.empty} empty`}
                    aria-live="polite"
                  >
                    <Badge variant="success" size="sm" pill>
                      +{diffSummary.added}
                    </Badge>
                    <Badge variant="warning" size="sm" pill>
                      ~{diffSummary.modified}
                    </Badge>
                    <Badge variant="danger" size="sm" pill>
                      −{diffSummary.removed}
                    </Badge>
                    <Badge variant="secondary" size="sm" pill>
                      ○{diffSummary.empty}
                    </Badge>
                  </div>
                </div>
                <Text className="sr-only" aria-live="polite">
                  {diffSummary.added} added, {diffSummary.modified} changed,{" "}
                  {diffSummary.removed} removed, {diffSummary.empty} empty,{" "}
                  {diffSummary.filled} already filled.
                </Text>
                <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <InputGroup className="min-w-0">
                    <InputGroupAddon>
                      <IconSearch aria-hidden="true" />
                    </InputGroupAddon>
                    <Input
                      aria-label="Search proposed changes"
                      value={diffSearch}
                      onChange={(event) => setDiffSearch(event.target.value)}
                      placeholder="Search fields"
                    />
                  </InputGroup>
                  <div
                    className="flex flex-wrap items-center gap-1.5"
                    role="group"
                    aria-label="Filter proposed changes"
                  >
                    {TUTOR_REVIEW_DIFF_FILTERS.map((filter) => (
                      <Chip
                        key={filter}
                        variant={diffFilter === filter ? "primary" : "outline"}
                        size="sm"
                        render={
                          <button
                            type="button"
                            aria-label={DIFF_FILTER_LABELS[filter]}
                          />
                        }
                        aria-pressed={diffFilter === filter}
                        onClick={() => setDiffFilter(filter)}
                        className="cursor-pointer justify-center border-0 focus-visible:outline-0 focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {DIFF_FILTER_LABELS[filter]}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex min-w-0 flex-col gap-2">
                  {filteredDiffEntries.length > 0 ? (
                    filteredDiffEntries.map((diff) => (
                      <PendingChangeRow
                        key={diff.field}
                        diff={diff}
                        expanded={expandedDiffFields.has(diff.field)}
                        onToggle={() => toggleDiffField(diff.field)}
                        currentSpecializations={specializationItems}
                        subjectLabels={subjectLabels}
                        subjectFieldSlugs={subjectFieldSlugs}
                        idPrefix={`admin-${profile.id}-pending-${diff.field}`}
                      />
                    ))
                  ) : (
                    <ReviewEmptyState
                      title="No matching changes"
                      description="Try another field name or status filter."
                    />
                  )}
                </div>
              </section>
            ) : null}

            {profile.profileEditAdminNote ? (
              <div className="rounded-lg border border-warning-border bg-warning/10 p-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-warning">
                  Tutor review note
                </Text>
                <Text className="mt-1 text-sm">
                  {profile.profileEditAdminNote}
                </Text>
              </div>
            ) : null}

            {profile.adminReviewNote ? (
              <div className="rounded-lg border border-warning-border bg-warning/10 p-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-warning">
                  Latest review note
                </Text>
                <Text className="mt-1 text-sm">{profile.adminReviewNote}</Text>
              </div>
            ) : null}

            <ReviewSection
              title="Profile"
              status={sectionStatuses.profile}
              showStatus={showSectionStatus("profile")}
            >
              {isTutorReviewValueEmpty(profile.shortBio) ? (
                <div className="flex flex-col gap-2">
                  <ReviewEmptyState
                    title="No introduction provided"
                    description="The tutor has not added a short profile introduction yet."
                  />
                  {profile.affiliation ? (
                    <Text className="font-medium">{profile.affiliation}</Text>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Text className="leading-relaxed text-muted">
                    {profile.shortBio?.trim()}
                  </Text>
                  {profile.affiliation ? (
                    <Text className="font-medium">{profile.affiliation}</Text>
                  ) : null}
                </div>
              )}
            </ReviewSection>

            <ReviewSection
              title="Teaching setup"
              status={sectionStatuses.teaching}
              showStatus={showSectionStatus("teaching")}
            >
              {!hasTeachingSetup ? (
                <ReviewEmptyState
                  title="No teaching setup provided"
                  description="Teaching mode and specializations have not been set yet."
                />
              ) : (
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
                                MODALITY_VARIANTS[profile.modality] ??
                                "secondary"
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
              )}
            </ReviewSection>

            <ReviewSection
              title="Credentials"
              status={sectionStatuses.credentials}
              showStatus={showSectionStatus("credentials")}
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
                          achievements={[]}
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
                          achievements={profile.achievements}
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
                          experiences={profile.experiences}
                          idPrefix={`admin-${profile.id}-experiences`}
                        />
                      </CardBody>
                    </Card>
                  ) : null}
                </div>
              ) : (
                <ReviewEmptyState
                  title="No credentials provided"
                  description="Education, achievements, and experience entries are empty."
                />
              )}
            </ReviewSection>

            <ReviewSection
              title="Proofs"
              status={sectionStatuses.proofs}
              showStatus={showSectionStatus("proofs")}
            >
              {proofRows.length > 0 ? (
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
              ) : (
                <ReviewEmptyState
                  title="No proof links provided"
                  description="Achievement and experience evidence links are empty."
                />
              )}
            </ReviewSection>

            <ReviewSection
              title="Marks per student"
              status={sectionStatuses.marks}
              showStatus={showSectionStatus("marks")}
            >
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
                <ReviewEmptyState
                  title="No price list provided"
                  description="The tutor has not added a Marks price list yet."
                />
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

            <ReviewSection
              title="Profile photo"
              status={sectionStatuses.photo}
              showStatus={showSectionStatus("photo")}
            >
              {currentProfileImageUrl || pendingProfileImageUrl ? (
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
              ) : (
                <ReviewEmptyState
                  title="No profile photo provided"
                  description="The tutor has not submitted a profile photo yet."
                />
              )}
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

            <ReviewSection
              title="Payout account"
              status={sectionStatuses.payout}
              showStatus={showSectionStatus("payout")}
            >
              {payoutRows.length > 0 ? (
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
              ) : (
                <ReviewEmptyState
                  title="No payout account provided"
                  description="Private transfer details have not been added yet."
                />
              )}
            </ReviewSection>
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
              achievements={achievementDraft.achievements}
              onEducationChange={(education) =>
                setAchievementDraft((current) => ({ ...current, education }))
              }
              onAchievementsChange={(achievements) =>
                setAchievementDraft((current) => ({
                  ...current,
                  achievements,
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
  status,
  showStatus = true,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  status?: ReviewSectionStatus;
  showStatus?: boolean;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Heading size="sm">{title}</Heading>
          {status && showStatus ? (
            <Badge
              variant={status === "changes" ? "warning" : "secondary"}
              size="sm"
              pill
            >
              {status === "changes" ? "~ Changes" : "Empty"}
            </Badge>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
