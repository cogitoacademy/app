import { z } from "zod";

import type { CompetitionPalette } from "../competition-catalog/competition-catalog.types";

export const listPublicTutorsInput = z.object({}).strict();
// The marketing site sends a locale. The app calendar currently stores one
// English value per field, so the locale is accepted for contract compatibility
// but does not change the response.
export const listPublicCalendarInput = z
  .object({ locale: z.enum(["en", "id"]).default("en") })
  .strict();

export type PublicTutorDto = {
  id: string;
  name: string;
  profileImageUrl: string | null;
  shortBio: string | null;
  affiliation: string | null;
  education: Array<{ university: string; degree: string }>;
  achievements: Array<{
    competitionName: string;
    year: number;
    awards: string[];
  }>;
  experiences: Array<{
    role: string;
    organization: string;
    startYear: number;
    endYear: number | null;
    description: string;
  }>;
  subjects: Array<{
    id: string;
    slug: string;
    name: string;
    nameId: string | null;
    parent: {
      id: string;
      slug: string;
      name: string;
      nameId: string | null;
      lightTextColor: string | null;
      lightBackgroundColor: string | null;
      darkTextColor: string | null;
      darkBackgroundColor: string | null;
    };
  }>;
  modality: "online" | "offline" | "both" | null;
};

export type PublicCalendarEventDto = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startDate: string;
  endDate: string;
  categories: Array<{
    id: string;
    slug: string;
    name: string;
    parentColors: CompetitionPalette | null;
  }>;
  educationLevels: string[];
  scale: string | null;
  organizer: string | null;
  registrationDeadline: string | null;
  registrationLink: string | null;
  socialMediaLink: string | null;
};
