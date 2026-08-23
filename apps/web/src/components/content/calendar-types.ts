export type CalendarCompetition = {
  id: string;
  title: string;
  description: string | null;
  start: Date;
  end: Date;
  allDay?: boolean;
  location: string | null;
  categories: Array<{
    id?: string;
    name: string;
    coreCategory: string;
  }>;
  educationLevels: string[];
  scale: string | null;
  organizer: string | null;
  registrationDeadline: Date | null;
  registrationLink: string | null;
  socialMediaLink: string | null;
};

export type CalendarView = "month" | "agenda";
