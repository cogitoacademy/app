import { DomainError } from "../../lib/domain-errors";
import type { TxClient } from "../../lib/tx";
import type { subjectCategory } from "@cogito-app/db/schema";
import { isSelectableCompetitionRef } from "../competition-catalog/catalog-lock";

export const MIN_TUTOR_SUBJECTS = 1;
export const MAX_TUTOR_SUBJECTS = 7;

type SubjectCategoryRow = typeof subjectCategory.$inferSelect;
type SubjectCategoryWithParent = SubjectCategoryRow & {
  parent?: SubjectCategoryRow | null;
};

export type TutorSubjectRelation = {
  subject?: SubjectCategoryWithParent | null;
};

export interface NormalizedTutorSubject {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSelectable: boolean;
  parent: {
    id: string;
    slug: string;
    name: string;
    parentColors: CompetitionPalette | null;
  };
}

export type CompetitionPalette = {
  lightTextColor: string;
  lightBackgroundColor: string;
  darkTextColor: string;
  darkBackgroundColor: string;
};

export interface SubjectCategoryGroup {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parentColors: CompetitionPalette | null;
  children: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
  }>;
}

function getParentPalette(row: SubjectCategoryRow): CompetitionPalette | null {
  const {
    lightTextColor,
    lightBackgroundColor,
    darkTextColor,
    darkBackgroundColor,
  } = row;
  if (
    typeof lightTextColor !== "string" ||
    typeof lightBackgroundColor !== "string" ||
    typeof darkTextColor !== "string" ||
    typeof darkBackgroundColor !== "string"
  ) {
    return null;
  }
  return {
    lightTextColor,
    lightBackgroundColor,
    darkTextColor,
    darkBackgroundColor,
  };
}

export class InvalidTutorSubjectSelectionError extends DomainError {
  readonly domain = "tutor-subjects";

  constructor(details: {
    reason: "required" | "too_many" | "duplicate" | "not_child" | "inactive";
    subjectIds?: string[];
  }) {
    super(
      "INVALID_TUTOR_SUBJECT_SELECTION",
      "Tutor specializations must be active and selectable",
      details,
    );
  }
}

export function toNormalizedTutorSubject(
  relation: TutorSubjectRelation,
): NormalizedTutorSubject | null {
  const subject = relation.subject;
  if (!subject || !subject.parentId || !subject.parent) return null;

  return {
    id: subject.id,
    slug: subject.slug,
    name: subject.name,
    description: subject.description,
    isSelectable:
      subject.isActive &&
      subject.parent.isActive &&
      subject.parent.parentId === null,
    parent: {
      id: subject.parent.id,
      slug: subject.parent.slug,
      name: subject.parent.name,
      parentColors: getParentPalette(subject.parent),
    },
  };
}

export function toNormalizedTutorSubjects(
  relations: readonly TutorSubjectRelation[] | null | undefined,
): NormalizedTutorSubject[] {
  return (relations ?? [])
    .map(toNormalizedTutorSubject)
    .filter((subject): subject is NormalizedTutorSubject => subject !== null);
}

export function toSubjectCategoryGroup(
  category: SubjectCategoryRow & {
    children?: SubjectCategoryRow[];
  },
): SubjectCategoryGroup {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
    parentColors: getParentPalette(category),
    children: (category.children ?? []).map((child) => ({
      id: child.id,
      slug: child.slug,
      name: child.name,
      description: child.description,
    })),
  };
}

export function validateTutorSubjectIds(
  subjectIds: readonly string[] | undefined,
  activeChildSubjects: readonly Pick<SubjectCategoryRow, "id">[],
  preservedSubjectIds: readonly string[] = [],
): void {
  if (subjectIds === undefined) return;
  if (subjectIds.length < MIN_TUTOR_SUBJECTS) {
    throw new InvalidTutorSubjectSelectionError({ reason: "required" });
  }
  if (subjectIds.length > MAX_TUTOR_SUBJECTS) {
    throw new InvalidTutorSubjectSelectionError({ reason: "too_many" });
  }

  const uniqueIds = new Set(subjectIds);
  if (uniqueIds.size !== subjectIds.length) {
    throw new InvalidTutorSubjectSelectionError({
      reason: "duplicate",
      subjectIds: [...subjectIds],
    });
  }

  const activeIds = new Set(activeChildSubjects.map((subject) => subject.id));
  const allowedIds = new Set([...activeIds, ...preservedSubjectIds]);
  const invalidSubjectIds = subjectIds.filter((id) => !allowedIds.has(id));
  if (invalidSubjectIds.length > 0) {
    throw new InvalidTutorSubjectSelectionError({
      reason: activeChildSubjects.length === 0 ? "inactive" : "not_child",
      subjectIds: invalidSubjectIds,
    });
  }
}

/**
 * Validates new selections against both levels of the catalog. Existing
 * assignments may remain selected after archive, but cannot be newly added.
 */
export async function validateTutorSubjectIdsInCatalog(
  tx: TxClient,
  subjectIds: readonly string[] | undefined,
  activeChildSubjects: readonly Pick<SubjectCategoryRow, "id" | "parentId">[],
  preservedSubjectIds: readonly string[] = [],
): Promise<void> {
  const selectableSubjects = await Promise.all(
    activeChildSubjects.map(async (subject) =>
      subject.parentId &&
      (await isSelectableCompetitionRef(tx, subject.parentId, subject.id))
        ? subject
        : null,
    ),
  );

  validateTutorSubjectIds(
    subjectIds,
    selectableSubjects.filter((subject) => subject !== null),
    preservedSubjectIds,
  );
}

export function haveSameSubjectIds(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  return right.every((subjectId) => leftSet.has(subjectId));
}
