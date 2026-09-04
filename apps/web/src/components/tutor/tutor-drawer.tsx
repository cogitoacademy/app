"use client";

import { useEffect, useState } from "react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Avatar, AvatarFallback } from "@cogito-app/ui/components/selia/avatar";
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
import { groupTutorSubjects, type TutorSubject } from "./subject-taxonomy";
import { TutorPricingTable } from "./tutor-pricing-table";
import {
  TutorAchievementsDisplay,
  type TutorCompetitionAchievement,
  type TutorEducationEntry,
} from "./tutor-achievements";
import type { TutorExperienceEntry } from "./tutor-experiences";

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
    credentialsSummary: string | null;
    achievements: string | null;
    experiences: string | null;
    education: TutorEducationEntry[] | null;
    competitionAchievements: TutorCompetitionAchievement[] | null;
    experienceEntries: TutorExperienceEntry[] | null;
    expertise: string[];
    subjects?: TutorSubject[] | null;
    modality: string | null;
    prices: Record<string, number> | null;
    pricesByModality?: Partial<
      Record<"online" | "offline", Record<string, number>>
    > | null;
    publishedAt: Date | null;
    user: { name: string | null; image: string | null } | null;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type PricingModality = "online" | "offline";
type PricingMap = Record<string, number>;
type PricingByModality = Partial<Record<PricingModality, PricingMap>>;
const PRICING_MODALITIES = ["online", "offline"] as const;

function getPricingTableData(
  pricesByModality: PricingByModality | null | undefined,
  legacyPrices: PricingMap | null,
  modality: string | null,
) {
  const priceMaps: PricingByModality = pricesByModality ?? {
    [modality === "offline" ? "offline" : "online"]: legacyPrices ?? {},
  };
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

export function TutorDrawer({ tutor, open, onOpenChange }: TutorDrawerProps) {
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

  const { modalities: priceModalities, rows: priceRows } = getPricingTableData(
    selectedTutor.pricesByModality,
    selectedTutor.prices,
    selectedTutor.modality,
  );
  const subjectGroups = groupTutorSubjects(
    selectedTutor.subjects,
    selectedTutor.expertise,
  );
  const subjectLabels = subjectGroups.flatMap((group) =>
    group.children.map((subject) => ({ id: subject.id, label: subject.name })),
  );
  const heroSubjects = subjectLabels.slice(0, 3);
  const hasProfileHighlights = Boolean(
    selectedTutor.education?.length ||
    selectedTutor.competitionAchievements?.length ||
    selectedTutor.experienceEntries?.length ||
    selectedTutor.achievements?.trim() ||
    selectedTutor.experiences?.trim() ||
    selectedTutor.credentialsSummary?.trim(),
  );

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
        <div className="relative h-[300px] shrink-0 rounded-t-xl overflow-hidden bg-muted">
          {selectedTutor.user?.image ? (
            <img
              src={selectedTutor.user.image}
              alt={tutorName}
              className="size-full object-cover object-top"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-accent">
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
              {heroSubjects.map((subject, index) => (
                <Badge
                  key={subject.id}
                  variant={
                    (["primary", "tertiary", "secondary"] as const)[index % 3]
                  }
                  size="md"
                  className="shrink-0 max-w-[45%] truncate whitespace-nowrap bg-background/90"
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
          <DrawerTitle className="truncate text-2xl">{tutorName}</DrawerTitle>
          {t.modality && (
            <div className="mt-3">
              <Badge variant={MODALITY_VARIANTS[t.modality] ?? "secondary"}>
                {MODALITY_LABELS[t.modality] ?? t.modality}
              </Badge>
            </div>
          )}
          {t.shortBio && (
            <div className="mt-3">
              <Text className="text-muted">{t.shortBio}</Text>
            </div>
          )}

          {subjectGroups.length > 0 && (
            <div className="mt-5">
              <Heading size="sm" className="mb-2">
                Specializations
              </Heading>
              <div className="flex flex-col gap-2">
                {subjectGroups.map((group) => (
                  <div key={group.parent?.id ?? group.children[0]?.id}>
                    {group.parent && (
                      <Text className="mb-1 font-medium">
                        {group.parent.name}
                      </Text>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {group.children.map((subject) => (
                        <Badge key={subject.id} variant="primary" size="md">
                          {subject.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {priceRows.length > 0 && (
            <div className="mt-5">
              <Heading size="sm" className="mb-2">
                Pricing
              </Heading>
              <TutorPricingTable
                modalities={priceModalities}
                rows={priceRows}
                columnLabels={{
                  online: "Online",
                  offline: "Offline",
                }}
                renderValue={(value) => <CogitoMarks size="3" value={value} />}
              />
            </div>
          )}

          {hasProfileHighlights ? (
            <section
              aria-labelledby="tutor-drawer-highlights-heading"
              className="mt-5 rounded-xl bg-accent p-4"
            >
              <TutorAchievementsDisplay
                className="flex flex-col gap-5"
                education={selectedTutor.education}
                competitionAchievements={selectedTutor.competitionAchievements}
                experienceEntries={selectedTutor.experienceEntries}
                legacyAchievementText={
                  selectedTutor.achievements?.trim()
                    ? selectedTutor.achievements
                    : selectedTutor.credentialsSummary
                }
                legacyExperienceText={selectedTutor.experiences}
                idPrefix="tutor-drawer-highlights"
              />
            </section>
          ) : null}

          <DrawerDescription className="sr-only">
            Details for {t.user?.name ?? "tutor"} profile
          </DrawerDescription>
        </DrawerBody>
        <DrawerFooter>
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
        </DrawerFooter>
      </DrawerPopup>
    </Drawer>
  );
}
