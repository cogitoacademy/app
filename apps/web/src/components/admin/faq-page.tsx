"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconDeviceFloppy,
  IconEdit,
  IconPlus,
  IconX,
} from "@tabler/icons-react";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  Item,
  ItemAction,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { getUserFacingError } from "@/lib/error-message";
import { client } from "@/utils/orpc";

type AnswerBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; style: "ordered" | "unordered"; items: string[] };

type EditableBlock =
  | { id: string; type: "paragraph"; text: string }
  | {
      id: string;
      type: "list";
      style: "ordered" | "unordered";
      itemsText: string;
    };

type FaqEntry = {
  id: string;
  questionEn: string;
  questionId: string | null;
  answerEn: AnswerBlock[];
  answerId: AnswerBlock[] | null;
  sortOrder: number;
  isActive: boolean;
  showOnLanding: boolean;
  version: number;
};

type FaqPayload = {
  questionEn: string;
  questionId?: string;
  answerEn: AnswerBlock[];
  answerId: AnswerBlock[] | null;
  sortOrder: number;
  isActive: boolean;
  showOnLanding: boolean;
};

type FaqDraft = {
  questionEn: string;
  questionId: string;
  answerEn: EditableBlock[];
  answerId: EditableBlock[];
  sortOrder: string;
  isActive: boolean;
  showOnLanding: boolean;
};

type FaqValidationError = {
  field: "questionEn" | "answerEn" | "sortOrder";
  message: string;
};

const FAQ_LIST_KEY = ["adminFaq", "list"] as const;

function emptyDraft(): FaqDraft {
  return {
    questionEn: "",
    questionId: "",
    answerEn: [{ id: crypto.randomUUID(), type: "paragraph", text: "" }],
    answerId: [],
    sortOrder: "0",
    isActive: true,
    showOnLanding: false,
  };
}

function toEditableBlocks(blocks: AnswerBlock[] | null): EditableBlock[] {
  return (blocks ?? []).map((block) =>
    block.type === "paragraph"
      ? { id: crypto.randomUUID(), type: "paragraph", text: block.text }
      : {
          id: crypto.randomUUID(),
          type: "list",
          style: block.style,
          itemsText: block.items.join("\n"),
        },
  );
}

function toAnswerBlocks(blocks: EditableBlock[]): AnswerBlock[] {
  const answer: AnswerBlock[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph") {
      const text = block.text.trim();
      if (text) answer.push({ type: "paragraph", text });
      continue;
    }
    const items = block.itemsText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length) answer.push({ type: "list", style: block.style, items });
  }
  return answer;
}

function draftFromEntry(entry: FaqEntry): FaqDraft {
  return {
    questionEn: entry.questionEn,
    questionId: entry.questionId ?? "",
    answerEn: toEditableBlocks(entry.answerEn),
    answerId: toEditableBlocks(entry.answerId),
    sortOrder: String(entry.sortOrder),
    isActive: entry.isActive,
    showOnLanding: entry.showOnLanding,
  };
}

function BlocksField({
  label,
  blocks,
  onChange,
  error,
  errorId,
  invalid = false,
}: {
  label: string;
  blocks: EditableBlock[];
  onChange: (blocks: EditableBlock[]) => void;
  error?: string;
  errorId?: string;
  invalid?: boolean;
}) {
  const fieldId = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const labelId = `${fieldId}-label`;
  const descriptionId = `${fieldId}-description`;
  const describedBy = errorId ? `${descriptionId} ${errorId}` : descriptionId;

  function addParagraph() {
    onChange([
      ...blocks,
      { id: crypto.randomUUID(), type: "paragraph", text: "" },
    ]);
  }

  function addList(style: "ordered" | "unordered") {
    onChange([
      ...blocks,
      { id: crypto.randomUUID(), type: "list", style, itemsText: "" },
    ]);
  }

  function updateBlock(index: number, block: EditableBlock) {
    onChange(
      blocks.map((current, currentIndex) =>
        currentIndex === index ? block : current,
      ),
    );
  }

  return (
    <Field>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
      >
        <p id={labelId} className="font-medium text-foreground">
          {label}
        </p>
        <FieldDescription id={descriptionId}>
          Add paragraphs or lists. Enter each list item on its own line.
        </FieldDescription>
        {error && errorId ? (
          <p id={errorId} className="text-danger">
            {error}
          </p>
        ) : null}
        <Stack>
          {blocks.map((block, index) => {
            const blockLabel =
              block.type === "paragraph"
                ? `Paragraph ${index + 1}`
                : `${block.style === "ordered" ? "Ordered" : "Unordered"} list ${index + 1}`;
            const controlId = `${fieldId}-${block.id}`;
            return (
              <div
                className="rounded-lg border border-card-border p-3"
                key={block.id}
              >
                <Stack
                  direction="row"
                  spacing="sm"
                  className="mb-3 items-center justify-between"
                >
                  <FieldLabel
                    htmlFor={controlId}
                    className="text-sm font-medium text-muted"
                  >
                    {blockLabel}
                  </FieldLabel>
                  <Button
                    type="button"
                    variant="plain"
                    size="sm"
                    onClick={() =>
                      onChange(
                        blocks.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    aria-label={`Remove ${label.toLowerCase()} block ${index + 1}`}
                  >
                    <IconX aria-hidden="true" />
                    Remove
                  </Button>
                </Stack>
                {block.type === "paragraph" ? (
                  <Textarea
                    id={controlId}
                    rows={3}
                    aria-invalid={invalid || undefined}
                    aria-describedby={invalid ? describedBy : descriptionId}
                    data-faq-answer-field={
                      fieldId === "answer-english" ? "" : undefined
                    }
                    value={block.text}
                    onChange={(event) =>
                      updateBlock(index, { ...block, text: event.target.value })
                    }
                  />
                ) : (
                  <Textarea
                    id={controlId}
                    rows={3}
                    aria-invalid={invalid || undefined}
                    aria-describedby={invalid ? describedBy : descriptionId}
                    data-faq-answer-field={
                      fieldId === "answer-english" ? "" : undefined
                    }
                    placeholder="One item per line"
                    value={block.itemsText}
                    onChange={(event) =>
                      updateBlock(index, {
                        ...block,
                        itemsText: event.target.value,
                      })
                    }
                  />
                )}
              </div>
            );
          })}
          <Stack direction="row" spacing="sm" className="flex-wrap">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              id={
                fieldId === "answer-english"
                  ? "faq-answer-en-add-paragraph"
                  : undefined
              }
              aria-describedby={invalid ? describedBy : undefined}
              onClick={addParagraph}
            >
              <IconPlus aria-hidden="true" />
              Add paragraph
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => addList("ordered")}
            >
              <IconPlus aria-hidden="true" />
              Add ordered list
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => addList("unordered")}
            >
              <IconPlus aria-hidden="true" />
              Add unordered list
            </Button>
          </Stack>
        </Stack>
      </div>
    </Field>
  );
}

export function FaqPage() {
  const queryClient = useQueryClient();
  const [editingEntry, setEditingEntry] = useState<FaqEntry | null>(null);
  const [draft, setDraft] = useState<FaqDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [validationError, setValidationError] =
    useState<FaqValidationError | null>(null);
  useEffect(() => {
    if (!validationError) return;

    const targetId =
      validationError.field === "questionEn"
        ? "faq-question-en"
        : validationError.field === "sortOrder"
          ? "faq-sort-order"
          : "faq-answer-en-add-paragraph";
    const target =
      validationError.field === "answerEn"
        ? (document.querySelector<HTMLTextAreaElement>(
            "[data-faq-answer-field]",
          ) ?? document.getElementById(targetId))
        : document.getElementById(targetId);
    target?.focus();
  }, [validationError]);
  const listQuery = useQuery({
    queryKey: FAQ_LIST_KEY,
    queryFn: () => client.adminFaq.list({}),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: FaqPayload) =>
      editingEntry
        ? client.adminFaq.update({
            ...payload,
            id: editingEntry.id,
            expectedVersion: editingEntry.version,
          })
        : client.adminFaq.create(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FAQ_LIST_KEY });
      toastManager.add({ title: "FAQ saved", type: "success" });
      setDraft(null);
      setEditingEntry(null);
      setFormError(null);
      setValidationError(null);
    },
    onError: async (error) => {
      setFormError(getUserFacingError(error));
      setValidationError(null);
      await queryClient.invalidateQueries({ queryKey: FAQ_LIST_KEY });
    },
  });

  const entries = listQuery.data ?? [];

  function openNewEntry() {
    setEditingEntry(null);
    setDraft(emptyDraft());
    setFormError(null);
    setValidationError(null);
  }

  function openEntry(entry: FaqEntry) {
    setEditingEntry(entry);
    setDraft(draftFromEntry(entry));
    setFormError(null);
    setValidationError(null);
  }

  function saveEntry() {
    if (!draft) return;
    const answerEn = toAnswerBlocks(draft.answerEn);
    const answerId = toAnswerBlocks(draft.answerId);
    const sortOrder = Number(draft.sortOrder);
    if (!draft.questionEn.trim()) {
      setFormError(null);
      setValidationError({
        field: "questionEn",
        message: "Enter an English question.",
      });
      return;
    }
    if (answerEn.length === 0) {
      setFormError(null);
      setValidationError({
        field: "answerEn",
        message: "Add at least one English answer block.",
      });
      return;
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      setFormError(null);
      setValidationError({
        field: "sortOrder",
        message:
          "Sort order must be a whole number greater than or equal to zero.",
      });
      return;
    }
    setValidationError(null);
    setFormError(null);
    saveMutation.mutate({
      questionEn: draft.questionEn.trim(),
      questionId: draft.questionId.trim() || undefined,
      answerEn,
      answerId: answerId.length ? answerId : null,
      sortOrder,
      isActive: draft.isActive,
      showOnLanding: draft.showOnLanding,
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <Stack spacing="lg">
        <Stack
          direction="row"
          spacing="md"
          className="items-center justify-between"
        >
          <div>
            <Heading level={1}>FAQ</Heading>
            <p className="mt-1 text-muted">
              Manage public answers, language options, order, and landing-page
              visibility.
            </p>
          </div>
          <Button type="button" onClick={openNewEntry}>
            <IconPlus aria-hidden="true" />
            Add FAQ
          </Button>
        </Stack>

        <Card>
          <CardHeader>
            <CardTitle>FAQ entries</CardTitle>
            <CardDescription>
              Public pages show active entries in sort order. Landing pages show
              active entries marked for landing.
            </CardDescription>
          </CardHeader>
          <CardBody>
            {listQuery.isPending ? (
              <p className="text-muted">Loading FAQ entries…</p>
            ) : listQuery.isError ? (
              <p className="text-danger">
                {getUserFacingError(listQuery.error)}
              </p>
            ) : entries.length === 0 ? (
              <p className="text-muted">No FAQ entries yet.</p>
            ) : (
              <Stack>
                {entries.map((entry) => (
                  <Item
                    key={entry.id}
                    variant="outline"
                    direction="row"
                    className="items-center"
                  >
                    <ItemContent className="min-w-0 flex-1">
                      <ItemTitle className="max-w-full truncate">
                        {entry.questionEn}
                      </ItemTitle>
                      <ItemDescription>
                        Order {entry.sortOrder} · Version {entry.version}
                      </ItemDescription>
                    </ItemContent>
                    <ItemAction className="flex-wrap justify-end">
                      <Badge variant={entry.isActive ? "success" : "secondary"}>
                        {entry.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {entry.showOnLanding && (
                        <Badge variant="info">Landing</Badge>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => openEntry(entry)}
                      >
                        <IconEdit aria-hidden="true" />
                        Edit
                      </Button>
                    </ItemAction>
                  </Item>
                ))}
              </Stack>
            )}
          </CardBody>
        </Card>

        {draft && (
          <Card>
            <CardHeader>
              <CardTitle>{editingEntry ? "Edit FAQ" : "Add FAQ"}</CardTitle>
              <CardDescription>
                English content is required. Indonesian fields are optional and
                fall back to English on public pages.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <Stack spacing="lg">
                <Field>
                  <FieldLabel htmlFor="faq-question-en">
                    Question (English)
                  </FieldLabel>
                  <Input
                    id="faq-question-en"
                    aria-invalid={
                      validationError?.field === "questionEn" || undefined
                    }
                    aria-describedby={
                      validationError?.field === "questionEn"
                        ? "faq-question-en-error"
                        : undefined
                    }
                    value={draft.questionEn}
                    onChange={(event) => {
                      setDraft({ ...draft, questionEn: event.target.value });
                      setValidationError(null);
                      setFormError(null);
                    }}
                    required
                  />
                  {validationError?.field === "questionEn" ? (
                    <p id="faq-question-en-error" className="text-danger">
                      {validationError.message}
                    </p>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="faq-question-id">
                    Question (Indonesian, optional)
                  </FieldLabel>
                  <Input
                    id="faq-question-id"
                    value={draft.questionId}
                    onChange={(event) =>
                      setDraft({ ...draft, questionId: event.target.value })
                    }
                  />
                </Field>
                <BlocksField
                  label="Answer (English)"
                  blocks={draft.answerEn}
                  onChange={(answerEn) => {
                    setDraft({ ...draft, answerEn });
                    setValidationError(null);
                    setFormError(null);
                  }}
                  error={
                    validationError?.field === "answerEn"
                      ? validationError.message
                      : undefined
                  }
                  errorId="faq-answer-en-error"
                  invalid={validationError?.field === "answerEn"}
                />
                <BlocksField
                  label="Answer (Indonesian, optional)"
                  blocks={draft.answerId}
                  onChange={(answerId) => {
                    setDraft({ ...draft, answerId });
                    setFormError(null);
                  }}
                />
                <Stack
                  direction="row"
                  spacing="lg"
                  className="flex-wrap items-end"
                >
                  <Field className="w-40">
                    <FieldLabel htmlFor="faq-sort-order">Sort order</FieldLabel>
                    <Input
                      id="faq-sort-order"
                      type="number"
                      min={0}
                      step={1}
                      aria-invalid={
                        validationError?.field === "sortOrder" || undefined
                      }
                      aria-describedby={
                        validationError?.field === "sortOrder"
                          ? "faq-sort-order-error"
                          : undefined
                      }
                      value={draft.sortOrder}
                      onChange={(event) => {
                        setDraft({ ...draft, sortOrder: event.target.value });
                        setValidationError(null);
                        setFormError(null);
                      }}
                    />
                    {validationError?.field === "sortOrder" ? (
                      <p id="faq-sort-order-error" className="text-danger">
                        {validationError.message}
                      </p>
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel className="gap-2">
                      <Checkbox
                        checked={draft.isActive}
                        onCheckedChange={(checked) =>
                          setDraft({ ...draft, isActive: checked === true })
                        }
                      />
                      Active
                    </FieldLabel>
                  </Field>
                  <Field>
                    <FieldLabel className="gap-2">
                      <Checkbox
                        checked={draft.showOnLanding}
                        onCheckedChange={(checked) =>
                          setDraft({
                            ...draft,
                            showOnLanding: checked === true,
                          })
                        }
                      />
                      Show on landing page
                    </FieldLabel>
                  </Field>
                </Stack>
                {formError && (
                  <p className="text-danger" role="alert">
                    {formError}
                  </p>
                )}
                <Stack direction="row" spacing="sm" className="justify-end">
                  <Button
                    type="button"
                    variant="plain"
                    onClick={() => {
                      setDraft(null);
                      setEditingEntry(null);
                      setFormError(null);
                      setValidationError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={saveEntry}
                    disabled={saveMutation.isPending}
                    progress={saveMutation.isPending}
                  >
                    <IconDeviceFloppy aria-hidden="true" />
                    Save FAQ
                  </Button>
                </Stack>
              </Stack>
            </CardBody>
          </Card>
        )}
      </Stack>
    </main>
  );
}
