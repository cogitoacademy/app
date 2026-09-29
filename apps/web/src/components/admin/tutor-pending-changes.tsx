"use client";

import { useState } from "react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Chip } from "@cogito-app/ui/components/selia/chip";
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
import { Text } from "@cogito-app/ui/components/selia/text";
import { IconChevronDown, IconInbox, IconSearch } from "@tabler/icons-react";

import { EmptyState } from "@/components/empty-state";
import {
  buildTutorReviewDiffs,
  filterTutorReviewDiffs,
  isActualTutorReviewChange,
  summarizeTutorReviewDiffs,
  TUTOR_REVIEW_DIFF_FILTERS,
  type TutorReviewDiff,
  type TutorReviewDiffFilter,
  type TutorReviewDiffStatus,
} from "./tutor-review-diff";
import { getTutorProfileFieldLabel } from "@/components/tutor/profile-field-presentation";
import {
  formatTutorProfileValueSummary,
  TutorProfileValue,
} from "@/components/tutor/profile-value";
import { cn } from "@cogito-app/ui/lib/utils";

const DIFF_STATUS_META: Record<
  TutorReviewDiffStatus,
  {
    label: string;
    symbol: string;
    variant: "success" | "warning" | "danger" | "secondary";
  }
> = {
  added: { label: "Added", symbol: "+", variant: "success" },
  modified: { label: "Changed", symbol: "~", variant: "warning" },
  removed: { label: "Removed", symbol: "-", variant: "danger" },
  filled: { label: "Filled", symbol: "check", variant: "secondary" },
  empty: { label: "Empty", symbol: "empty", variant: "secondary" },
};

const DIFF_FILTER_LABELS: Record<TutorReviewDiffFilter, string> = {
  all: "All",
  added: "Added",
  modified: "Changed",
  removed: "Removed",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPath(source: unknown, path: string) {
  let value = source;
  for (const part of path.split(".")) {
    if (Array.isArray(value)) {
      const index = Number(part);
      value = Number.isInteger(index) ? value[index] : undefined;
    } else if (isRecord(value)) {
      value = value[part];
    } else {
      return undefined;
    }
  }
  return value;
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

function PendingChangeRow({
  diff,
  expanded,
  onToggle,
  subjectLabels,
  subjectFieldSlugs,
  idPrefix,
}: {
  diff: TutorReviewDiff;
  expanded: boolean;
  onToggle: () => void;
  subjectLabels?: ReadonlyMap<string, string>;
  subjectFieldSlugs?: ReadonlyMap<string, string>;
  idPrefix: string;
}) {
  const detailsId = `${idPrefix}-details`;
  const currentSummary = formatTutorProfileValueSummary(
    diff.field,
    diff.current,
    subjectLabels,
  );
  const proposedSummary = formatTutorProfileValueSummary(
    diff.field,
    diff.proposed,
    subjectLabels,
  );
  const fieldId = diff.field.replaceAll(/[^a-zA-Z0-9-]/g, "-");

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
            {DIFF_STATUS_META[diff.status].symbol}
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
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-lg border border-item-border bg-item p-3">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
              Current
            </Text>
            <div className="mt-2 min-w-0">
              <TutorProfileValue
                path={diff.field}
                value={diff.current}
                subjectLabels={subjectLabels}
                subjectFieldSlugs={subjectFieldSlugs}
                idPrefix={`${idPrefix}-${fieldId}-current`}
              />
            </div>
          </div>
          <div className="min-w-0 rounded-lg border border-warning-border/60 bg-warning/5 p-3">
            <Text className="text-xs font-semibold uppercase tracking-wide text-warning">
              Proposed
            </Text>
            <div className="mt-2 min-w-0">
              <TutorProfileValue
                path={diff.field}
                value={diff.proposed}
                subjectLabels={subjectLabels}
                subjectFieldSlugs={subjectFieldSlugs}
                idPrefix={`${idPrefix}-${fieldId}-proposed`}
              />
            </div>
          </div>
        </div>
      </div>
    </Item>
  );
}

export function TutorPendingChanges({
  profileId,
  pendingChanges,
  currentValues,
  subjectLabels,
  subjectFieldSlugs,
}: {
  profileId: string;
  pendingChanges: Record<string, unknown> | null;
  currentValues: Record<string, unknown>;
  subjectLabels?: ReadonlyMap<string, string>;
  subjectFieldSlugs?: ReadonlyMap<string, string>;
}) {
  const [diffFilter, setDiffFilter] = useState<TutorReviewDiffFilter>("all");
  const [diffSearch, setDiffSearch] = useState("");
  const [expandedFields, setExpandedFields] = useState<Set<string>>(
    () => new Set(),
  );

  const pendingEntries = Object.entries(pendingChanges ?? {}).filter(
    ([field]) => field !== "profileImageUrl",
  );
  const diffEntries = buildTutorReviewDiffs(
    pendingEntries,
    (field) => readPath(currentValues, field),
    getTutorProfileFieldLabel,
  ).filter((diff) => isActualTutorReviewChange(diff.status));
  const filteredDiffEntries = filterTutorReviewDiffs(
    diffEntries,
    diffFilter,
    diffSearch,
  );
  const diffSummary = summarizeTutorReviewDiffs(diffEntries);

  if (diffEntries.length === 0) return null;

  return (
    <section className="rounded-lg border border-warning-border bg-warning/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Text className="text-xs font-semibold uppercase tracking-wide text-warning">
            Fields awaiting approval
          </Text>
          <Text className="mt-1 text-sm text-muted">
            {diffEntries.length} review-gated field
            {diffEntries.length === 1 ? "" : "s"} changed
          </Text>
        </div>
        <div
          className="flex flex-wrap gap-1.5"
          aria-label={`${diffSummary.added} added, ${diffSummary.modified} changed, ${diffSummary.removed} removed`}
          aria-live="polite"
        >
          <Badge variant="success" size="sm" pill>
            +{diffSummary.added}
          </Badge>
          <Badge variant="warning" size="sm" pill>
            ~{diffSummary.modified}
          </Badge>
          <Badge variant="danger" size="sm" pill>
            -{diffSummary.removed}
          </Badge>
        </div>
      </div>
      <Text className="sr-only" aria-live="polite">
        {diffSummary.added} added, {diffSummary.modified} changed,{" "}
        {diffSummary.removed} removed.
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
                <button type="button" aria-label={DIFF_FILTER_LABELS[filter]} />
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
              expanded={expandedFields.has(diff.field)}
              onToggle={() =>
                setExpandedFields((current) => {
                  const next = new Set(current);
                  if (next.has(diff.field)) next.delete(diff.field);
                  else next.add(diff.field);
                  return next;
                })
              }
              subjectLabels={subjectLabels}
              subjectFieldSlugs={subjectFieldSlugs}
              idPrefix={`admin-${profileId}-pending`}
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
  );
}
