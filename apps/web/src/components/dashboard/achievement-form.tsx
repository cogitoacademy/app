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
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { DatePicker } from "@cogito-app/ui/components/selia/date-picker";
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
  "Regional",
  "Provincial",
  "District",
  "School",
] as const;

const CATEGORY_SUGGESTIONS = [
  "MUN",
  "WSC",
  "Olympiad",
  "Debate",
  "Science",
  "Arts",
  "Sports",
  "Academic",
  "Leadership",
] as const;

type AchievementFormValues = {
  eventName: string;
  category: string;
  award: string;
  level: string;
  eventDate: string;
  location: string;
  description: string;
  subjects: string[];
  imageUrl: string;
};

type AchievementFormProps = {
  mode: "create" | "edit";
  defaultValues?: Partial<AchievementFormValues>;
  editId?: string;
  expectedVersion?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

const DEFAULT_VALUES: AchievementFormValues = {
  eventName: "",
  category: "",
  award: "",
  level: "",
  eventDate: "",
  location: "",
  description: "",
  subjects: [],
  imageUrl: "",
};

const achievementFormSchema = z.object({
  eventName: z.string().trim().min(1, "Event name is required").max(255),
  category: z.string().min(1, "Category is required").max(255),
  award: z.string().trim().min(1, "Award / result is required").max(255),
  level: z.string().min(1, "Level is required").max(255),
  eventDate: z.string().max(255),
  location: z.string().max(255),
  description: z.string().max(2000),
  subjects: z.array(z.string().max(255)).max(20),
  imageUrl: z.string().max(2048),
});

export function AchievementForm({
  mode,
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

  const form = useForm({
    defaultValues: { ...DEFAULT_VALUES, ...defaultValues },
    onSubmit: async ({ value }) => {
      const validation = achievementFormSchema.safeParse(value);
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
          await updateMutation.mutateAsync({
            id: editId,
            version: expectedVersion,
            data: {
              eventName: value.eventName,
              category: value.category,
              award: value.award,
              level: value.level,
              eventDate: value.eventDate || undefined,
              location: value.location || undefined,
              description: value.description || undefined,
              subjects: value.subjects,
              imageUrl: value.imageUrl || undefined,
            },
          });
        } else {
          await createMutation.mutateAsync({
            eventName: value.eventName,
            category: value.category,
            award: value.award,
            level: value.level,
            eventDate: value.eventDate || undefined,
            location: value.location || undefined,
            description: value.description || undefined,
            subjects: value.subjects,
            imageUrl: value.imageUrl || undefined,
          });
        }
      } catch {
        // The mutation's onError callback has already shown a user-facing error.
      }
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;
  const submitLabel = isPending
    ? mode === "create"
      ? "Submitting achievement..."
      : "Resubmitting achievement..."
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
      <DialogPopup>
        <DialogHeader className="flex-col items-start gap-1.5">
          <DialogTitle>
            {mode === "create" ? "Add Achievement" : "Edit Achievement"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Submit your competition achievements to be showcased on cogitoacademy.id"
              : "Edit and resubmit your achievement for review"}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
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
            <Stack direction="column" spacing="lg">
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
                        field.handleChange(getSelectItemValue(value) ?? "")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectList>
                          {CATEGORY_SUGGESTIONS.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
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

              <form.Field name="eventDate">
                {(field) => (
                  <Field>
                    <FieldLabel>Event Date</FieldLabel>
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
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="e.g. Jakarta, Online"
                    />
                  </Field>
                )}
              </form.Field>

              <form.Field name="description">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Brief description of your achievement"
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

              <form.Field name="imageUrl">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>
                      Certificate / Photo URL
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="https://..."
                    />
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
