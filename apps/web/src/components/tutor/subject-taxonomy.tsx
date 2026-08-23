"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Chip, ChipButton } from "@cogito-app/ui/components/selia/chip";
import {
  getSelectItemValue,
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Text } from "@cogito-app/ui/components/selia/text";
import { orpc } from "@/utils/orpc";

export type SubjectOption = {
  id: string;
  slug: string;
  name: string;
};

export type SubjectCategory = SubjectOption & {
  children: SubjectOption[];
};

export type TutorSubject = SubjectOption & {
  parent: SubjectOption;
};

export type SubjectGroup = {
  parent: SubjectOption | null;
  children: SubjectOption[];
};

export function useSubjectTaxonomy() {
  const query = useQuery(orpc.tutors.listSubjects.queryOptions({ input: {} }));

  return {
    ...query,
    data: (query.data ?? []) as unknown as SubjectCategory[],
  };
}

export function groupTutorSubjects(
  subjects: TutorSubject[] | null | undefined,
  expertise: string[] | null | undefined,
): SubjectGroup[] {
  if (subjects && subjects.length > 0) {
    const groups = new Map<string, SubjectGroup>();

    for (const subject of subjects) {
      const parentKey = subject.parent.id || subject.parent.slug;
      const group = groups.get(parentKey) ?? {
        parent: subject.parent,
        children: [],
      };

      if (!group.children.some((child) => child.id === subject.id)) {
        group.children.push(subject);
      }
      groups.set(parentKey, group);
    }

    return [...groups.values()];
  }

  return (expertise ?? []).map((name, index) => ({
    parent: null,
    children: [
      {
        id: `legacy-${index}-${name}`,
        slug: name,
        name,
      },
    ],
  }));
}

type SubjectSelectorProps = {
  selectedIds: string[];
  selectedSubjects?: TutorSubject[] | null;
  onChange: (subjectIds: string[]) => void;
  error?: string;
  triggerId?: string;
};

export function SubjectSelector({
  selectedIds,
  selectedSubjects,
  onChange,
  error,
  triggerId,
}: SubjectSelectorProps) {
  const { data: categories, isPending, isError } = useSubjectTaxonomy();
  const [categoryId, setCategoryId] = useState("");

  const selectedSubjectLabels = useMemo(() => {
    const labels = new Map<string, string>();

    for (const subject of selectedSubjects ?? []) {
      labels.set(
        subject.id,
        subject.parent
          ? `${subject.parent.name} · ${subject.name}`
          : subject.name,
      );
    }
    for (const category of categories) {
      for (const child of category.children) {
        labels.set(child.id, `${category.name} · ${child.name}`);
      }
    }

    return labels;
  }, [categories, selectedSubjects]);

  const activeCategoryId = useMemo(() => {
    if (categoryId) return categoryId;

    return (
      categories.find((category) =>
        category.children.some((child) => selectedIds.includes(child.id)),
      )?.id ?? ""
    );
  }, [categories, categoryId, selectedIds]);
  const activeCategory = categories.find(
    (category) => category.id === activeCategoryId,
  );
  const categoryValues = useMemo(
    () =>
      new Map(
        categories.map((category) => [
          category.id,
          { value: category.id, label: category.name },
        ]),
      ),
    [categories],
  );
  const selectedCategoryValue = activeCategory
    ? (categoryValues.get(activeCategory.id) ?? null)
    : null;

  function toggleSubject(subjectId: string) {
    if (selectedIds.includes(subjectId)) {
      onChange(selectedIds.filter((id) => id !== subjectId));
      return;
    }

    onChange([...selectedIds, subjectId]);
  }

  return (
    <div className="flex flex-col gap-3">
      {selectedIds.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
          aria-label="Selected child subjects"
        >
          {selectedIds.map((subjectId) => (
            <Chip key={subjectId} variant="primary" pill>
              {selectedSubjectLabels.get(subjectId) ?? "Selected subject"}
              <ChipButton
                type="button"
                aria-label={`Remove ${selectedSubjectLabels.get(subjectId) ?? "selected subject"}`}
                onClick={() => toggleSubject(subjectId)}
              >
                ×
              </ChipButton>
            </Chip>
          ))}
        </div>
      )}

      <Select
        value={selectedCategoryValue}
        onValueChange={(value) =>
          setCategoryId(getSelectItemValue(value) ?? "")
        }
      >
        <SelectTrigger id={triggerId} aria-label="Subject category">
          <SelectValue placeholder="Choose a mother category" />
        </SelectTrigger>
        <SelectPopup>
          <SelectList>
            {categories.map((category) => (
              <SelectItem
                key={category.id}
                value={categoryValues.get(category.id)}
              >
                {category.name}
              </SelectItem>
            ))}
          </SelectList>
        </SelectPopup>
      </Select>

      {isPending && (
        <Text className="text-muted" role="status">
          Loading subject categories…
        </Text>
      )}
      {isError && (
        <Text className="text-muted" role="status">
          Subject categories are temporarily unavailable. Your selected subjects
          are preserved.
        </Text>
      )}

      {activeCategory && (
        <div
          className="flex flex-wrap gap-2"
          aria-label={`Child subjects in ${activeCategory.name}`}
        >
          {activeCategory.children.map((child) => {
            const selected = selectedIds.includes(child.id);

            return (
              <Chip
                key={child.id}
                variant={selected ? "primary" : "outline"}
                pill
                className="cursor-pointer focus-within:ring-2 focus-within:ring-primary"
                render={
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${selected ? "Remove" : "Add"} ${child.name}`}
                  />
                }
                onClick={() => toggleSubject(child.id)}
              >
                {child.name}
              </Chip>
            );
          })}
          {activeCategory.children.length === 0 && (
            <Text className="text-muted">
              No child subjects are available in this category yet.
            </Text>
          )}
        </div>
      )}

      {error && <Text className="text-danger">{error}</Text>}
    </div>
  );
}
