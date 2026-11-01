import { z } from "zod";

export const listPublicTutorsInput = z.object({}).strict();

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
