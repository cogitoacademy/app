import { describe, expect, test } from "bun:test";
import {
  haveSameSubjectIds,
  toSubjectCategoryGroup,
  toNormalizedTutorSubjects,
  validateTutorSubjectIds,
} from "../../modules/tutor-subjects/subject-selection";

const child = (id: string) => ({ id });

describe("tutor subject selection", () => {
  test("accepts active child ids and rejects mother ids", () => {
    expect(() =>
      validateTutorSubjectIds(["child-1"], [child("child-1")]),
    ).not.toThrow();
    expect(() => validateTutorSubjectIds(["mother-1"], [])).toThrow(
      "active selectable child subjects",
    );
  });

  test("rejects archived legacy child ids from new selections", () => {
    expect(() =>
      validateTutorSubjectIds(["legacy-child"], [child("current-child")]),
    ).toThrow("active selectable child subjects");
  });

  test("rejects empty, duplicate, and oversized selections", () => {
    expect(() => validateTutorSubjectIds([], [child("child-1")])).toThrow();
    expect(() =>
      validateTutorSubjectIds(["child-1", "child-1"], [child("child-1")]),
    ).toThrow();

    const ids = Array.from({ length: 21 }, (_, index) => `child-${index}`);
    expect(() => validateTutorSubjectIds(ids, ids.map(child))).toThrow();
  });

  test("projects only joined child subjects with their parent", () => {
    const subjects = toNormalizedTutorSubjects([
      {
        subjectId: "child-1",
        subject: {
          id: "child-1",
          parentId: "mother-1",
          slug: "mun-debate",
          name: "MUN Debate",
          description: null,
          isActive: true,
          sortOrder: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
          parent: {
            id: "mother-1",
            parentId: null,
            slug: "mun",
            name: "Model United Nations",
            description: null,
            isActive: true,
            sortOrder: 10,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      },
      { subjectId: "missing", subject: null },
    ]);

    expect(subjects).toEqual([
      {
        id: "child-1",
        slug: "mun-debate",
        name: "MUN Debate",
        description: null,
        isSelectable: true,
        parent: {
          id: "mother-1",
          slug: "mun",
          name: "Model United Nations",
        },
      },
    ]);
  });

  test("projects a subject category and its children", () => {
    const category = {
      id: "cat-1",
      slug: "languages",
      name: "Languages",
      description: "Language subjects",
      children: [
        {
          id: "child-1",
          slug: "english",
          name: "English",
          description: null,
        },
      ],
    } as any;

    expect(toSubjectCategoryGroup(category)).toEqual({
      id: "cat-1",
      slug: "languages",
      name: "Languages",
      description: "Language subjects",
      children: [
        {
          id: "child-1",
          slug: "english",
          name: "English",
          description: null,
        },
      ],
    });
    expect(
      toSubjectCategoryGroup({ ...category, children: undefined }),
    ).toEqual(expect.objectContaining({ children: [] }));
  });

  test("marks archived child subjects as non-selectable for profile reads", () => {
    const [subject] = toNormalizedTutorSubjects([
      {
        subjectId: "legacy-child",
        subject: {
          id: "legacy-child",
          parentId: "legacy-mother",
          slug: "legacy-subject",
          name: "Legacy subject",
          description: null,
          isActive: false,
          sortOrder: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
          parent: {
            id: "legacy-mother",
            parentId: null,
            slug: "legacy",
            name: "Legacy",
            description: null,
            isActive: false,
            sortOrder: 10,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      },
    ]);

    expect(subject?.isSelectable).toBe(false);
  });

  test("compares selections without depending on input order", () => {
    expect(haveSameSubjectIds(["a", "b"], ["b", "a"])).toBe(true);
    expect(haveSameSubjectIds(["a"], ["a", "b"])).toBe(false);
  });
});
