"use client";

import { Text } from "@cogito-app/ui/components/selia/text";

export type ProfilePhotoHistoryEntry = {
  id: string;
  action: string;
  actorType: string;
  actor?: { name: string | null; email?: string | null } | null;
  createdAt: string | Date;
  details?: Record<string, unknown> | null;
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
          return (
            <li key={entry.id} className="relative">
              <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-primary" />
              <Text className="text-sm font-medium">
                {historyLabel(entry.action)}
              </Text>
              <Text className="mt-0.5 text-xs text-muted">
                {actor} · {new Date(entry.createdAt).toLocaleString()}
              </Text>
              {stage ? (
                <Text className="mt-0.5 text-xs text-muted">{stage}</Text>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
