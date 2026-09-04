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
import { Separator } from "@cogito-app/ui/components/selia/separator";
import { Text } from "@cogito-app/ui/components/selia/text";
import { IconChevronRight } from "@tabler/icons-react";
import { CogitoMarks } from "@/components/cogito-marks";
import { groupTutorSubjects, type TutorSubject } from "./subject-taxonomy";

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
  subjects?: TutorSubject[] | null;
  modality: string | null;
  prices?: Record<string, number> | null;
  pricesByModality?: Partial<
    Record<"online" | "offline", Record<string, number>>
  > | null;
  user: { name: string | null; image: string | null } | null;
};

type TutorCardProps = {
  tutor: TutorSummaryData;
  onClick: () => void;
};

function getStartingPrice(tutor: TutorSummaryData) {
  const allPrices = tutor.pricesByModality
    ? Object.values(tutor.pricesByModality).flatMap((prices) =>
        prices ? Object.values(prices) : [],
      )
    : tutor.prices
      ? Object.values(tutor.prices)
      : [];
  return allPrices.length > 0 ? Math.min(...allPrices) : null;
}

function getTutorSubjectLabels(
  tutor: TutorSummaryData,
  includeCategory: boolean,
) {
  return groupTutorSubjects(tutor.subjects, tutor.expertise).flatMap((group) =>
    group.children.map((child) => ({
      id: child.id,
      label:
        includeCategory && group.parent
          ? `${group.parent.name}: ${child.name}`
          : child.name,
    })),
  );
}

export function TutorSummary({
  tutor,
  action,
}: {
  tutor: TutorSummaryData;
  action?: ReactNode;
}) {
  const tutorName = tutor.user?.name ?? "Tutor";
  const startingPrice = getStartingPrice(tutor);
  const subjectLabels = getTutorSubjectLabels(tutor, true);

  return (
    <Item className="items-center border-0 bg-transparent p-0!" size="lg">
      <ItemMedia>
        <Avatar size="md" className="size-[67px]!">
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
        <ItemDescription className="line-clamp-1">
          {tutor.shortBio ?? "A verified Cogito tutor ready to help you learn."}
        </ItemDescription>
        <ItemMeta className="flex flex-wrap gap-1.5">
          {subjectLabels.slice(0, 1).map((subject) => (
            <Badge key={subject.id} variant="tertiary" size="sm">
              {subject.label}
            </Badge>
          ))}
          {subjectLabels.length > 1 && (
            <Badge variant="secondary" size="sm">
              +{subjectLabels.length - 1}
            </Badge>
          )}
          {startingPrice !== null && (
            <span
              className="ml-1 inline-flex items-center gap-1 self-center whitespace-nowrap"
              aria-label={`From ${startingPrice} Marks`}
            >
              From
              <img
                src="/cogito-mark.png"
                alt=""
                aria-hidden="true"
                width={12}
                height={12}
                className="size-3 shrink-0 object-contain"
              />
              <span>{startingPrice}</span>
            </span>
          )}
        </ItemMeta>
      </ItemContent>
      {action ? (
        <ItemAction className="hidden sm:flex">{action}</ItemAction>
      ) : null}
    </Item>
  );
}

function MobileTutorCardContent({ tutor }: { tutor: TutorSummaryData }) {
  const tutorName = tutor.user?.name ?? "Tutor";
  const startingPrice = getStartingPrice(tutor);
  const subjectLabels = getTutorSubjectLabels(tutor, false);

  return (
    <div className="sm:hidden">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar size="md" className="size-14! shrink-0 rounded-md!">
          <AvatarImage
            src={tutor.user?.image ?? undefined}
            alt={tutorName}
            className="rounded-md!"
          />
          <AvatarFallback className="rounded-md!">
            {getInitials(tutorName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Text className="min-w-0 truncate font-semibold">{tutorName}</Text>
            {tutor.modality ? (
              <Badge
                variant={MODALITY_VARIANTS[tutor.modality] ?? "secondary"}
                size="sm"
                className="shrink-0"
              >
                {MODALITY_LABELS[tutor.modality] ?? tutor.modality}
              </Badge>
            ) : null}
          </div>
          <Text className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">
            {tutor.shortBio ??
              "A verified Cogito tutor ready to help you learn."}
          </Text>
        </div>
      </div>

      {subjectLabels.length > 0 ? (
        <div className="mt-3 flex min-w-0 items-center gap-1.5">
          <Badge
            variant="tertiary"
            size="sm"
            className="min-w-0 max-w-full truncate"
          >
            {subjectLabels[0]?.label}
          </Badge>
          {subjectLabels.length > 1 ? (
            <Badge
              variant="secondary"
              size="sm"
              className="shrink-0 tabular-nums"
            >
              +{subjectLabels.length - 1}
            </Badge>
          ) : null}
        </div>
      ) : null}

      <Separator className="my-3" />
      <div className="flex items-center gap-3">
        <Text className="text-sm text-muted">Starting from</Text>
        <div className="ml-auto flex items-center gap-1 font-semibold tabular-nums">
          {startingPrice !== null ? (
            <CogitoMarks value={startingPrice} size="3" />
          ) : (
            <Text className="text-sm text-muted">View pricing</Text>
          )}
          <IconChevronRight className="size-4 text-dimmed" />
        </div>
      </div>
    </div>
  );
}

export function TutorCard({ tutor, onClick }: TutorCardProps) {
  const tutorName = tutor.user?.name ?? "Tutor";
  const startingPrice = getStartingPrice(tutor);
  const accessibleName = `${tutorName}${
    startingPrice !== null ? `, From ${startingPrice} Marks` : ""
  }`;

  return (
    <Card
      render={<button type="button" aria-label={accessibleName} />}
      className="w-full cursor-pointer text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-card active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 [&_[data-slot=avatar]]:rounded-md [&_[data-slot=avatar-image]]:rounded-md [&_[data-slot=avatar-fallback]]:rounded-md"
      aria-label={accessibleName}
      onClick={onClick}
    >
      <CardBody className="p-4 sm:p-6">
        <MobileTutorCardContent tutor={tutor} />
        <div className="hidden sm:block">
          <TutorSummary tutor={tutor} />
        </div>
      </CardBody>
    </Card>
  );
}
