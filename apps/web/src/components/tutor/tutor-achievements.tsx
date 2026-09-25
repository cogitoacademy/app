"use client";

import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useId, useState } from "react";

import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Field,
  FieldDescription,
  FieldError,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { NumberField } from "@cogito-app/ui/components/selia/number-field";
import { Text } from "@cogito-app/ui/components/selia/text";

import { TutorTextDraftInput } from "./tutor-text-draft-input";
import type { TutorExperience } from "./tutor-experiences";
import { TutorFormField, TutorFormRow } from "./tutor-form-layout";

export type TutorEducationEntry = {
  university: string;
  degree: string;
};

export type TutorAchievement = {
  competitionName: string;
  year: number;
  awards: string[];
};

export type TutorAchievementDraftErrors = Record<string, string>;

const MAX_EDUCATION_ENTRIES = 2;
const MAX_ACHIEVEMENTS = 5;
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_FORMAT: Intl.NumberFormatOptions = { useGrouping: false };

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

export function createEmptyAchievement(): TutorAchievement {
  return {
    competitionName: "",
    year: CURRENT_YEAR,
    awards: [],
  };
}

export function validateTutorAchievementDraft(
  education: readonly TutorEducationEntry[],
  achievements: readonly TutorAchievement[],
): TutorAchievementDraftErrors {
  const errors: TutorAchievementDraftErrors = {};

  for (const [index, entry] of education.entries()) {
    if (!entry.university.trim()) {
      errors[`education.${index}.university`] = "University is required.";
    } else if (entry.university.trim().length > 255) {
      errors[`education.${index}.university`] = "Use 255 characters or fewer.";
    }
    if (!entry.degree.trim()) {
      errors[`education.${index}.degree`] = "Degree is required.";
    } else if (entry.degree.trim().length > 255) {
      errors[`education.${index}.degree`] = "Use 255 characters or fewer.";
    }
  }

  for (const [index, entry] of achievements.entries()) {
    const fieldPrefix = `achievements.${index}`;
    if (!entry.competitionName.trim()) {
      errors[`${fieldPrefix}.competitionName`] =
        "Competition name is required.";
    } else if (entry.competitionName.trim().length > 255) {
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
  if (Object.keys(errors).some((key) => key.startsWith("achievements."))) {
    errors.achievements = "Complete the highlighted achievement fields.";
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
  achievements?: readonly TutorAchievement[] | null;
  experiences?: readonly TutorExperience[] | null;
  emptyMessage?: string;
  className?: string;
  idPrefix?: string;
};

export function TutorAchievementsDisplay({
  education,
  achievements,
  experiences,
  emptyMessage = "No education, achievements, or experiences added yet.",
  className,
  idPrefix = "tutor-achievements",
}: TutorAchievementsDisplayProps) {
  const educationEntries = education ?? [];
  const achievementEntries = achievements ?? [];
  const experienceItems = experiences ?? [];
  const hasEntries =
    educationEntries.length > 0 ||
    achievementEntries.length > 0 ||
    experienceItems.length > 0;
  const educationRows = getDisplayRows(
    educationEntries,
    (entry) => `${entry.university}-${entry.degree}`,
  );
  const achievementRows = getDisplayRows(
    achievementEntries,
    (entry) =>
      `${entry.competitionName}-${entry.year}-${entry.awards.join(",")}`,
  );
  const experienceRows = getDisplayRows(
    experienceItems,
    (entry) =>
      `${entry.role}-${entry.organization}-${entry.startYear}-${entry.endYear}-${entry.description}`,
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
          <ul className="mt-3 list-disc space-y-4 pl-5 marker:text-muted">
            {educationRows.map(({ entry, key }) => (
              <li key={key}>
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

      {achievementEntries.length > 0 ? (
        <section aria-labelledby={`${idPrefix}-achievements-heading`}>
          <Heading id={`${idPrefix}-achievements-heading`} size="sm">
            Achievements
          </Heading>
          <ul className="mt-3 list-disc space-y-4 pl-5 marker:text-muted">
            {achievementRows.map(({ entry, key }) => (
              <li key={key}>
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

      {experienceItems.length > 0 ? (
        <section aria-labelledby={`${idPrefix}-experiences-heading`}>
          <Heading id={`${idPrefix}-experiences-heading`} size="sm">
            Experiences
          </Heading>
          <ul className="mt-3 list-disc space-y-4 pl-5 marker:text-muted">
            {experienceRows.map(({ entry, key }) => (
              <li key={key}>
                <div className="min-w-0">
                  <Text className="font-semibold leading-snug">
                    {entry.role} · {entry.organization}
                  </Text>
                  <Text className="mt-0.5 text-sm text-muted">
                    {entry.startYear}–{entry.endYear ?? "Present"}
                  </Text>
                  <Text className="mt-1 whitespace-pre-line text-muted">
                    {entry.description}
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
  achievements: TutorAchievement[];
  onEducationChange: (
    education: TutorEducationEntry[],
    changedField?: string,
  ) => void;
  onAchievementsChange: (
    achievements: TutorAchievement[],
    changedField?: string,
  ) => void;
  errors?: TutorAchievementDraftErrors;
  idPrefix?: string;
  showPreview?: boolean;
};

export function TutorAchievementsEditor({
  education,
  achievements,
  onEducationChange,
  onAchievementsChange,
  errors,
  idPrefix = "tutor-achievements",
  showPreview = true,
}: TutorAchievementsEditorProps) {
  const editorId = useId();
  const [educationKeys, setEducationKeys] = useState(() =>
    education.map((_, index) => `${editorId}-education-${index}`),
  );
  const [achievementKeys, setAchievementKeys] = useState(() =>
    achievements.map((_, index) => `${editorId}-achievement-${index}`),
  );
  const [nextEducationKey, setNextEducationKey] = useState(education.length);
  const [nextAchievementKey, setNextAchievementKey] = useState(
    achievements.length,
  );

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

  function updateAchievement(index: number, update: Partial<TutorAchievement>) {
    onAchievementsChange(
      achievements.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...update } : entry,
      ),
      Object.keys(update)[0]
        ? `achievements.${index}.${Object.keys(update)[0]}`
        : `achievements.${index}`,
    );
  }

  function removeEducation(index: number) {
    setEducationKeys((keys) =>
      keys.filter((_, entryIndex) => entryIndex !== index),
    );
    onEducationChange(
      education.filter((_, entryIndex) => entryIndex !== index),
    );
  }

  function removeAchievement(index: number) {
    setAchievementKeys((keys) =>
      keys.filter((_, entryIndex) => entryIndex !== index),
    );
    onAchievementsChange(
      achievements.filter((_, entryIndex) => entryIndex !== index),
    );
  }

  function addEducation() {
    setEducationKeys((keys) => [
      ...keys,
      `${editorId}-education-${nextEducationKey}`,
    ]);
    setNextEducationKey((key) => key + 1);
    onEducationChange([...education, createEmptyEducationEntry()]);
  }

  function addAchievement() {
    setAchievementKeys((keys) => [
      ...keys,
      `${editorId}-achievement-${nextAchievementKey}`,
    ]);
    setNextAchievementKey((key) => key + 1);
    onAchievementsChange([...achievements, createEmptyAchievement()]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="divide-y divide-card-separator">
        <section className="min-w-0 pb-6">
          <TutorFormRow
            label={
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Heading size="sm">Education</Heading>
                  <Text className="text-sm text-muted">
                    {education.length}/{MAX_EDUCATION_ENTRIES}
                  </Text>
                </div>
              </div>
            }
            description={
              <Text className="mt-1 text-sm text-muted">
                Add your most recent university first. Up to two entries.
              </Text>
            }
          >
            <div className="flex flex-col gap-4">
              <div className="divide-y divide-item-border">
                {education.map((entry, index) => {
                  const universityError =
                    errors?.[`education.${index}.university`];
                  const universityErrorId = `${idPrefix}-university-${index}-error`;
                  const degreeError = errors?.[`education.${index}.degree`];
                  const degreeErrorId = `${idPrefix}-degree-${index}-error`;
                  return (
                    <div
                      key={educationKeys[index]}
                      className="py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-col gap-3">
                        <TutorFormField
                          className="grid-cols-1 gap-y-1 sm:grid-cols-1"
                          htmlFor={`${idPrefix}-university-${index}`}
                          label="University"
                          error={
                            universityError ? (
                              <FieldError id={universityErrorId}>
                                {universityError}
                              </FieldError>
                            ) : undefined
                          }
                        >
                          <TutorTextDraftInput
                            id={`${idPrefix}-university-${index}`}
                            value={entry.university}
                            onCommit={(value) =>
                              updateEducation(index, "university", value)
                            }
                            placeholder="e.g. Universitas Gadjah Mada"
                            maxLength={255}
                            aria-invalid={Boolean(universityError)}
                            aria-describedby={
                              universityError ? universityErrorId : undefined
                            }
                          />
                        </TutorFormField>
                        <TutorFormField
                          className="grid-cols-1 gap-y-1 sm:grid-cols-1"
                          htmlFor={`${idPrefix}-degree-${index}`}
                          label="Degree in brief"
                          error={
                            degreeError ? (
                              <FieldError id={degreeErrorId}>
                                {degreeError}
                              </FieldError>
                            ) : undefined
                          }
                        >
                          <TutorTextDraftInput
                            id={`${idPrefix}-degree-${index}`}
                            value={entry.degree}
                            onCommit={(value) =>
                              updateEducation(index, "degree", value)
                            }
                            placeholder="e.g. Bachelor of Law"
                            maxLength={255}
                            aria-invalid={Boolean(degreeError)}
                            aria-describedby={
                              degreeError ? degreeErrorId : undefined
                            }
                          />
                        </TutorFormField>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        {index === education.length - 1 ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={education.length >= MAX_EDUCATION_ENTRIES}
                            onClick={addEducation}
                          >
                            <IconPlus aria-hidden="true" />
                            Add education
                          </Button>
                        ) : (
                          <span aria-hidden="true" />
                        )}
                        <Button
                          type="button"
                          variant="plain"
                          size="xs-icon"
                          aria-label={`Remove education entry ${index + 1}`}
                          onClick={() => removeEducation(index)}
                        >
                          <IconTrash aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {education.length === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={addEducation}
                >
                  <IconPlus aria-hidden="true" />
                  Add education
                </Button>
              ) : null}
              {errors?.education ? (
                <Field className="gap-0">
                  <FieldError>{errors.education}</FieldError>
                </Field>
              ) : null}
            </div>
          </TutorFormRow>
        </section>

        <section className="min-w-0 pt-6">
          <TutorFormRow
            label={
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Heading size="sm">Achievements</Heading>
                  <Text className="text-sm text-muted">
                    {achievements.length}/{MAX_ACHIEVEMENTS}
                  </Text>
                </div>
              </div>
            }
            description={
              <Text className="mt-1 text-sm text-muted">
                Add your strongest results first. Up to five entries.
              </Text>
            }
          >
            <div className="flex flex-col gap-4">
              <div className="divide-y divide-item-border">
                {achievements.map((entry, index) => {
                  const competitionError =
                    errors?.[`achievements.${index}.competitionName`];
                  const competitionErrorId = `${idPrefix}-competition-${index}-error`;
                  const yearError = errors?.[`achievements.${index}.year`];
                  const yearErrorId = `${idPrefix}-year-${index}-error`;
                  const awardsError = errors?.[`achievements.${index}.awards`];
                  const awardsErrorId = `${idPrefix}-awards-${index}-error`;
                  return (
                    <div
                      key={achievementKeys[index]}
                      className="py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-col gap-3">
                        <TutorFormField
                          className="grid-cols-1 gap-y-1 sm:grid-cols-1"
                          htmlFor={`${idPrefix}-competition-${index}`}
                          label="Competition name"
                          error={
                            competitionError ? (
                              <FieldError id={competitionErrorId}>
                                {competitionError}
                              </FieldError>
                            ) : undefined
                          }
                        >
                          <TutorTextDraftInput
                            id={`${idPrefix}-competition-${index}`}
                            value={entry.competitionName}
                            onCommit={(value) =>
                              updateAchievement(index, {
                                competitionName: value,
                              })
                            }
                            placeholder="e.g. Harvard Model United Nations"
                            maxLength={255}
                            aria-invalid={Boolean(competitionError)}
                            aria-describedby={
                              competitionError ? competitionErrorId : undefined
                            }
                          />
                        </TutorFormField>
                        <TutorFormField
                          className="grid-cols-1 gap-y-1 sm:grid-cols-1"
                          htmlFor={`${idPrefix}-year-${index}`}
                          label="Year"
                          error={
                            yearError ? (
                              <FieldError id={yearErrorId}>
                                {yearError}
                              </FieldError>
                            ) : undefined
                          }
                        >
                          <NumberField
                            id={`${idPrefix}-year-${index}`}
                            value={entry.year || null}
                            min={1900}
                            max={2100}
                            step={1}
                            format={YEAR_FORMAT}
                            allowOutOfRange
                            onValueChange={(value) =>
                              updateAchievement(index, { year: value ?? 0 })
                            }
                            inputProps={{
                              "aria-label": `Year for competition achievement ${index + 1}`,
                              "aria-invalid": Boolean(yearError),
                              "aria-describedby": yearError
                                ? yearErrorId
                                : undefined,
                            }}
                          />
                        </TutorFormField>
                        <TutorFormField
                          className="grid-cols-1 gap-y-1 sm:grid-cols-1"
                          htmlFor={`${idPrefix}-awards-${index}`}
                          label="Award title in full"
                          description={
                            <FieldDescription>
                              Separate multiple awards with commas.
                            </FieldDescription>
                          }
                          error={
                            awardsError ? (
                              <FieldError id={awardsErrorId}>
                                {awardsError}
                              </FieldError>
                            ) : undefined
                          }
                        >
                          <TutorTextDraftInput
                            id={`${idPrefix}-awards-${index}`}
                            value={formatAwardTitles(entry.awards)}
                            onCommit={(value) =>
                              updateAchievement(index, {
                                awards: parseAwardTitles(value),
                              })
                            }
                            placeholder="e.g. Champion, Best Speaker, Best Memorial"
                            maxLength={2_600}
                            aria-invalid={Boolean(awardsError)}
                            aria-describedby={
                              awardsError ? awardsErrorId : undefined
                            }
                          />
                        </TutorFormField>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        {index === achievements.length - 1 ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            id={`${idPrefix}-competition-add`}
                            disabled={achievements.length >= MAX_ACHIEVEMENTS}
                            onClick={addAchievement}
                          >
                            <IconPlus aria-hidden="true" />
                            Add achievement
                          </Button>
                        ) : (
                          <span aria-hidden="true" />
                        )}
                        <Button
                          type="button"
                          variant="plain"
                          size="xs-icon"
                          aria-label={`Remove achievement ${index + 1}`}
                          onClick={() => removeAchievement(index)}
                        >
                          <IconTrash aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {achievements.length === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  id={`${idPrefix}-competition-add`}
                  onClick={addAchievement}
                >
                  <IconPlus aria-hidden="true" />
                  Add achievement
                </Button>
              ) : null}
              {errors?.achievements ? (
                <Field className="gap-0">
                  <FieldError>{errors.achievements}</FieldError>
                </Field>
              ) : null}
            </div>
          </TutorFormRow>
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
              achievements={achievements}
              emptyMessage="Add an entry to see the public profile preview."
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
