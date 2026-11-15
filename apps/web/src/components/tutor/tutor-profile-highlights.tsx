"use client";

import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import {
  TutorAchievementsDisplay,
  type TutorEducationEntry,
  type TutorAchievement,
} from "./tutor-achievements";
import type { TutorExperience } from "./tutor-experiences";

export function TutorProfileHighlights({
  education,
  achievements,
  experiences,
  idPrefix = "tutor-highlights",
}: {
  education?: readonly TutorEducationEntry[] | null;
  achievements?: readonly TutorAchievement[] | null;
  experiences?: readonly TutorExperience[] | null;
  idPrefix?: string;
}) {
  const hasEducation = Boolean(education?.length);
  const hasAchievements = Boolean(achievements?.length);
  const hasExperiences = Boolean(experiences?.length);
  return (
    <section
      aria-label="Tutor profile highlights"
      className="flex flex-col gap-3"
    >
      {hasEducation ? (
        <Card className="bg-accent shadow-none">
          <CardBody className="p-4">
            <TutorAchievementsDisplay
              className="flex flex-col"
              education={education}
              idPrefix={`${idPrefix}-education`}
            />
          </CardBody>
        </Card>
      ) : null}

      {hasAchievements ? (
        <Card className="bg-accent shadow-none">
          <CardBody className="p-4">
            <TutorAchievementsDisplay
              className="flex flex-col"
              achievements={achievements}
              idPrefix={`${idPrefix}-achievements`}
            />
          </CardBody>
        </Card>
      ) : null}

      {hasExperiences ? (
        <Card className="bg-accent shadow-none">
          <CardBody className="p-4">
            <TutorAchievementsDisplay
              className="flex flex-col"
              experiences={experiences}
              idPrefix={`${idPrefix}-experiences`}
            />
          </CardBody>
        </Card>
      ) : null}
    </section>
  );
}
