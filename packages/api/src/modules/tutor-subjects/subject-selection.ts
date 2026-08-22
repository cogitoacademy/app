import { DomainError } from "../../lib/domain-errors";
import type { subjectCategory } from "@cogito-app/db/schema";

export const MIN_TUTOR_SUBJECTS = 1;
export const MAX_TUTOR_SUBJECTS = 20;

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
  parent: {
    id: string;
    slug: string;
    name: string;
  };
}

export interface SubjectCategoryGroup {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  children: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
  }>;
}

export class InvalidTutorSubjectSelectionError extends DomainError {
  readonly domain = "tutor-subjects";

  constructor(details: {
    reason: "required" | "too_many" | "duplicate" | "not_child" | "inactive";
    subjectIds?: string[];
  }) {
    super(
      "INVALID_TUTOR_SUBJECT_SELECTION",
      "Tutor subjects must be active child subjects",
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
    parent: {
      id: subject.parent.id,
      slug: subject.parent.slug,
      name: subject.parent.name,
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
  const invalidSubjectIds = subjectIds.filter((id) => !activeIds.has(id));
  if (invalidSubjectIds.length > 0) {
    throw new InvalidTutorSubjectSelectionError({
      reason: activeChildSubjects.length === 0 ? "inactive" : "not_child",
      subjectIds: invalidSubjectIds,
    });
  }
}

export function haveSameSubjectIds(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  return right.every((subjectId) => leftSet.has(subjectId));
}
