"use client";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@cogito-app/ui/components/selia/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { DatePicker } from "@cogito-app/ui/components/selia/date-picker";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import {
  getSelectItemValue,
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { IconPlus, IconX } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";

import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";

const LEVELS = [
  "International",
  "National",
  "Province/State",
  "City/Regency",
  "School",
] as const;

const CATEGORY_OPTIONS = [
  { value: "competition", label: "Competition" },
  { value: "award", label: "Award" },
  { value: "certificate", label: "Certificate" },
  { value: "leadership", label: "Leadership" },
  { value: "publication", label: "Publication" },
  { value: "other", label: "Other" },
] as const;

export type AchievementCategory = (typeof CATEGORY_OPTIONS)[number]["value"];

type AchievementFormValues = {
  eventName: string;
  category: AchievementCategory;
  award: string;
  level: string;
  awardingDate: string;
  location: string;
  description: string;
  subjects: string[];
  evidenceUrl: string;
  documentationUrl: string;
};

type AchievementFormProps = {
  mode: "create" | "edit";
  audience?: "student" | "admin";
  defaultValues?: Partial<AchievementFormValues>;
  editId?: string;
  expectedVersion?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

const DEFAULT_VALUES: AchievementFormValues = {
  eventName: "",
  category: "other",
  award: "",
  level: "",
  awardingDate: "",
  location: "",
  description: "",
  subjects: [],
  evidenceUrl: "",
  documentationUrl: "",
};

const achievementFormSchema = z.object({
  eventName: z.string().trim().min(1, "Event name is required").max(255),
  category: z.enum([
    "competition",
    "award",
    "certificate",
    "leadership",
    "publication",
    "other",
  ]),
  award: z.string().trim().min(1, "Award / result is required").max(255),
  level: z.string().min(1, "Level is required").max(255),
  awardingDate: z.string().max(255),
  location: z.string().max(255),
  description: z.string().max(2000),
  subjects: z.array(z.string().max(255)).max(20),
  evidenceUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => !value || isValidHttpUrl(value), {
      message: "Enter a valid proof URL",
    }),
  documentationUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => !value || isValidHttpUrl(value), {
      message: "Enter a valid public documentation URL",
    }),
});

const studentAchievementFormSchema = achievementFormSchema
  .omit({ documentationUrl: true })
  .superRefine((value, context) => {
    if (!value.evidenceUrl.trim()) {
      context.addIssue({
        code: "custom",
        path: ["evidenceUrl"],
        message: "Proof link is required",
      });
    }
  });

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function AchievementForm({
  mode,
  audience = "student",
  defaultValues,
  editId,
  expectedVersion,
  open,
  onOpenChange,
  onSuccess,
}: AchievementFormProps) {
  const [subjectInput, setSubjectInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const isAdmin = audience === "admin";

  const createMutation = useMutation(
    orpc.achievement.create.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: orpc.achievement.list.key(),
        });
        toastManager.add({
          title: "Achievement submitted!",
          description: "It\u2019ll appear on cogitoacademy.id once approved.",
          type: "success",
        });
        form.reset(DEFAULT_VALUES);
        setSubjectInput("");
        setFormError(null);
        onOpenChange(false);
        onSuccess?.();
      },
      onError: (error) => {
        toastManager.add({
          title: "Achievement could not be submitted",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );

  const updateMutation = useMutation(
    orpc.achievement.update.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: orpc.achievement.list.key(),
        });
        toastManager.add({
          title: "Achievement updated!",
          description: "Resubmitted for review.",
          type: "success",
        });
        onOpenChange(false);
        onSuccess?.();
      },
      onError: (error) => {
        toastManager.add({
          title: "Achievement could not be updated",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );

  const adminUpdateMutation = useMutation(
    orpc.achievement.adminUpdate.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: orpc.achievement.adminList.key(),
        });
        toastManager.add({
          title: "Achievement corrections saved",
          description: "The corrected submission is ready for review.",
          type: "success",
        });
        onOpenChange(false);
        onSuccess?.();
      },
      onError: (error) => {
        toastManager.add({
          title: "Achievement corrections could not be saved",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );

  const form = useForm({
    defaultValues: { ...DEFAULT_VALUES, ...defaultValues },
    onSubmit: async ({ value }) => {
      const validation = (
        isAdmin ? achievementFormSchema : studentAchievementFormSchema
      ).safeParse(value);
      if (!validation.success) {
        setFormError(
          validation.error.issues[0]?.message ??
            "Check the form fields and try again.",
        );
        return;
      }

      setFormError(null);
      try {
        if (mode === "edit" && editId) {
          if (expectedVersion === undefined)
            throw new Error("expectedVersion is required in edit mode");
          const data = {
            eventName: value.eventName,
            category: value.category,
            award: value.award,
            level: value.level,
            awardingDate: value.awardingDate || null,
            location: value.location || null,
            description: value.description || null,
            subjects: value.subjects,
            evidenceUrl: value.evidenceUrl || null,
            ...(isAdmin
              ? { documentationUrl: value.documentationUrl || null }
              : {}),
          };

          if (isAdmin) {
            await adminUpdateMutation.mutateAsync({
              id: editId,
              version: expectedVersion,
              data,
            });
          } else {
            await updateMutation.mutateAsync({
              id: editId,
              version: expectedVersion,
              data,
            });
          }
        } else {
          await createMutation.mutateAsync({
            eventName: value.eventName,
            category: value.category,
            award: value.award,
            level: value.level,
            awardingDate: value.awardingDate || undefined,
            location: value.location || undefined,
            description: value.description || undefined,
            subjects: value.subjects,
            evidenceUrl: value.evidenceUrl || undefined,
          });
        }
      } catch {
        // The mutation's onError callback has already shown a user-facing error.
      }
    },
  });

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    adminUpdateMutation.isPending;
  const submitLabel = isPending
    ? isAdmin
      ? "Saving corrections..."
      : mode === "create"
        ? "Submitting achievement..."
        : "Resubmitting achievement..."
    : isAdmin
      ? "Save corrections"
      : mode === "create"
        ? "Submit Achievement"
        : "Resubmit";

  const addSubject = () => {
    const trimmed = subjectInput.trim();
    if (trimmed && !form.getFieldValue("subjects").includes(trimmed)) {
      form.setFieldValue("subjects", [
        ...form.getFieldValue("subjects"),
        trimmed,
      ]);
      setSubjectInput("");
    }
  };

  const removeSubject = (subject: string) => {
    form.setFieldValue(
      "subjects",
      form.getFieldValue("subjects").filter((s) => s !== subject),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg">
        <DialogHeader className="flex-col items-start gap-1.5">
          <DialogTitle>
            {isAdmin
              ? "Correct Achievement"
              : mode === "create"
                ? "Add Achievement"
                : "Edit Achievement"}
          </DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Update any field that needs correcting before you approve this submission."
              : mode === "create"
                ? "Submit your competition achievements to be showcased on cogitoacademy.id"
                : "Edit and resubmit your achievement for review"}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="min-h-0">
          {formError ? (
            <Text className="mb-4 text-danger">{formError}</Text>
          ) : null}
          <form
            id="achievement-form"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <Stack direction="column" spacing="md">
              <form.Field name="eventName">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>
                      Event / Competition Name
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="e.g. JoinMUN 2025"
                    />
                    {field.state.meta.errors.map((error) => (
                      <FieldError key={String(error)}>
                        {String(error)}
                      </FieldError>
                    ))}
                  </Field>
                )}
              </form.Field>

              <form.Field name="category">
                {(field) => (
                  <Field>
                    <FieldLabel>Category</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(
                          (getSelectItemValue(value) ??
                            "other") as AchievementCategory,
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectList>
                          {CATEGORY_OPTIONS.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectList>
                      </SelectPopup>
                    </Select>
                    {field.state.meta.errors.map((error) => (
                      <FieldError key={String(error)}>
                        {String(error)}
                      </FieldError>
                    ))}
                  </Field>
                )}
              </form.Field>

              <form.Field name="award">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Award / Result</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="e.g. Best Delegate, Juara 1"
                    />
                    {field.state.meta.errors.map((error) => (
                      <FieldError key={String(error)}>
                        {String(error)}
                      </FieldError>
                    ))}
                  </Field>
                )}
              </form.Field>

              <form.Field name="evidenceUrl">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>
                      {isAdmin ? "Verification evidence" : "Proof link"}{" "}
                      {!isAdmin ? <span className="text-danger">*</span> : null}
                    </FieldLabel>
                    <FieldDescription>
                      {isAdmin
                        ? "The link the student provided for verification. Keep it separate from the public documentation image."
                        : "Upload your certificate or proof to Google Drive, set General access to Anyone with the link and Viewer, then paste the link here. This link is only used to verify your achievement."}
                    </FieldDescription>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="url"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder={
                        isAdmin ? "https://..." : "https://drive.google.com/..."
                      }
                    />
                    {field.state.meta.errors.map((error) => (
                      <FieldError key={String(error)}>
                        {String(error)}
                      </FieldError>
                    ))}
                  </Field>
                )}
              </form.Field>

              <form.Field name="level">
                {(field) => (
                  <Field>
                    <FieldLabel>Level</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(getSelectItemValue(value) ?? "")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectList>
                          {LEVELS.map((level) => (
                            <SelectItem key={level} value={level}>
                              {level}
                            </SelectItem>
                          ))}
                        </SelectList>
                      </SelectPopup>
                    </Select>
                    {field.state.meta.errors.map((error) => (
                      <FieldError key={String(error)}>
                        {String(error)}
                      </FieldError>
                    ))}
                  </Field>
                )}
              </form.Field>

              {isAdmin ? (
                <form.Field name="documentationUrl">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>
                        Public documentation image
                      </FieldLabel>
                      <FieldDescription>
                        Optional image URL shown on the public achievement card
                        after approval.
                      </FieldDescription>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="url"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="https://..."
                      />
                      {field.state.meta.errors.map((error) => (
                        <FieldError key={String(error)}>
                          {String(error)}
                        </FieldError>
                      ))}
                    </Field>
                  )}
                </form.Field>
              ) : null}

              <form.Field name="awardingDate">
                {(field) => (
                  <Field>
                    <FieldLabel>Awarding Date</FieldLabel>
                    <DatePicker
                      value={field.state.value}
                      onChange={(value) => field.handleChange(value)}
                      placeholder="Pick a date"
                    />
                  </Field>
                )}
              </form.Field>

              <form.Field name="location">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Location</FieldLabel>
                    <FieldDescription>
                      Enter one location, for example: Jakarta, Indonesia;
                      Geneva, Switzerland; or Online.
                    </FieldDescription>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="e.g. Jakarta, Indonesia"
                    />
                  </Field>
                )}
              </form.Field>

              <form.Field name="description">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>
                      Brief Description
                    </FieldLabel>
                    <FieldDescription>
                      Summarize the result or context in a sentence or two.
                      Example: “Ranked 1st among 1,000 participants across 20
                      countries.”
                    </FieldDescription>
                    <Textarea
                      id={field.name}
                      name={field.name}
                      rows={5}
                      maxLength={2000}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="e.g. Ranked 1st among 1,000 participants across 20 countries."
                    />
                  </Field>
                )}
              </form.Field>

              <form.Field name="subjects">
                {(field) => (
                  <Field>
                    <FieldLabel>Skills / Subjects</FieldLabel>
                    <div className="flex gap-2">
                      <Input
                        value={subjectInput}
                        onChange={(e) => setSubjectInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addSubject();
                          }
                        }}
                        placeholder="Type and press Enter"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={addSubject}
                        disabled={!subjectInput.trim()}
                      >
                        <IconPlus className="size-4" />
                      </Button>
                    </div>
                    {field.state.value.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {field.state.value.map((subject) => (
                          <Badge key={subject} variant="secondary">
                            {subject}
                            <button
                              type="button"
                              aria-label={`Remove ${subject}`}
                              onClick={() => removeSubject(subject)}
                              className="ml-1 hover:text-danger"
                            >
                              <IconX className="size-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </Field>
                )}
              </form.Field>
            </Stack>
          </form>
        </DialogBody>

        <DialogFooter>
          <DialogClose
            render={
              <Button variant="secondary" type="button" aria-label="Cancel" />
            }
          >
            Cancel
          </DialogClose>
          <Button
            type="button"
            disabled={isPending}
            progress={isPending}
            aria-busy={isPending}
            onClick={() => void form.handleSubmit()}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
