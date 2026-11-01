import type { PublicContentRepo, PublicTutorRow } from "./public-content.repo";
import type { PublicTutorDto } from "./public-content.types";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function mapEducation(value: unknown): PublicTutorDto["education"] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const record = asRecord(entry);
    if (
      !record ||
      typeof record.university !== "string" ||
      typeof record.degree !== "string"
    ) {
      return [];
    }
    return [{ university: record.university, degree: record.degree }];
  });
}

function mapAchievements(value: unknown): PublicTutorDto["achievements"] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const record = asRecord(entry);
    if (
      !record ||
      typeof record.competitionName !== "string" ||
      typeof record.year !== "number" ||
      !Number.isInteger(record.year)
    ) {
      return [];
    }

    return [
      {
        competitionName: record.competitionName,
        year: record.year,
        awards: Array.isArray(record.awards)
          ? record.awards.filter(
              (award): award is string => typeof award === "string",
            )
          : [],
      },
    ];
  });
}

function mapExperiences(value: unknown): PublicTutorDto["experiences"] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const record = asRecord(entry);
    if (
      !record ||
      typeof record.role !== "string" ||
      typeof record.organization !== "string" ||
      typeof record.startYear !== "number" ||
      !Number.isInteger(record.startYear) ||
      (record.endYear !== null &&
        (typeof record.endYear !== "number" ||
          !Number.isInteger(record.endYear))) ||
      typeof record.description !== "string"
    ) {
      return [];
    }

    return [
      {
        role: record.role,
        organization: record.organization,
        startYear: record.startYear,
        endYear: record.endYear,
        description: record.description,
      },
    ];
  });
}

function mapSubjects(row: PublicTutorRow): PublicTutorDto["subjects"] {
  return row.subjects
    .flatMap(({ subject }) => {
      if (
        !subject ||
        subject.isActive !== true ||
        !subject.parent ||
        subject.parent.isActive !== true ||
        subject.parent.parentId !== null
      ) {
        return [];
      }
      return [
        {
          id: subject.id,
          slug: subject.slug,
          name: subject.name,
          nameId: subject.nameId,
          parent: {
            id: subject.parent.id,
            slug: subject.parent.slug,
            name: subject.parent.name,
            nameId: subject.parent.nameId,
            lightTextColor: subject.parent.lightTextColor,
            lightBackgroundColor: subject.parent.lightBackgroundColor,
            darkTextColor: subject.parent.darkTextColor,
            darkBackgroundColor: subject.parent.darkBackgroundColor,
          },
        },
      ];
    })
    .toSorted(
      (left, right) =>
        left.parent.slug.localeCompare(right.parent.slug) ||
        left.slug.localeCompare(right.slug),
    );
}

export function toPublicTutorDto(row: PublicTutorRow): PublicTutorDto {
  if (!row.user) {
    throw new Error(`Published tutor profile ${row.id} has no account`);
  }

  return {
    id: row.id,
    name: row.user.name,
    profileImageUrl: row.user.image,
    shortBio: row.shortBio,
    affiliation: row.affiliation,
    education: mapEducation(row.education),
    achievements: mapAchievements(row.achievements),
    experiences: mapExperiences(row.experiences),
    subjects: mapSubjects(row),
    // Modality describes teaching format. It is not a city or location.
    modality:
      row.modality === "online" ||
      row.modality === "offline" ||
      row.modality === "both"
        ? row.modality
        : null,
  };
}

export function createPublicContentService(deps: { repo: PublicContentRepo }) {
  const { repo } = deps;

  async function listTutors() {
    const rows = await repo.listPublishedTutors();
    return rows.map(toPublicTutorDto);
  }

  return { listTutors };
}

export type PublicContentService = ReturnType<
  typeof createPublicContentService
>;
