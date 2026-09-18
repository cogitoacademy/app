"use client";

import { IconExternalLink } from "@tabler/icons-react";

import { Button } from "@cogito-app/ui/components/selia/button";

import {
  sanityStudioStructureUrl,
  type SanityStudioStructureType,
} from "./sanity-studio";

export function SanityStudioEditButton({
  type,
  label,
}: {
  type: SanityStudioStructureType;
  label: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      className="shrink-0"
      nativeButton={false}
      render={
        <a
          href={sanityStudioStructureUrl(type)}
          target="_blank"
          rel="noreferrer"
          aria-label={`${label} in Sanity Studio (opens in a new tab)`}
        />
      }
    >
      <IconExternalLink /> {label}
    </Button>
  );
}
