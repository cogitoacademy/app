"use client";

import { useState } from "react";
import { IconPlus, IconTrash } from "@tabler/icons-react";

import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Field,
  FieldDescription,
  FieldError,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { NumberField } from "@cogito-app/ui/components/selia/number-field";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import { Text } from "@cogito-app/ui/components/selia/text";

import { TutorTextDraftInput } from "./tutor-text-draft-input";
import { TutorFormField, TutorFormRow } from "./tutor-form-layout";

export type TutorExperience = {
  role: string;
  organization: string;
  startYear: number;
  endYear: number | null;
  description: string;
};

export type TutorExperienceDraftErrors = Record<string, string>;

const MAX_EXPERIENCE_ENTRIES = 5;
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

export function createEmptyExperience(): TutorExperience {
  return {
    role: "",
    organization: "",
    startYear: CURRENT_YEAR,
    endYear: null,
    description: "",
  };
}

export function validateTutorExperienceDraft(
  experiences: readonly TutorExperience[],
): TutorExperienceDraftErrors {
  const errors: TutorExperienceDraftErrors = {};

  for (const [index, entry] of experiences.entries()) {
    const fieldPrefix = `experiences.${index}`;
    if (!entry.role.trim()) {
      errors[`${fieldPrefix}.role`] = "Role or position is required.";
    } else if (entry.role.trim().length > 255) {
      errors[`${fieldPrefix}.role`] = "Use 255 characters or fewer.";
    }
    if (!entry.organization.trim()) {
      errors[`${fieldPrefix}.organization`] =
        "Organization or company is required.";
    } else if (entry.organization.trim().length > 255) {
      errors[`${fieldPrefix}.organization`] = "Use 255 characters or fewer.";
    }
    if (
      !Number.isInteger(entry.startYear) ||
      entry.startYear < 1900 ||
      entry.startYear > 2100
    ) {
      errors[`${fieldPrefix}.startYear`] =
        "Enter a start year between 1900 and 2100.";
    }
    if (
      entry.endYear !== null &&
      (!Number.isInteger(entry.endYear) ||
        entry.endYear < 1900 ||
        entry.endYear > 2100)
    ) {
      errors[`${fieldPrefix}.endYear`] =
        "Enter an end year between 1900 and 2100.";
    }
    if (entry.endYear !== null && entry.endYear < entry.startYear) {
      errors[`${fieldPrefix}.endYear`] =
        "End year must be on or after the start year.";
    }
    if (!entry.description.trim()) {
      errors[`${fieldPrefix}.description`] = "A short description is required.";
    } else if (entry.description.trim().length > 1_000) {
      errors[`${fieldPrefix}.description`] = "Use 1,000 characters or fewer.";
    }
  }

  if (Object.keys(errors).some((key) => key.startsWith("experiences."))) {
    errors.experiences = "Complete the highlighted experience fields.";
  }

  return errors;
}

function formatExperiencePeriod(entry: TutorExperience) {
  return `${entry.startYear}–${entry.endYear ?? "Present"}`;
}

type TutorExperiencesDisplayProps = {
  experiences?: readonly TutorExperience[] | null;
  emptyMessage?: string;
  className?: string;
  idPrefix?: string;
};

export function TutorExperiencesDisplay({
  experiences,
  emptyMessage = "No experiences added yet.",
  className,
  idPrefix = "tutor-experiences",
}: TutorExperiencesDisplayProps) {
  const entries = experiences ?? [];
  const rows = getDisplayRows(
    entries,
    (entry) =>
      `${entry.role}-${entry.organization}-${entry.startYear}-${entry.endYear}-${entry.description}`,
  );

  if (entries.length === 0) {
    return (
      <Text className={className ?? "text-sm italic text-dimmed"}>
        {emptyMessage}
      </Text>
    );
  }

  return (
    <div className={className ?? "flex flex-col gap-6"}>
      <section aria-labelledby={`${idPrefix}-heading`}>
        <Heading id={`${idPrefix}-heading`} size="sm">
          Experiences
        </Heading>
        <ul className="mt-3 flex list-none flex-col gap-4 p-0">
          {rows.map(({ entry, key }) => (
            <li key={key} className="flex items-start gap-2.5">
              <span aria-hidden="true" className="mt-0.5 text-muted">
                •
              </span>
              <div className="min-w-0">
                <div className="flex items-center justify-between">
                  <Text className="font-semibold leading-snug">
                    {entry.role} · {entry.organization}
                  </Text>
                  <Text className="mt-0.5 text-sm text-muted">
                    {formatExperiencePeriod(entry)}
                  </Text>
                </div>
                <Text className="mt-1 whitespace-pre-line text-muted">
                  {entry.description}
                </Text>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

type TutorExperiencesEditorProps = {
  experiences: TutorExperience[];
  onExperiencesChange: (
    experiences: TutorExperience[],
    changedField?: string,
  ) => void;
  errors?: TutorExperienceDraftErrors;
  idPrefix?: string;
  showPreview?: boolean;
};

export function TutorExperiencesEditor({
  experiences,
  onExperiencesChange,
  errors,
  idPrefix = "tutor-experiences",
  showPreview = true,
}: TutorExperiencesEditorProps) {
  const [experienceKeys, setExperienceKeys] = useState(() =>
    experiences.map(() => createDraftKey(`${idPrefix}-entry`)),
  );

  function updateExperience(index: number, update: Partial<TutorExperience>) {
    onExperiencesChange(
      experiences.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...update } : entry,
      ),
      Object.keys(update)[0]
        ? `experiences.${index}.${Object.keys(update)[0]}`
        : `experiences.${index}`,
    );
  }

  function removeExperience(index: number) {
    setExperienceKeys((current) =>
      current.filter((_, entryIndex) => entryIndex !== index),
    );
    onExperiencesChange(
      experiences.filter((_, entryIndex) => entryIndex !== index),
    );
  }

  function addExperience() {
    setExperienceKeys((current) => [
      ...current,
      createDraftKey(`${idPrefix}-entry`),
    ]);
    onExperiencesChange([...experiences, createEmptyExperience()]);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="min-w-0">
        <TutorFormRow
          label={
            <div className="flex items-start gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Heading size="sm">Experiences</Heading>
                <Text className="text-sm text-muted">
                  {experiences.length}/{MAX_EXPERIENCE_ENTRIES}
                </Text>
              </div>
            </div>
          }
          description={
            <Text className="mt-1 text-sm text-muted">
              Add your most relevant roles first. Up to five entries.
            </Text>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="divide-y divide-item-border">
              {experiences.map((entry, index) => {
                const roleError = errors?.[`experiences.${index}.role`];
                const roleErrorId = `${idPrefix}-role-${index}-error`;
                const organizationError =
                  errors?.[`experiences.${index}.organization`];
                const organizationErrorId = `${idPrefix}-organization-${index}-error`;
                const startYearError =
                  errors?.[`experiences.${index}.startYear`];
                const startYearErrorId = `${idPrefix}-start-year-${index}-error`;
                const endYearError = errors?.[`experiences.${index}.endYear`];
                const endYearErrorId = `${idPrefix}-end-year-${index}-error`;
                const descriptionError =
                  errors?.[`experiences.${index}.description`];
                const descriptionErrorId = `${idPrefix}-description-${index}-error`;

                return (
                  <div
                    key={experienceKeys[index]}
                    className="py-4 first:pt-0 last:pb-0"
                  >
                    <div className="flex flex-col gap-3">
                      <TutorFormField
                        className="grid-cols-1 gap-y-1 sm:grid-cols-1"
                        htmlFor={`${idPrefix}-role-${index}`}
                        label="Role or position"
                        error={
                          roleError ? (
                            <FieldError id={roleErrorId}>
                              {roleError}
                            </FieldError>
                          ) : undefined
                        }
                      >
                        <TutorTextDraftInput
                          id={`${idPrefix}-role-${index}`}
                          value={entry.role}
                          onCommit={(value) =>
                            updateExperience(index, { role: value })
                          }
                          placeholder="e.g. Mathematics Tutor"
                          maxLength={255}
                          aria-invalid={Boolean(roleError)}
                          aria-describedby={roleError ? roleErrorId : undefined}
                        />
                      </TutorFormField>
                      <TutorFormField
                        className="grid-cols-1 gap-y-1 sm:grid-cols-1"
                        htmlFor={`${idPrefix}-organization-${index}`}
                        label="Organization or company"
                        error={
                          organizationError ? (
                            <FieldError id={organizationErrorId}>
                              {organizationError}
                            </FieldError>
                          ) : undefined
                        }
                      >
                        <TutorTextDraftInput
                          id={`${idPrefix}-organization-${index}`}
                          value={entry.organization}
                          onCommit={(value) =>
                            updateExperience(index, { organization: value })
                          }
                          placeholder="e.g. Cogito Academy"
                          maxLength={255}
                          aria-invalid={Boolean(organizationError)}
                          aria-describedby={
                            organizationError ? organizationErrorId : undefined
                          }
                        />
                      </TutorFormField>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TutorFormField
                          className="grid-cols-1 gap-y-1 sm:grid-cols-1"
                          htmlFor={`${idPrefix}-start-year-${index}`}
                          label="Start year"
                          error={
                            startYearError ? (
                              <FieldError id={startYearErrorId}>
                                {startYearError}
                              </FieldError>
                            ) : undefined
                          }
                        >
                          <NumberField
                            id={`${idPrefix}-start-year-${index}`}
                            value={entry.startYear || null}
                            min={1900}
                            max={2100}
                            step={1}
                            format={YEAR_FORMAT}
                            allowOutOfRange
                            onValueChange={(value) =>
                              updateExperience(index, { startYear: value ?? 0 })
                            }
                            inputProps={{
                              "aria-label": `Start year for experience entry ${index + 1}`,
                              "aria-invalid": Boolean(startYearError),
                              "aria-describedby": startYearError
                                ? startYearErrorId
                                : undefined,
                            }}
                          />
                        </TutorFormField>
                        <TutorFormField
                          className="grid-cols-1 gap-y-1 sm:grid-cols-1"
                          htmlFor={`${idPrefix}-end-year-${index}`}
                          label="End year"
                          error={
                            endYearError ? (
                              <FieldError id={endYearErrorId}>
                                {endYearError}
                              </FieldError>
                            ) : undefined
                          }
                        >
                          <NumberField
                            id={`${idPrefix}-end-year-${index}`}
                            value={entry.endYear}
                            min={1900}
                            max={2100}
                            step={1}
                            format={YEAR_FORMAT}
                            allowOutOfRange
                            onValueChange={(value) =>
                              updateExperience(index, {
                                endYear: value ?? null,
                              })
                            }
                            inputProps={{
                              "aria-label": `End year for experience entry ${index + 1}`,
                              "aria-invalid": Boolean(endYearError),
                              "aria-describedby": endYearError
                                ? endYearErrorId
                                : undefined,
                            }}
                          />
                          <FieldDescription>
                            Leave blank if this experience is ongoing.
                          </FieldDescription>
                        </TutorFormField>
                      </div>
                      <TutorFormField
                        className="grid-cols-1 gap-y-1 sm:grid-cols-1"
                        htmlFor={`${idPrefix}-description-${index}`}
                        label="Description in brief"
                        error={
                          descriptionError ? (
                            <FieldError id={descriptionErrorId}>
                              {descriptionError}
                            </FieldError>
                          ) : undefined
                        }
                      >
                        <Textarea
                          id={`${idPrefix}-description-${index}`}
                          rows={3}
                          value={entry.description}
                          maxLength={1000}
                          aria-invalid={Boolean(descriptionError)}
                          aria-describedby={
                            descriptionError ? descriptionErrorId : undefined
                          }
                          onChange={(event) =>
                            updateExperience(index, {
                              description: event.target.value,
                            })
                          }
                          placeholder="e.g. Guided students through national mathematics olympiad preparation."
                        />
                      </TutorFormField>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      {index === experiences.length - 1 ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          id={`${idPrefix}-add`}
                          disabled={
                            experiences.length >= MAX_EXPERIENCE_ENTRIES
                          }
                          onClick={addExperience}
                        >
                          <IconPlus aria-hidden="true" />
                          Add experience
                        </Button>
                      ) : (
                        <span aria-hidden="true" />
                      )}
                      <Button
                        type="button"
                        variant="plain"
                        size="xs-icon"
                        aria-label={`Remove experience entry ${index + 1}`}
                        onClick={() => removeExperience(index)}
                      >
                        <IconTrash aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {experiences.length === 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                id={`${idPrefix}-add`}
                onClick={addExperience}
              >
                <IconPlus aria-hidden="true" />
                Add experience
              </Button>
            ) : null}
            {errors?.experiences ? (
              <Field className="gap-0">
                <FieldError>{errors.experiences}</FieldError>
              </Field>
            ) : null}
          </div>
        </TutorFormRow>
      </section>

      {showPreview ? (
        <div className="rounded-lg border border-item-border bg-accent p-4">
          <Text className="text-sm font-medium">Public preview</Text>
          <Text className="mt-1 text-sm text-muted">
            Each experience shows its role, organization, period, and brief
            description.
          </Text>
          <div className="mt-4">
            <TutorExperiencesDisplay
              experiences={experiences}
              emptyMessage="Add an experience to see the public profile preview."
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
