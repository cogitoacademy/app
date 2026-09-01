"use client";

import {
  IconPlus,
  IconSchool,
  IconTrophy,
  IconTrash,
} from "@tabler/icons-react";
import { useRef } from "react";

import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { NumberField } from "@cogito-app/ui/components/selia/number-field";
import { Text } from "@cogito-app/ui/components/selia/text";

import { TutorTextDraftInput } from "./tutor-text-draft-input";

export type TutorEducationEntry = {
  university: string;
  degree: string;
};

export type TutorCompetitionAchievement = {
  competitionName: string;
  year: number;
  awards: string[];
};

export type TutorAchievementDraftErrors = Record<string, string>;

const MAX_EDUCATION_ENTRIES = 2;
const MAX_COMPETITION_ACHIEVEMENTS = 5;
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_FORMAT: Intl.NumberFormatOptions = { useGrouping: false };

let nextDraftKey = 0;

function createDraftKey(prefix: string) {
  nextDraftKey += 1;
  return `${prefix}-${nextDraftKey}`;
}

function getDisplayRows<T>(
  entries: readonly T[],
  getBaseKey: (entry: T) => string,
) {
  const occurrences = new Map<string, number>();
  return entries.map((entry) => {
    const baseKey = getBaseKey(entry);
    const occurrence = occurrences.get(baseKey) ?? 0;
    occurrences.set(baseKey, occurrence + 1);
    return { entry, key: `${baseKey}-${occurrence}` };
  });
}

export function createEmptyEducationEntry(): TutorEducationEntry {
  return { university: "", degree: "" };
}

export function createEmptyCompetitionAchievement(): TutorCompetitionAchievement {
  return {
    competitionName: "",
    year: CURRENT_YEAR,
    awards: [],
  };
}

export function validateTutorAchievementDraft(
  education: readonly TutorEducationEntry[],
  competitionAchievements: readonly TutorCompetitionAchievement[],
): TutorAchievementDraftErrors {
  const errors: TutorAchievementDraftErrors = {};

  for (const [index, entry] of education.entries()) {
    if (!entry.university.trim()) {
      errors[`education.${index}.university`] = "University is required.";
    } else if (entry.university.length > 255) {
      errors[`education.${index}.university`] = "Use 255 characters or fewer.";
    }
    if (!entry.degree.trim()) {
      errors[`education.${index}.degree`] = "Degree is required.";
    } else if (entry.degree.length > 255) {
      errors[`education.${index}.degree`] = "Use 255 characters or fewer.";
    }
  }

  for (const [index, entry] of competitionAchievements.entries()) {
    const fieldPrefix = `competitionAchievements.${index}`;
    if (!entry.competitionName.trim()) {
      errors[`${fieldPrefix}.competitionName`] =
        "Competition name is required.";
    } else if (entry.competitionName.length > 255) {
      errors[`${fieldPrefix}.competitionName`] = "Use 255 characters or fewer.";
    }
    if (
      !Number.isInteger(entry.year) ||
      entry.year < 1900 ||
      entry.year > 2100
    ) {
      errors[`${fieldPrefix}.year`] = "Enter a year between 1900 and 2100.";
    }
    if (
      entry.awards.length === 0 ||
      entry.awards.some((award) => !award.trim())
    ) {
      errors[`${fieldPrefix}.awards`] = "Add at least one award.";
    } else if (
      entry.awards.some((award) => award.length > 255) ||
      entry.awards.length > 10
    ) {
      errors[`${fieldPrefix}.awards`] =
        "Use up to 10 award titles, with 255 characters per title.";
    }
  }

  if (Object.keys(errors).some((key) => key.startsWith("education."))) {
    errors.education = "Complete the highlighted education fields.";
  }
  if (
    Object.keys(errors).some((key) =>
      key.startsWith("competitionAchievements."),
    )
  ) {
    errors.competitionAchievements =
      "Complete the highlighted achievement fields.";
  }

  return errors;
}

function formatAwardTitles(awards: readonly string[]) {
  return awards.join(", ");
}

function parseAwardTitles(value: string) {
  return value
    .split(",")
    .map((award) => award.trim())
    .filter(Boolean);
}

type TutorAchievementsDisplayProps = {
  education?: readonly TutorEducationEntry[] | null;
  competitionAchievements?: readonly TutorCompetitionAchievement[] | null;
  emptyMessage?: string;
  className?: string;
  idPrefix?: string;
};

export function TutorAchievementsDisplay({
  education,
  competitionAchievements,
  emptyMessage = "No education or competition achievements added yet.",
  className,
  idPrefix = "tutor-achievements",
}: TutorAchievementsDisplayProps) {
  const educationEntries = education ?? [];
  const competitionEntries = competitionAchievements ?? [];
  const hasEntries =
    educationEntries.length > 0 || competitionEntries.length > 0;
  const educationRows = getDisplayRows(
    educationEntries,
    (entry) => `${entry.university}-${entry.degree}`,
  );
  const competitionRows = getDisplayRows(
    competitionEntries,
    (entry) =>
      `${entry.competitionName}-${entry.year}-${entry.awards.join(",")}`,
  );

  if (!hasEntries) {
    return (
      <Text className={className ?? "text-sm italic text-dimmed"}>
        {emptyMessage}
      </Text>
    );
  }

  return (
    <div className={className ?? "flex flex-col gap-6"}>
      {educationEntries.length > 0 ? (
        <section aria-labelledby={`${idPrefix}-education-heading`}>
          <Heading id={`${idPrefix}-education-heading`} size="sm">
            Education
          </Heading>
          <ul className="mt-3 flex list-none flex-col gap-4 p-0">
            {educationRows.map(({ entry, key }) => (
              <li key={key} className="flex items-start gap-2.5">
                <span aria-hidden="true" className="mt-0.5 text-muted">
                  •
                </span>
                <div className="min-w-0">
                  <Text className="font-semibold leading-snug">
                    {entry.university}
                  </Text>
                  <Text className="mt-0.5 text-muted">{entry.degree}</Text>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {competitionEntries.length > 0 ? (
        <section
          aria-labelledby={`${idPrefix}-competition-achievements-heading`}
        >
          <Heading
            id={`${idPrefix}-competition-achievements-heading`}
            size="sm"
          >
            Competition achievements
          </Heading>
          <ul className="mt-3 flex list-none flex-col gap-4 p-0">
            {competitionRows.map(({ entry, key }) => (
              <li key={key} className="flex items-start gap-2.5">
                <span aria-hidden="true" className="mt-0.5 text-muted">
                  •
                </span>
                <div className="min-w-0">
                  <Text className="font-semibold leading-snug">
                    {entry.competitionName} {entry.year}
                  </Text>
                  <Text className="mt-0.5 text-muted">
                    {entry.awards.join(", ")}
                  </Text>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

type TutorAchievementsEditorProps = {
  education: TutorEducationEntry[];
  competitionAchievements: TutorCompetitionAchievement[];
  onEducationChange: (
    education: TutorEducationEntry[],
    changedField?: string,
  ) => void;
  onCompetitionAchievementsChange: (
    competitionAchievements: TutorCompetitionAchievement[],
    changedField?: string,
  ) => void;
  errors?: TutorAchievementDraftErrors;
  idPrefix?: string;
  showPreview?: boolean;
};

export function TutorAchievementsEditor({
  education,
  competitionAchievements,
  onEducationChange,
  onCompetitionAchievementsChange,
  errors,
  idPrefix = "tutor-achievements",
  showPreview = true,
}: TutorAchievementsEditorProps) {
  const educationKeys = useRef<string[]>([]);
  const competitionKeys = useRef<string[]>([]);

  function getEditorKey(
    keys: { current: string[] },
    index: number,
    prefix: string,
  ) {
    const existingKey = keys.current[index];
    if (existingKey) return existingKey;
    const key = createDraftKey(prefix);
    keys.current[index] = key;
    return key;
  }

  function updateEducation(
    index: number,
    field: keyof TutorEducationEntry,
    value: string,
  ) {
    onEducationChange(
      education.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
      `education.${index}.${field}`,
    );
  }

  function updateCompetition(
    index: number,
    update: Partial<TutorCompetitionAchievement>,
  ) {
    onCompetitionAchievementsChange(
      competitionAchievements.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...update } : entry,
      ),
      Object.keys(update)[0]
        ? `competitionAchievements.${index}.${Object.keys(update)[0]}`
        : `competitionAchievements.${index}`,
    );
  }

  function removeEducation(index: number) {
    educationKeys.current.splice(index, 1);
    onEducationChange(
      education.filter((_, entryIndex) => entryIndex !== index),
    );
  }

  function removeCompetition(index: number) {
    competitionKeys.current.splice(index, 1);
    onCompetitionAchievementsChange(
      competitionAchievements.filter((_, entryIndex) => entryIndex !== index),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-item-border bg-item p-4">
          <div className="flex items-start gap-3">
            <IconSchool
              className="mt-0.5 size-5 shrink-0 text-muted"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Heading size="sm">Education</Heading>
                <Text className="text-sm text-muted">
                  {education.length}/{MAX_EDUCATION_ENTRIES}
                </Text>
              </div>
              <Text className="mt-1 text-sm text-muted">
                Add your most recent university first. Up to two entries.
              </Text>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {education.map((entry, index) => (
              <div
                key={getEditorKey(
                  educationKeys,
                  index,
                  `${idPrefix}-education`,
                )}
                className="relative rounded-lg border border-item-border bg-card p-3"
              >
                <Button
                  type="button"
                  variant="plain"
                  size="xs-icon"
                  className="absolute right-2 top-2"
                  aria-label={`Remove education entry ${index + 1}`}
                  onClick={() => removeEducation(index)}
                >
                  <IconTrash aria-hidden="true" />
                </Button>
                <div className="flex flex-col gap-3 pr-8">
                  <Field>
                    <FieldLabel htmlFor={`${idPrefix}-university-${index}`}>
                      University
                    </FieldLabel>
                    {(() => {
                      const error = errors?.[`education.${index}.university`];
                      const errorId = `${idPrefix}-university-${index}-error`;
                      return (
                        <>
                          <TutorTextDraftInput
                            id={`${idPrefix}-university-${index}`}
                            value={entry.university}
                            onCommit={(value) =>
                              updateEducation(index, "university", value)
                            }
                            placeholder="e.g. Universitas Gadjah Mada"
                            maxLength={255}
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? errorId : undefined}
                          />
                          {error ? (
                            <FieldError id={errorId}>{error}</FieldError>
                          ) : null}
                        </>
                      );
                    })()}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${idPrefix}-degree-${index}`}>
                      Degree in brief
                    </FieldLabel>
                    {(() => {
                      const error = errors?.[`education.${index}.degree`];
                      const errorId = `${idPrefix}-degree-${index}-error`;
                      return (
                        <>
                          <TutorTextDraftInput
                            id={`${idPrefix}-degree-${index}`}
                            value={entry.degree}
                            onCommit={(value) =>
                              updateEducation(index, "degree", value)
                            }
                            placeholder="e.g. Bachelor of Law"
                            maxLength={255}
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? errorId : undefined}
                          />
                          {error ? (
                            <FieldError id={errorId}>{error}</FieldError>
                          ) : null}
                        </>
                      );
                    })()}
                  </Field>
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={education.length >= MAX_EDUCATION_ENTRIES}
            onClick={() =>
              onEducationChange([...education, createEmptyEducationEntry()])
            }
          >
            <IconPlus aria-hidden="true" />
            Add education
          </Button>
          {errors?.education ? (
            <Field className="gap-0">
              <FieldError>{errors.education}</FieldError>
            </Field>
          ) : null}
        </section>

        <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-item-border bg-item p-4">
          <div className="flex items-start gap-3">
            <IconTrophy
              className="mt-0.5 size-5 shrink-0 text-muted"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Heading size="sm">Competition achievements</Heading>
                <Text className="text-sm text-muted">
                  {competitionAchievements.length}/
                  {MAX_COMPETITION_ACHIEVEMENTS}
                </Text>
              </div>
              <Text className="mt-1 text-sm text-muted">
                Add your strongest results first. Up to five entries.
              </Text>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {competitionAchievements.map((entry, index) => (
              <div
                key={getEditorKey(
                  competitionKeys,
                  index,
                  `${idPrefix}-competition`,
                )}
                className="relative rounded-lg border border-item-border bg-card p-3"
              >
                <Button
                  type="button"
                  variant="plain"
                  size="xs-icon"
                  className="absolute right-2 top-2"
                  aria-label={`Remove competition achievement ${index + 1}`}
                  onClick={() => removeCompetition(index)}
                >
                  <IconTrash aria-hidden="true" />
                </Button>
                <div className="grid gap-3 pr-8 sm:grid-cols-[minmax(0,1fr)_7rem]">
                  <Field>
                    <FieldLabel htmlFor={`${idPrefix}-competition-${index}`}>
                      Competition name
                    </FieldLabel>
                    {(() => {
                      const error =
                        errors?.[
                          `competitionAchievements.${index}.competitionName`
                        ];
                      const errorId = `${idPrefix}-competition-${index}-error`;
                      return (
                        <>
                          <TutorTextDraftInput
                            id={`${idPrefix}-competition-${index}`}
                            value={entry.competitionName}
                            onCommit={(value) =>
                              updateCompetition(index, {
                                competitionName: value,
                              })
                            }
                            placeholder="e.g. Harvard Model United Nations"
                            maxLength={255}
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? errorId : undefined}
                          />
                          {error ? (
                            <FieldError id={errorId}>{error}</FieldError>
                          ) : null}
                        </>
                      );
                    })()}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${idPrefix}-year-${index}`}>
                      Year
                    </FieldLabel>
                    {(() => {
                      const error =
                        errors?.[`competitionAchievements.${index}.year`];
                      const errorId = `${idPrefix}-year-${index}-error`;
                      return (
                        <>
                          <NumberField
                            id={`${idPrefix}-year-${index}`}
                            value={entry.year || null}
                            min={1900}
                            max={2100}
                            step={1}
                            format={YEAR_FORMAT}
                            allowOutOfRange
                            onValueChange={(value) =>
                              updateCompetition(index, { year: value ?? 0 })
                            }
                            inputProps={{
                              "aria-label": `Year for competition achievement ${index + 1}`,
                              "aria-invalid": Boolean(error),
                              "aria-describedby": error ? errorId : undefined,
                            }}
                          />
                          {error ? (
                            <FieldError id={errorId}>{error}</FieldError>
                          ) : null}
                        </>
                      );
                    })()}
                  </Field>
                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor={`${idPrefix}-awards-${index}`}>
                      Award title in full
                    </FieldLabel>
                    {(() => {
                      const error =
                        errors?.[`competitionAchievements.${index}.awards`];
                      const errorId = `${idPrefix}-awards-${index}-error`;
                      return (
                        <>
                          <TutorTextDraftInput
                            id={`${idPrefix}-awards-${index}`}
                            value={formatAwardTitles(entry.awards)}
                            onCommit={(value) =>
                              updateCompetition(index, {
                                awards: parseAwardTitles(value),
                              })
                            }
                            placeholder="e.g. Champion, Best Speaker, Best Memorial"
                            maxLength={2_600}
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? errorId : undefined}
                          />
                          {error ? (
                            <FieldError id={errorId}>{error}</FieldError>
                          ) : null}
                        </>
                      );
                    })()}
                    <FieldDescription>
                      Separate multiple awards with commas.
                    </FieldDescription>
                  </Field>
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            id={`${idPrefix}-competition-add`}
            disabled={
              competitionAchievements.length >= MAX_COMPETITION_ACHIEVEMENTS
            }
            onClick={() =>
              onCompetitionAchievementsChange([
                ...competitionAchievements,
                createEmptyCompetitionAchievement(),
              ])
            }
          >
            <IconPlus aria-hidden="true" />
            Add achievement
          </Button>
          {errors?.competitionAchievements ? (
            <Field className="gap-0">
              <FieldError>{errors.competitionAchievements}</FieldError>
            </Field>
          ) : null}
        </section>
      </div>

      {showPreview ? (
        <div className="rounded-lg border border-item-border bg-accent p-4">
          <Text className="text-sm font-medium">Public preview</Text>
          <Text className="mt-1 text-sm text-muted">
            The first line is emphasized and multiple awards render with commas.
          </Text>
          <div className="mt-4">
            <TutorAchievementsDisplay
              education={education}
              competitionAchievements={competitionAchievements}
              emptyMessage="Add an entry to see the public profile preview."
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
