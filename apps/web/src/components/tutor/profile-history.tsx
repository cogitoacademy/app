"use client";

import { useState } from "react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Text } from "@cogito-app/ui/components/selia/text";
import { resolveProfileImageUrl } from "@/lib/profile-image-url";
import {
  getTutorProfileFieldLabel,
  getTutorStatusLabel,
  stripPendingProfileChangesPrefix,
} from "./profile-field-presentation";
import { TutorProfileValue } from "./profile-value";

export type TutorProfileHistoryEntry = {
  id: string;
  action: string;
  actorType: string;
  actor?: { name: string | null; email?: string | null } | null;
  createdAt: string | Date;
  beforeState?: unknown;
  afterState?: unknown;
  details?: Record<string, unknown> | null;
};

function historyLabel(action: string) {
  switch (action) {
    case "tutor_profile_photo_proposed":
      return "Tutor submitted a new profile photo";
    case "tutor_profile_changes_proposed":
      return "Tutor proposed profile changes";
    case "tutor_profile_updated":
      return "Tutor updated the profile";
    case "tutor_profile_submitted_for_review":
      return "Tutor submitted the profile for review";
    case "tutor_profile_request_changes":
      return "Admin requested changes to the profile";
    case "tutor_profile_approve_unpublished":
      return "Admin approved the profile";
    case "tutor_profile_publish":
      return "Admin published the profile";
    case "tutor_profile_approve_edits":
      return "Admin approved the proposed profile changes";
    case "tutor_profile_request_edit_changes":
      return "Admin requested changes to the proposed edits";
    case "tutor_profile_unpublish":
      return "Admin unpublished the profile";
    case "tutor_profile_suspend":
      return "Admin suspended the profile";
    case "tutor_achievements_updated":
      return "Admin corrected achievements format";
    case "tutor_invite_created":
      return "Admin created the tutor invite";
    default:
      return action.replaceAll("_", " ");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readChangedFields(
  details: Record<string, unknown> | null | undefined,
): string[] {
  return Array.isArray(details?.changedFields)
    ? details.changedFields.filter(
        (field): field is string =>
          typeof field === "string" && field.length > 0,
      )
    : [];
}

function readHistoryPath(source: unknown, path: string): unknown {
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

function collectHistoryChanges(
  before: unknown,
  after: unknown,
  path: string,
  changes: Array<{ path: string; before: unknown; after: unknown }>,
) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  if (isRecord(before) && isRecord(after)) {
    for (const field of Array.from(
      new Set([...Object.keys(before), ...Object.keys(after)]),
    ).toSorted()) {
      collectHistoryChanges(
        before[field],
        after[field],
        path ? `${path}.${field}` : field,
        changes,
      );
    }
    return;
  }
  changes.push({ path, before, after });
}

function HistoryFieldChanges({
  before,
  after,
  changedFields,
  subjectLabels,
  subjectFieldSlugs,
  idPrefix,
}: {
  before: unknown;
  after: unknown;
  changedFields: string[];
  subjectLabels?: ReadonlyMap<string, string>;
  subjectFieldSlugs?: ReadonlyMap<string, string>;
  idPrefix: string;
}) {
  const changes = changedFields.length
    ? changedFields.map((path) => ({
        path,
        before:
          readHistoryPath(before, path) ??
          readHistoryPath(before, stripPendingProfileChangesPrefix(path)),
        after:
          readHistoryPath(after, path) ??
          readHistoryPath(after, stripPendingProfileChangesPrefix(path)),
      }))
    : (() => {
        const fallback: Array<{
          path: string;
          before: unknown;
          after: unknown;
        }> = [];
        collectHistoryChanges(before, after, "", fallback);
        return fallback;
      })();
  const visibleChanges = changes.filter(
    (change) => change.path !== "profileImageUrl",
  );
  if (visibleChanges.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {visibleChanges.map(({ path, before: previous, after: next }) => (
        <div
          key={path}
          className="rounded-lg border border-item-border bg-background p-2.5"
        >
          <Text className="text-xs font-semibold">
            {getTutorProfileFieldLabel(path)}
          </Text>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            <div className="min-w-0">
              <Text className="text-xs text-dimmed">Before</Text>
              <div className="mt-0.5 min-w-0 text-muted">
                <TutorProfileValue
                  path={path}
                  value={previous}
                  subjectLabels={subjectLabels}
                  subjectFieldSlugs={subjectFieldSlugs}
                  idPrefix={`${idPrefix}-before`}
                />
              </div>
            </div>
            <div className="min-w-0">
              <Text className="text-xs text-dimmed">After</Text>
              <div className="mt-0.5 min-w-0 font-medium">
                <TutorProfileValue
                  path={path}
                  value={next}
                  subjectLabels={subjectLabels}
                  subjectFieldSlugs={subjectFieldSlugs}
                  idPrefix={`${idPrefix}-after`}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function stageLabel(details: Record<string, unknown> | null | undefined) {
  switch (details?.photoStage ?? details?.stage) {
    case "source_submitted":
      return "Source photo received";
    case "proposed":
      return "Waiting for admin review";
    case "edited":
      return "Edited asset prepared";
    case "published":
      return "Now visible to students";
    default:
      return null;
  }
}

function readString(
  details: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readStatus(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "onboardingStatus" in value
  ) {
    const status = (value as { onboardingStatus?: unknown }).onboardingStatus;
    return typeof status === "string" && status ? status : null;
  }
  return null;
}

function HistoryPhotoChange({
  details,
  beforeState,
  afterState,
}: {
  details: Record<string, unknown> | null | undefined;
  beforeState?: unknown;
  afterState?: unknown;
}) {
  const previous =
    readString(details, "previousProfileImageUrl") ??
    (isRecord(beforeState) && typeof beforeState.profileImageUrl === "string"
      ? beforeState.profileImageUrl
      : null);
  const next =
    readString(details, "submittedProfileImageUrl") ??
    readString(details, "proposedProfileImageUrl") ??
    (isRecord(afterState) && typeof afterState.profileImageUrl === "string"
      ? afterState.profileImageUrl
      : null);
  if (!previous && !next) return null;
  const thumbs: Array<{ label: string; url: string | null }> = [
    {
      label: "Before",
      url: previous ? (resolveProfileImageUrl(previous) ?? previous) : null,
    },
    {
      label: "After",
      url: next ? (resolveProfileImageUrl(next) ?? next) : null,
    },
  ];
  return (
    <div className="mt-2 flex items-center gap-3">
      {thumbs.map((thumb) => (
        <div key={thumb.label} className="flex items-center gap-1.5">
          {thumb.url ? (
            <a href={thumb.url} target="_blank" rel="noreferrer">
              <img
                src={thumb.url}
                alt={`${thumb.label} tutor avatar`}
                width={40}
                height={40}
                className="size-10 rounded-lg object-cover"
              />
            </a>
          ) : (
            <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-xs text-dimmed">
              —
            </span>
          )}
          <Text className="text-xs text-muted">{thumb.label}</Text>
        </div>
      ))}
    </div>
  );
}

export function TutorProfileHistory({
  entries,
  title = "Tutor profile history",
  description,
  subjectLabels,
  subjectFieldSlugs,
}: {
  entries: TutorProfileHistoryEntry[];
  title?: string;
  description?: string;
  subjectLabels?: ReadonlyMap<string, string>;
  subjectFieldSlugs?: ReadonlyMap<string, string>;
}) {
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(
    () => new Set(),
  );

  if (entries.length === 0) return null;

  return (
    <section className="rounded-lg border border-item-border bg-item p-3">
      <Text className="text-xs font-semibold uppercase tracking-wide text-dimmed">
        {title}
      </Text>
      {description ? (
        <Text className="mt-1 text-sm text-muted">{description}</Text>
      ) : null}
      <ol className="mt-3 space-y-3 border-l border-item-border pl-4">
        {entries.map((entry) => {
          const actor =
            entry.actor?.name || entry.actor?.email || entry.actorType;
          const stage = stageLabel(entry.details);
          const beforeStatus = readStatus(entry.beforeState);
          const afterStatus = readStatus(entry.afterState);
          const statusChanged =
            beforeStatus && afterStatus && beforeStatus !== afterStatus;
          const adminNote = readString(entry.details, "adminNote");
          const changedFields = readChangedFields(entry.details);
          const expanded = expandedEntries.has(entry.id);
          const detailsId = `profile-history-${entry.id}`;
          return (
            <li key={entry.id} className="relative">
              <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-primary" />
              <div className="rounded-lg border border-item-border bg-background p-2.5">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={detailsId}
                  onClick={() =>
                    setExpandedEntries((current) => {
                      const next = new Set(current);
                      if (next.has(entry.id)) next.delete(entry.id);
                      else next.add(entry.id);
                      return next;
                    })
                  }
                  className="flex w-full items-start justify-between gap-3 text-left focus-visible:outline-0 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="min-w-0">
                    <Text className="text-sm font-medium">
                      {historyLabel(entry.action)}
                    </Text>
                    <Text className="mt-0.5 text-xs text-muted">
                      {actor} · {new Date(entry.createdAt).toLocaleString()}
                    </Text>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {expanded
                      ? "Hide"
                      : changedFields.length
                        ? `${changedFields.length} fields`
                        : "Details"}
                  </span>
                </button>
                <div id={detailsId} hidden={!expanded}>
                  {statusChanged ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" size="sm">
                        {getTutorStatusLabel(beforeStatus)}
                      </Badge>
                      <span aria-hidden="true" className="text-xs text-muted">
                        →
                      </span>
                      <Badge variant="secondary" size="sm">
                        {getTutorStatusLabel(afterStatus)}
                      </Badge>
                    </div>
                  ) : null}
                  {adminNote ? (
                    <Text className="mt-1.5 border-l-2 border-warning-border pl-2 text-sm text-muted">
                      “{adminNote}”
                    </Text>
                  ) : null}
                  {stage ? (
                    <Text className="mt-0.5 text-xs text-muted">{stage}</Text>
                  ) : null}
                  <HistoryFieldChanges
                    before={entry.beforeState}
                    after={entry.afterState}
                    changedFields={changedFields}
                    subjectLabels={subjectLabels}
                    subjectFieldSlugs={subjectFieldSlugs}
                    idPrefix={detailsId}
                  />
                  <HistoryPhotoChange
                    details={entry.details}
                    beforeState={entry.beforeState}
                    afterState={entry.afterState}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
