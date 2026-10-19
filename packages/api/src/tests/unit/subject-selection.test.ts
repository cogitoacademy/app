import { describe, expect, test } from "bun:test";
import {
  haveSameSubjectIds,
  toSubjectCategoryGroup,
  toNormalizedTutorSubjects,
  validateTutorSubjectIds,
  validateTutorSubjectIdsInCatalog,
} from "../../modules/tutor-subjects/subject-selection";

const child = (id: string) => ({ id });

describe("tutor subject selection", () => {
  test("accepts active specialization ids and rejects category ids", () => {
    expect(() =>
      validateTutorSubjectIds(["child-1"], [child("child-1")]),
    ).not.toThrow();
    expect(() => validateTutorSubjectIds(["mother-1"], [])).toThrow(
      "active and selectable",
    );
  });

  test("rejects archived legacy specialization ids from new selections", () => {
    expect(() =>
      validateTutorSubjectIds(["legacy-child"], [child("current-child")]),
    ).toThrow("active and selectable");
  });

  test("allows an unchanged archived assignment while rejecting new ids", () => {
    expect(() =>
      validateTutorSubjectIds(["archived-child"], [], ["archived-child"]),
    ).not.toThrow();
    expect(() =>
      validateTutorSubjectIds(
        ["archived-child", "new-child"],
        [],
        ["archived-child"],
      ),
    ).toThrow("active and selectable");
  });

  test("rejects a new active child under an archived parent", async () => {
    const tx = {
      query: {
        subjectCategory: {
          findFirst: async () => ({
            parent: { parentId: null, isActive: false },
          }),
        },
      },
    };

    await expect(
      validateTutorSubjectIdsInCatalog(
        tx as any,
        ["child-1"],
        [{ id: "child-1", parentId: "parent-1" }],
      ),
    ).rejects.toThrow("active and selectable");
  });

  test("rejects empty, duplicate, and oversized selections", () => {
    expect(() => validateTutorSubjectIds([], [child("child-1")])).toThrow();
    expect(() =>
      validateTutorSubjectIds(["child-1", "child-1"], [child("child-1")]),
    ).toThrow();

    const ids = Array.from({ length: 7 }, (_, index) => `child-${index}`);
    expect(() => validateTutorSubjectIds(ids, ids.map(child))).not.toThrow();

    const oversizedIds = [...ids, "child-7"];
    expect(() =>
      validateTutorSubjectIds(oversizedIds, oversizedIds.map(child)),
    ).toThrow();
  });

  test("projects only joined specializations with their parent", () => {
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
            lightTextColor: "oklch(0.2 0.02 250)",
            lightBackgroundColor: "oklch(0.96 0.03 250)",
            darkTextColor: "oklch(0.92 0.02 250)",
            darkBackgroundColor: "oklch(0.25 0.04 250)",
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
          parentColors: {
            lightTextColor: "oklch(0.2 0.02 250)",
            lightBackgroundColor: "oklch(0.96 0.03 250)",
            darkTextColor: "oklch(0.92 0.02 250)",
            darkBackgroundColor: "oklch(0.25 0.04 250)",
          },
        },
      },
    ]);
  });

  test("projects a specialization category and its specializations", () => {
    const category = {
      id: "cat-1",
      slug: "languages",
      name: "Languages",
      description: "Language subjects",
      lightTextColor: "oklch(0.2 0.02 250)",
      lightBackgroundColor: "oklch(0.96 0.03 250)",
      darkTextColor: "oklch(0.92 0.02 250)",
      darkBackgroundColor: "oklch(0.25 0.04 250)",
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
      parentColors: {
        lightTextColor: "oklch(0.2 0.02 250)",
        lightBackgroundColor: "oklch(0.96 0.03 250)",
        darkTextColor: "oklch(0.92 0.02 250)",
        darkBackgroundColor: "oklch(0.25 0.04 250)",
      },
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

  test("marks archived specializations as non-selectable for profile reads", () => {
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

  test("marks an active specialization non-selectable when its parent is archived", () => {
    const [subject] = toNormalizedTutorSubjects([
      {
        subjectId: "child-1",
        subject: {
          id: "child-1",
          parentId: "parent-1",
          slug: "child-1",
          name: "Child",
          description: null,
          isActive: true,
          parent: {
            id: "parent-1",
            parentId: null,
            slug: "parent-1",
            name: "Parent",
            description: null,
            isActive: false,
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
