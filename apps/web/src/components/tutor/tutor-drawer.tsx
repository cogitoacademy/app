"use client";

import { useEffect, useState } from "react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Avatar, AvatarFallback } from "@cogito-app/ui/components/selia/avatar";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text } from "@cogito-app/ui/components/selia/text";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerPopup,
  DrawerTitle,
} from "@cogito-app/ui/components/selia/drawer";
import { Button } from "@cogito-app/ui/components/selia/button";
import { IconX } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { CogitoMarks } from "@/components/cogito-marks";
import {
  competitionPaletteClassName,
  getCompetitionPaletteStyle,
} from "@/lib/competition-colors";
import { groupTutorSubjects, type TutorSubject } from "./subject-taxonomy";
import { TutorPricingTable } from "./tutor-pricing-table";
import {
  TutorAchievementsDisplay,
  type TutorAchievement,
  type TutorEducationEntry,
} from "./tutor-achievements";
import type { TutorExperience } from "./tutor-experiences";

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

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

type TutorDrawerProps = {
  tutor: {
    id: string;
    userId: string;
    displayName: string | null;
    shortBio: string | null;
    affiliation: string | null;
    education: TutorEducationEntry[] | null;
    achievements: TutorAchievement[] | null;
    experiences: TutorExperience[] | null;
    subjects?: TutorSubject[] | null;
    modality: string | null;
    onlineMaxClassSize: number;
    offlineMaxClassSize: number;
    pricesByCompetition?: Record<
      string,
      Partial<Record<"online" | "offline", Record<string, number>>>
    > | null;
    pricingRevision?: number | null;
    publishedAt: Date | null;
    user: { name: string | null; image: string | null } | null;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showBookingAction?: boolean;
};

type PricingModality = "online" | "offline";
type PricingMap = Record<string, number>;
type PricingByModality = Partial<Record<PricingModality, PricingMap>>;
const PRICING_MODALITIES = ["online", "offline"] as const;

function getPricingTableData(pricesByModality: PricingByModality) {
  const priceMaps = pricesByModality;
  const modalities = PRICING_MODALITIES.filter(
    (currentModality) =>
      Object.keys(priceMaps[currentModality] ?? {}).length > 0,
  );
  const groupSizes = new Set(
    modalities.flatMap((currentModality) =>
      Object.keys(priceMaps[currentModality] ?? {}),
    ),
  );
  const rows = [...groupSizes]
    .toSorted((a, b) => Number(a) - Number(b))
    .map((size) => ({
      size,
      online: priceMaps.online?.[size],
      offline: priceMaps.offline?.[size],
    }));

  return { modalities, rows };
}

export function TutorDrawer({
  tutor,
  open,
  onOpenChange,
  showBookingAction = true,
}: TutorDrawerProps) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 640px)");
    const updateViewport = () => setIsDesktop(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  const t = tutor;
  if (!t) return null;

  const selectedTutor = t;
  const tutorName = selectedTutor.user?.name ?? "Tutor";

  const subjectGroups = groupTutorSubjects(selectedTutor.subjects);
  const competitionPriceTables = subjectGroups.flatMap((group) => {
    const parent = group.parent;
    const prices = parent
      ? selectedTutor.pricesByCompetition?.[parent.slug]
      : undefined;
    if (!parent || !prices) return [];
    const table = getPricingTableData(prices);
    return [{ slug: parent.slug, name: parent.name, ...table }];
  });
  const subjectLabels = subjectGroups.flatMap((group) =>
    group.children.map((subject) => ({
      id: subject.id,
      label: subject.name,
      parentColors: group.parent?.parentColors,
    })),
  );
  const heroSubjects = subjectLabels.slice(0, 3);
  const hasEducation = Boolean(selectedTutor.education?.length);
  const hasAchievements = Boolean(selectedTutor.achievements?.length);
  const hasExperiences = Boolean(selectedTutor.experiences?.length);
  const hasProfileHighlights =
    hasEducation || hasAchievements || hasExperiences;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      swipeDirection={isDesktop ? "right" : "down"}
    >
      <DrawerPopup
        direction={isDesktop ? "right" : "bottom"}
        className={isDesktop ? "w-full max-w-lg" : undefined}
      >
        <div className="relative max-h-[270px] md:h-[300px] shrink-0 rounded-t-xl overflow-hidden bg-muted">
          {selectedTutor.user?.image ? (
            <img
              src={selectedTutor.user.image}
              alt={tutorName}
              className="size-full object-cover object-top"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-avatar h-[270px]">
              <Avatar size="lg" className="size-24!">
                <AvatarFallback>{getInitials(tutorName)}</AvatarFallback>
              </Avatar>
            </div>
          )}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent"
          />
          {heroSubjects.length > 0 ? (
            <div className="absolute inset-x-4 bottom-4 z-10 flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
              {heroSubjects.map((subject) => (
                <Badge
                  key={subject.id}
                  variant="secondary"
                  size="md"
                  className={`shrink-0 max-w-[45%] truncate whitespace-nowrap shadow-sm ${subject.parentColors ? competitionPaletteClassName : ""}`}
                  style={getCompetitionPaletteStyle(subject.parentColors)}
                >
                  {subject.label}
                </Badge>
              ))}
              {subjectLabels.length > heroSubjects.length ? (
                <Badge
                  variant="secondary"
                  size="md"
                  className="shrink-0 bg-background/90 text-foreground"
                >
                  +{subjectLabels.length - heroSubjects.length}
                </Badge>
              ) : null}
            </div>
          ) : null}
          <DrawerClose
            render={
              <Button
                variant="outline"
                size="xs-icon"
                aria-label="Close"
                className="absolute top-4 right-4 z-20 bg-background/90 text-foreground shadow-sm hover:bg-background"
              />
            }
          >
            <IconX className="size-4" />
          </DrawerClose>
        </div>
        <DrawerBody>
          <div className="flex justify-between items-start flex-wrap gap-y-3  ">
            <DrawerTitle className="truncate text-xl md:text-2xl">
              {tutorName}
            </DrawerTitle>
            {t.modality && (
              <div>
                <Badge variant={MODALITY_VARIANTS[t.modality] ?? "secondary"}>
                  {MODALITY_LABELS[t.modality] ?? t.modality}
                </Badge>
              </div>
            )}
          </div>

          {t.affiliation ? (
            <Text className="font-medium">{t.affiliation}</Text>
          ) : null}
          {t.shortBio && (
            <div className="mt-3">
              <Text className="text-muted">{t.shortBio}</Text>
            </div>
          )}

          {
            <div className="mt-5">
              <Heading size="sm" className="mb-2">
                Pricing
              </Heading>
              {competitionPriceTables.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {competitionPriceTables.map((table) => (
                    <section key={table.slug}>
                      <Heading size="sm" level={4} className="mb-2">
                        {table.name}
                      </Heading>
                      <TutorPricingTable
                        modalities={table.modalities}
                        rows={table.rows}
                        columnLabels={{ online: "Online", offline: "Offline" }}
                        renderValue={(value) => (
                          <CogitoMarks size="3" value={value} />
                        )}
                      />
                    </section>
                  ))}
                </div>
              ) : (
                <Text className="text-sm text-muted">
                  Pricing is not available yet.
                </Text>
              )}
            </div>
          }

          {hasProfileHighlights ? (
            <section
              aria-label="Tutor profile highlights"
              className="mt-5 flex flex-col gap-3"
            >
              {hasEducation ? (
                <Card className="bg-accent shadow-none">
                  <CardBody className="p-4">
                    <TutorAchievementsDisplay
                      className="flex flex-col"
                      education={selectedTutor.education}
                      idPrefix="tutor-drawer-education"
                    />
                  </CardBody>
                </Card>
              ) : null}

              {hasAchievements ? (
                <Card className="bg-accent shadow-none">
                  <CardBody className="p-4">
                    <TutorAchievementsDisplay
                      className="flex flex-col"
                      achievements={selectedTutor.achievements}
                      idPrefix="tutor-drawer-achievements"
                    />
                  </CardBody>
                </Card>
              ) : null}

              {hasExperiences ? (
                <Card className="bg-accent shadow-none">
                  <CardBody className="p-4">
                    <TutorAchievementsDisplay
                      className="flex flex-col"
                      experiences={selectedTutor.experiences}
                      idPrefix="tutor-drawer-experiences"
                    />
                  </CardBody>
                </Card>
              ) : null}
            </section>
          ) : null}

          <DrawerDescription className="sr-only">
            Details for {t.user?.name ?? "tutor"} profile
          </DrawerDescription>
        </DrawerBody>
        <DrawerFooter>
          {showBookingAction ? (
            <Button
              block
              nativeButton={false}
              render={
                <Link
                  to="/tutors/$tutorId/book"
                  params={{ tutorId: selectedTutor.id }}
                  aria-label={`Book ${t.user?.name ?? "tutor"}`}
                />
              }
            >
              Book a session
            </Button>
          ) : (
            <DrawerClose
              render={
                <Button
                  block
                  variant="secondary"
                  type="button"
                  aria-label="Back to booking"
                />
              }
            >
              Back to booking
            </DrawerClose>
          )}
        </DrawerFooter>
      </DrawerPopup>
    </Drawer>
  );
}
