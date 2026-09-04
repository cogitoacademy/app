"use client";

import type { ReactNode } from "react";

import { Text } from "@cogito-app/ui/components/selia/text";

import { InfoPreview } from "@/components/info-preview";
import { resolveProfileImageUrl } from "@/lib/profile-image-url";

type ProfilePhotoPreviewTone = "info" | "success" | "warning";

/**
 * Keeps the full profile-photo preview behind the same compact information
 * popover used for meeting-link status in booking details.
 */
export function ProfilePhotoPreview({
  label,
  description,
  imageUrl,
  fallback,
  tone = "info",
}: {
  label: string;
  description: ReactNode;
  imageUrl: string | null;
  fallback: string;
  tone?: ProfilePhotoPreviewTone;
}) {
  const resolvedImageUrl = resolveProfileImageUrl(imageUrl);

  return (
    <InfoPreview
      title={`${label} preview`}
      description={description}
      tone={tone}
      label={`Preview ${label.toLowerCase()}`}
    >
      <div className="flex items-center gap-3">
        {resolvedImageUrl ? (
          <img
            src={resolvedImageUrl}
            alt={`${label} preview`}
            width={128}
            height={128}
            className="size-32 rounded-lg object-cover"
          />
        ) : (
          <div className="flex size-32 items-center justify-center rounded-lg bg-accent text-xl font-semibold text-muted">
            {fallback}
          </div>
        )}
        <Text className="max-w-32 text-xs text-muted">
          Hover or tap the info icon to view this image.
        </Text>
      </div>
    </InfoPreview>
  );
}
