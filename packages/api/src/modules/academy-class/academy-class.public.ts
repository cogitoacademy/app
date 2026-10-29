type PublicCompetitionColors = {
  lightTextColor?: string | null;
  lightBackgroundColor?: string | null;
  darkTextColor?: string | null;
  darkBackgroundColor?: string | null;
};

function publicCompetitionColors(value: PublicCompetitionColors) {
  return {
    lightTextColor: value.lightTextColor ?? null,
    lightBackgroundColor: value.lightBackgroundColor ?? null,
    darkTextColor: value.darkTextColor ?? null,
    darkBackgroundColor: value.darkBackgroundColor ?? null,
  };
}

export type PublicAcademyClassSource = {
  id: string;
  kind: string;
  state: string;
  titleEn: string;
  descriptionEn: string;
  coverKey: string | null;
  cohortFullRateMarks: number | null;
  cohortHalfRateMarks: number | null;
  cohortSingleRateMarks: number | null;
  masterclassRateMarks: number | null;
  competition: PublicCompetitionColors & {
    name: string;
    parent: (PublicCompetitionColors & { name: string }) | null;
  };
  sessions: {
    id: string;
    sequenceNumber: number;
    startAt: Date;
    titleEn: string;
    curriculumEn: string | null;
    mode: string;
    tutor: { name: string } | null;
  }[];
};

export function toPublicAcademyClass(record: PublicAcademyClassSource) {
  return {
    id: record.id,
    kind: record.kind,
    state: record.state,
    titleEn: record.titleEn,
    descriptionEn: record.descriptionEn,
    coverKey: record.coverKey,
    cohortFullRateMarks: record.cohortFullRateMarks,
    cohortHalfRateMarks: record.cohortHalfRateMarks,
    cohortSingleRateMarks: record.cohortSingleRateMarks,
    masterclassRateMarks: record.masterclassRateMarks,
    competition: {
      name: record.competition.name,
      ...publicCompetitionColors(record.competition),
      parent: record.competition.parent
        ? {
            name: record.competition.parent.name,
            ...publicCompetitionColors(record.competition.parent),
          }
        : null,
    },
    sessions: record.sessions.map((session) => ({
      id: session.id,
      sequenceNumber: session.sequenceNumber,
      startAt: session.startAt,
      titleEn: session.titleEn,
      curriculumEn: session.curriculumEn,
      mode: session.mode,
      tutor: session.tutor ? { name: session.tutor.name } : null,
    })),
  };
}
