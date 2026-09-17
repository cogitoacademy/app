"use client";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Text } from "@cogito-app/ui/components/selia/text";
import { resolveProfileImageUrl } from "@/lib/profile-image-url";

export type ProfilePhotoHistoryEntry = {
  id: string;
  action: string;
  actorType: string;
  actor?: { name: string | null; email?: string | null } | null;
  createdAt: string | Date;
  beforeState?: unknown;
  afterState?: unknown;
  details?: Record<string, unknown> | null;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Needs review",
  changes_requested: "Changes requested",
  approved_unpublished: "Approved",
  published: "Published",
  suspended: "Suspended",
};

function historyLabel(action: string) {
  switch (action) {
    case "tutor_profile_photo_proposed":
      return "Tutor submitted a new profile photo";
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
}: {
  details: Record<string, unknown> | null | undefined;
}) {
  const previous = readString(details, "previousProfileImageUrl");
  const next =
    readString(details, "submittedProfileImageUrl") ??
    readString(details, "proposedProfileImageUrl");
  if (!previous && !next) return null;
  const thumbs: Array<{ label: string; url: string }> = [];
  if (previous) {
    const resolved = resolveProfileImageUrl(previous) ?? previous;
    thumbs.push({ label: "Before", url: resolved });
  }
  if (next) {
    const resolved = resolveProfileImageUrl(next) ?? next;
    thumbs.push({ label: "After", url: resolved });
  }
  return (
    <div className="mt-2 flex items-center gap-3">
      {thumbs.map((thumb) => (
        <a
          key={thumb.label}
          href={thumb.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5"
        >
          <img
            src={thumb.url}
            alt={`${thumb.label} tutor avatar`}
            width={40}
            height={40}
            className="size-10 rounded-lg object-cover"
          />
          <Text className="text-xs text-muted">{thumb.label}</Text>
        </a>
      ))}
    </div>
  );
}

export function ProfilePhotoHistory({
  entries,
  title = "Profile history",
}: {
  entries: ProfilePhotoHistoryEntry[];
  title?: string;
}) {
  if (entries.length === 0) return null;

  return (
    <section className="rounded-lg border border-item-border bg-item p-3">
      <Text className="text-xs font-semibold uppercase tracking-wide text-dimmed">
        {title}
      </Text>
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
          return (
            <li key={entry.id} className="relative">
              <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-primary" />
              <Text className="text-sm font-medium">
                {historyLabel(entry.action)}
              </Text>
              <Text className="mt-0.5 text-xs text-muted">
                {actor} · {new Date(entry.createdAt).toLocaleString()}
              </Text>
              {statusChanged ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" size="sm">
                    {STATUS_LABELS[beforeStatus] ?? beforeStatus}
                  </Badge>
                  <span aria-hidden="true" className="text-xs text-muted">
                    →
                  </span>
                  <Badge variant="secondary" size="sm">
                    {STATUS_LABELS[afterStatus] ?? afterStatus}
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
              <HistoryPhotoChange details={entry.details} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
