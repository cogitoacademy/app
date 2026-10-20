export type PublicAcademyClassSource = {
  id: string;
  kind: string;
  state: string;
  titleEn: string;
  descriptionEn: string;
  coverKey: string | null;
  cohortFullRateMarks: number | null;
  cohortSingleRateMarks: number | null;
  masterclassRateMarks: number | null;
  competition: {
    name: string;
    parent: { name: string } | null;
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
    cohortSingleRateMarks: record.cohortSingleRateMarks,
    masterclassRateMarks: record.masterclassRateMarks,
    competition: {
      name: record.competition.name,
      parent: record.competition.parent
        ? { name: record.competition.parent.name }
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
