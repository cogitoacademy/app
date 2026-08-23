import { z } from "zod";

export const getStudentResourceFileInput = z.object({
  resourceId: z.string().min(1),
});

export type CompetitionContent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  categories: Array<{
    id: string;
    name: string;
    coreCategory: string;
  }>;
  educationLevels: string[];
  startDate: string;
  endDate: string;
  scale: string | null;
  organizer: string | null;
  registrationDeadline: string | null;
  registrationLink: string | null;
  socialMediaLink: string | null;
};
export type StudentResourceContent = {
  id: string;
  title: string;
  description: string | null;
  category: string;
};

export type StudentResourceFile = {
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
};

export type ContentAccess = {
  eligible: boolean;
  balance: number;
  threshold: number;
};
