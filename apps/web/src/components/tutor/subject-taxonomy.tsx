"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
import { Chip, ChipButton } from "@cogito-app/ui/components/selia/chip";
import { Text } from "@cogito-app/ui/components/selia/text";
import { orpc } from "@/utils/orpc";
import { IconX } from "@tabler/icons-react";

export const MAX_TUTOR_SUBJECTS = 7;

export type SubjectOption = {
  id: string;
  slug: string;
  name: string;
};

export type SubjectCategory = SubjectOption & {
  children: SubjectOption[];
};

export type TutorSubject = SubjectOption & {
  isSelectable: boolean;
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

  const legacySelectedSubjects = useMemo(
    () =>
      (selectedSubjects ?? []).filter(
        (subject) => subject.isSelectable === false,
      ),
    [selectedSubjects],
  );

  function toggleSubject(subjectId: string, checked: boolean) {
    if (!checked) {
      onChange(selectedIds.filter((id) => id !== subjectId));
      return;
    }

    if (
      selectedIds.includes(subjectId) ||
      selectedIds.length >= MAX_TUTOR_SUBJECTS
    ) {
      return;
    }

    onChange([...selectedIds, subjectId]);
  }

  return (
    <div
      id={triggerId}
      tabIndex={-1}
      className={`flex flex-col gap-4 rounded-lg outline-none ${
        error ? "ring-2 ring-danger-border/24" : ""
      }`}
      aria-label="Competition subjects"
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${triggerId}-error` : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text className="text-sm text-muted">
          Select up to {MAX_TUTOR_SUBJECTS} competition subcategories.
        </Text>
        <Text className="text-xs text-dimmed">
          {selectedIds.length} of {MAX_TUTOR_SUBJECTS} selected
        </Text>
      </div>

      {selectedIds.length > 0 ? (
        <div
          className="flex flex-wrap gap-2"
          aria-label="Selected competition subcategories"
        >
          {selectedIds.map((subjectId) => (
            <Chip key={subjectId} variant="primary" pill size="sm">
              {selectedSubjectLabels.get(subjectId) ?? "Selected subject"}
              <ChipButton
                type="button"
                aria-label={`Remove ${selectedSubjectLabels.get(subjectId) ?? "selected subject"}`}
                onClick={() => toggleSubject(subjectId, false)}
              >
                <IconX />
              </ChipButton>
            </Chip>
          ))}
        </div>
      ) : null}

      {legacySelectedSubjects.length > 0 ? (
        <div className="rounded-lg border border-item-border bg-item p-3">
          <Text className="text-sm font-medium">Previously selected</Text>
          <Text className="mt-1 text-xs text-muted">
            These legacy subjects remain on your profile but are no longer
            available for new selection.
          </Text>
          <div
            className="mt-3 flex flex-wrap gap-2"
            aria-label="Previously selected legacy subjects"
          >
            {legacySelectedSubjects.map((subject) => (
              <Chip key={subject.id} variant="outline" pill>
                {subject.parent
                  ? `${subject.parent.name} · ${subject.name}`
                  : subject.name}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {isPending ? (
        <Text className="text-muted" role="status">
          Loading competition categories…
        </Text>
      ) : null}
      {isError ? (
        <Text className="text-muted" role="status">
          Competition categories are temporarily unavailable. Your current
          selections are preserved.
        </Text>
      ) : null}

      {categories.length > 0 ? (
        <div
          className="grid items-start gap-3 md:grid-cols-2"
          aria-label="Competition categories"
        >
          {categories.map((category) => (
            <fieldset
              key={category.id}
              className="min-w-0 rounded-lg border border-item-border bg-item p-3"
            >
              <legend className="px-1 font-semibold">{category.name}</legend>
              <div className="grid min-[500px]:grid-cols-2 gap-2">
                {category.children.map((child) => {
                  const checked = selectedIds.includes(child.id);
                  const limitReached =
                    !checked && selectedIds.length >= MAX_TUTOR_SUBJECTS;
                  const inputId = `${triggerId ?? "tutor-subject"}-${child.id}`;

                  return (
                    <label
                      key={child.id}
                      htmlFor={inputId}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                        limitReached
                          ? "cursor-not-allowed text-dimmed opacity-60"
                          : "cursor-pointer hover:bg-background"
                      }`}
                    >
                      <Checkbox
                        id={inputId}
                        checked={checked}
                        disabled={limitReached}
                        aria-label={child.name}
                        onCheckedChange={(nextChecked) =>
                          toggleSubject(child.id, Boolean(nextChecked))
                        }
                      />
                      <span className="min-w-0">{child.name}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      ) : null}

      {error ? (
        <Text id={`${triggerId}-error`} className="text-danger" role="alert">
          {error}
        </Text>
      ) : null}
    </div>
  );
}
