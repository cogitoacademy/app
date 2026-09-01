"use client";

import { useRef } from "react";
import { IconBriefcase, IconPlus, IconTrash } from "@tabler/icons-react";

import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { NumberField } from "@cogito-app/ui/components/selia/number-field";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import { Text } from "@cogito-app/ui/components/selia/text";

import { TutorTextDraftInput } from "./tutor-text-draft-input";

export type TutorExperienceEntry = {
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

export function createEmptyExperienceEntry(): TutorExperienceEntry {
  return {
    role: "",
    organization: "",
    startYear: CURRENT_YEAR,
    endYear: null,
    description: "",
  };
}

export function validateTutorExperienceDraft(
  experienceEntries: readonly TutorExperienceEntry[],
): TutorExperienceDraftErrors {
  const errors: TutorExperienceDraftErrors = {};

  for (const [index, entry] of experienceEntries.entries()) {
    const fieldPrefix = `experienceEntries.${index}`;
    if (!entry.role.trim()) {
      errors[`${fieldPrefix}.role`] = "Role or position is required.";
    } else if (entry.role.length > 255) {
      errors[`${fieldPrefix}.role`] = "Use 255 characters or fewer.";
    }
    if (!entry.organization.trim()) {
      errors[`${fieldPrefix}.organization`] =
        "Organization or company is required.";
    } else if (entry.organization.length > 255) {
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
    } else if (entry.description.length > 1_000) {
      errors[`${fieldPrefix}.description`] = "Use 1,000 characters or fewer.";
    }
  }

  if (Object.keys(errors).some((key) => key.startsWith("experienceEntries."))) {
    errors.experienceEntries = "Complete the highlighted experience fields.";
  }

  return errors;
}

function formatExperiencePeriod(entry: TutorExperienceEntry) {
  return `${entry.startYear}–${entry.endYear ?? "Present"}`;
}

type TutorExperiencesDisplayProps = {
  experienceEntries?: readonly TutorExperienceEntry[] | null;
  emptyMessage?: string;
  className?: string;
  idPrefix?: string;
};

export function TutorExperiencesDisplay({
  experienceEntries,
  emptyMessage = "No experiences added yet.",
  className,
  idPrefix = "tutor-experiences",
}: TutorExperiencesDisplayProps) {
  const entries = experienceEntries ?? [];
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
                <Text className="font-semibold leading-snug">
                  {entry.role} · {entry.organization}
                </Text>
                <Text className="mt-0.5 text-sm text-muted">
                  {formatExperiencePeriod(entry)}
                </Text>
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
  experienceEntries: TutorExperienceEntry[];
  onExperienceEntriesChange: (
    experienceEntries: TutorExperienceEntry[],
    changedField?: string,
  ) => void;
  errors?: TutorExperienceDraftErrors;
  legacyText?: string | null;
  idPrefix?: string;
  showPreview?: boolean;
};

export function TutorExperiencesEditor({
  experienceEntries,
  onExperienceEntriesChange,
  errors,
  legacyText,
  idPrefix = "tutor-experiences",
  showPreview = true,
}: TutorExperiencesEditorProps) {
  const experienceKeys = useRef<string[]>([]);

  function getEditorKey(index: number) {
    const existingKey = experienceKeys.current[index];
    if (existingKey) return existingKey;
    const key = createDraftKey(`${idPrefix}-entry`);
    experienceKeys.current[index] = key;
    return key;
  }

  function updateExperience(
    index: number,
    update: Partial<TutorExperienceEntry>,
  ) {
    onExperienceEntriesChange(
      experienceEntries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...update } : entry,
      ),
      Object.keys(update)[0]
        ? `experienceEntries.${index}.${Object.keys(update)[0]}`
        : `experienceEntries.${index}`,
    );
  }

  function removeExperience(index: number) {
    experienceKeys.current.splice(index, 1);
    onExperienceEntriesChange(
      experienceEntries.filter((_, entryIndex) => entryIndex !== index),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-item-border bg-item p-4">
        <div className="flex items-start gap-3">
          <IconBriefcase
            className="mt-0.5 size-5 shrink-0 text-muted"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Heading size="sm">Experience entries</Heading>
              <Text className="text-sm text-muted">
                {experienceEntries.length}/{MAX_EXPERIENCE_ENTRIES}
              </Text>
            </div>
            <Text className="mt-1 text-sm text-muted">
              Add your most relevant roles first. Up to five entries.
            </Text>
          </div>
        </div>

        {legacyText?.trim() && experienceEntries.length === 0 ? (
          <div className="rounded-lg border border-warning-border bg-warning/10 p-3">
            <Text className="text-sm font-medium">
              Existing experience details
            </Text>
            <Text className="mt-1 whitespace-pre-line text-sm text-muted">
              {legacyText}
            </Text>
            <Text className="mt-2 text-xs text-muted">
              This older format is still preserved. Add structured entries to
              show experiences in the new profile layout.
            </Text>
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          {experienceEntries.map((entry, index) => (
            <div
              key={getEditorKey(index)}
              className="relative rounded-lg border border-item-border bg-card p-3"
            >
              <Button
                type="button"
                variant="plain"
                size="xs-icon"
                className="absolute right-2 top-2"
                aria-label={`Remove experience entry ${index + 1}`}
                onClick={() => removeExperience(index)}
              >
                <IconTrash aria-hidden="true" />
              </Button>
              <div className="grid gap-3 pr-8 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${idPrefix}-role-${index}`}>
                    Role or position
                  </FieldLabel>
                  {(() => {
                    const error = errors?.[`experienceEntries.${index}.role`];
                    const errorId = `${idPrefix}-role-${index}-error`;
                    return (
                      <>
                        <TutorTextDraftInput
                          id={`${idPrefix}-role-${index}`}
                          value={entry.role}
                          onCommit={(value) =>
                            updateExperience(index, { role: value })
                          }
                          placeholder="e.g. Mathematics Tutor"
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
                  <FieldLabel htmlFor={`${idPrefix}-organization-${index}`}>
                    Organization or company
                  </FieldLabel>
                  {(() => {
                    const error =
                      errors?.[`experienceEntries.${index}.organization`];
                    const errorId = `${idPrefix}-organization-${index}-error`;
                    return (
                      <>
                        <TutorTextDraftInput
                          id={`${idPrefix}-organization-${index}`}
                          value={entry.organization}
                          onCommit={(value) =>
                            updateExperience(index, { organization: value })
                          }
                          placeholder="e.g. Cogito Academy"
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
                  <FieldLabel htmlFor={`${idPrefix}-start-year-${index}`}>
                    Start year
                  </FieldLabel>
                  {(() => {
                    const error =
                      errors?.[`experienceEntries.${index}.startYear`];
                    const errorId = `${idPrefix}-start-year-${index}-error`;
                    return (
                      <>
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
                <Field>
                  <FieldLabel htmlFor={`${idPrefix}-end-year-${index}`}>
                    End year
                  </FieldLabel>
                  {(() => {
                    const error =
                      errors?.[`experienceEntries.${index}.endYear`];
                    const errorId = `${idPrefix}-end-year-${index}-error`;
                    return (
                      <>
                        <NumberField
                          id={`${idPrefix}-end-year-${index}`}
                          value={entry.endYear}
                          min={1900}
                          max={2100}
                          step={1}
                          format={YEAR_FORMAT}
                          allowOutOfRange
                          onValueChange={(value) =>
                            updateExperience(index, { endYear: value ?? null })
                          }
                          inputProps={{
                            "aria-label": `End year for experience entry ${index + 1}`,
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
                  <FieldDescription>
                    Leave blank if this experience is ongoing.
                  </FieldDescription>
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor={`${idPrefix}-description-${index}`}>
                    Description in brief
                  </FieldLabel>
                  <Textarea
                    id={`${idPrefix}-description-${index}`}
                    rows={3}
                    value={entry.description}
                    maxLength={1000}
                    aria-invalid={Boolean(
                      errors?.[`experienceEntries.${index}.description`],
                    )}
                    aria-describedby={
                      errors?.[`experienceEntries.${index}.description`]
                        ? `${idPrefix}-description-${index}-error`
                        : undefined
                    }
                    onChange={(event) =>
                      updateExperience(index, {
                        description: event.target.value,
                      })
                    }
                    placeholder="e.g. Guided students through national mathematics olympiad preparation."
                  />
                  {errors?.[`experienceEntries.${index}.description`] ? (
                    <FieldError id={`${idPrefix}-description-${index}-error`}>
                      {errors[`experienceEntries.${index}.description`]}
                    </FieldError>
                  ) : null}
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
          id={`${idPrefix}-add`}
          disabled={experienceEntries.length >= MAX_EXPERIENCE_ENTRIES}
          onClick={() =>
            onExperienceEntriesChange([
              ...experienceEntries,
              createEmptyExperienceEntry(),
            ])
          }
        >
          <IconPlus aria-hidden="true" />
          Add experience
        </Button>
        {errors?.experienceEntries ? (
          <Field className="gap-0">
            <FieldError>{errors.experienceEntries}</FieldError>
          </Field>
        ) : null}
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
              experienceEntries={experienceEntries}
              emptyMessage="Add an experience to see the public profile preview."
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
