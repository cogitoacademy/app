"use client";

import type { ReactNode } from "react";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@cogito-app/ui/components/selia/avatar";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import {
  Item,
  ItemAction,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemMeta,
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";

const MODALITY_LABELS: Record<string, string> = {
  online: "Online",
  offline: "Offline",
  both: "Online & Offline",
};

const MODALITY_VARIANTS: Record<string, "info" | "success" | "warning"> = {
  online: "info",
  offline: "success",
  both: "warning",
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export type TutorSummaryData = {
  id: string;
  displayName: string | null;
  shortBio: string | null;
  expertise: string[];
  modality: string | null;
  prices?: Record<string, number> | null;
  user: { name: string | null; image: string | null } | null;
};

type TutorCardProps = {
  tutor: TutorSummaryData;
  onClick: () => void;
};

export function TutorSummary({
  tutor,
  action,
}: {
  tutor: TutorSummaryData;
  action?: ReactNode;
}) {
  const tutorName = tutor.displayName ?? tutor.user?.name ?? "Tutor";
  const startingPrice = tutor.prices
    ? Math.min(...Object.values(tutor.prices))
    : null;

  return (
    <Item className="items-center border-0 bg-transparent p-0!" size="lg">
      <ItemMedia>
        <Avatar size="md">
          <AvatarImage src={tutor.user?.image ?? undefined} alt={tutorName} />
          <AvatarFallback>{getInitials(tutorName)}</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <ItemTitle>{tutorName}</ItemTitle>
          {tutor.modality && (
            <Badge
              variant={MODALITY_VARIANTS[tutor.modality] ?? "secondary"}
              size="sm"
            >
              {MODALITY_LABELS[tutor.modality] ?? tutor.modality}
            </Badge>
          )}
        </div>
        <ItemDescription className="line-clamp-2">
          {tutor.shortBio ?? "A verified Cogito tutor ready to help you learn."}
        </ItemDescription>
        <ItemMeta className="mt-2 flex flex-wrap gap-1.5">
          {tutor.expertise.slice(0, 3).map((expertise) => (
            <Badge key={expertise} variant="tertiary" size="sm">
              {expertise}
            </Badge>
          ))}
          {tutor.expertise.length > 3 && (
            <Badge variant="secondary" size="sm">
              +{tutor.expertise.length - 3}
            </Badge>
          )}
          {startingPrice !== null && (
            <span className="ml-1 self-center">From {startingPrice} Marks</span>
          )}
        </ItemMeta>
      </ItemContent>
      {action ? (
        <ItemAction className="hidden sm:flex">{action}</ItemAction>
      ) : null}
    </Item>
  );
}

export function TutorCard({ tutor, onClick }: TutorCardProps) {
  return (
    <Card
      className="cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card"
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <CardBody>
        <TutorSummary tutor={tutor} />
      </CardBody>
    </Card>
  );
}
