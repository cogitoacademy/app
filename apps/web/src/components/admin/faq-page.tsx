"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconDeviceFloppy, IconEdit, IconPlus } from "@tabler/icons-react";

import type {
  AdminFaqDto,
  CreateFaqInput,
  FaqRichTextDocument,
} from "@cogito-app/api/modules/faq/faq.types";
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
import {
  Item,
  ItemAction,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { FaqRichTextEditor } from "@/components/admin/faq-rich-text-editor";
import {
  faqRichTextToPlainText,
  normalizeFaqRichTextDocument,
} from "@/lib/faq-rich-text";
import { getUserFacingError } from "@/lib/error-message";
import { client } from "@/utils/orpc";

const FAQ_LIST_KEY = ["adminFaq", "list"] as const;
const MAX_LANDING_FAQS = 6;

type FaqEntry = AdminFaqDto;
type FaqPayload = CreateFaqInput;
type FaqDraft = {
  questionEnRich: FaqRichTextDocument;
  questionIdRich: FaqRichTextDocument;
  answerEnRich: FaqRichTextDocument;
  answerIdRich: FaqRichTextDocument;
  isActive: boolean;
  showOnLanding: boolean;
  showIndonesian: boolean;
};
type FaqValidationError = {
  field: "questionEnRich" | "answerEnRich";
  message: string;
};

function emptyRichDocument(): FaqRichTextDocument {
  return { type: "doc", blocks: [{ type: "paragraph", content: [] }] };
}

function emptyDraft(): FaqDraft {
  return {
    questionEnRich: emptyRichDocument(),
    questionIdRich: emptyRichDocument(),
    answerEnRich: emptyRichDocument(),
    answerIdRich: emptyRichDocument(),
    isActive: true,
    showOnLanding: false,
    showIndonesian: false,
  };
}

function draftFromEntry(entry: FaqEntry): FaqDraft {
  const questionEnRich = normalizeFaqRichTextDocument(
    entry.questionEnRich,
    entry.questionEn,
  );
  const questionIdRich = normalizeFaqRichTextDocument(
    entry.questionIdRich,
    entry.questionId ?? "",
  );
  const answerEnRich = normalizeFaqRichTextDocument(
    entry.answerEnRich,
    entry.answerEn
      .map((block) =>
        block.type === "paragraph" ? block.text : block.items.join("\n"),
      )
      .join("\n\n"),
  );
  const answerIdRich = normalizeFaqRichTextDocument(
    entry.answerIdRich,
    entry.answerId
      ?.map((block) =>
        block.type === "paragraph" ? block.text : block.items.join("\n"),
      )
      .join("\n\n") ?? "",
  );
  return {
    questionEnRich,
    questionIdRich,
    answerEnRich,
    answerIdRich,
    isActive: entry.isActive,
    showOnLanding: entry.showOnLanding,
    showIndonesian: hasText(questionIdRich) || hasText(answerIdRich),
  };
}

function hasText(document: FaqRichTextDocument) {
  return faqRichTextToPlainText(document).length > 0;
}

function formatModifiedDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    date,
  );
}

export function FaqPage() {
  const queryClient = useQueryClient();
  const [editingEntry, setEditingEntry] = useState<FaqEntry | null>(null);
  const [draft, setDraft] = useState<FaqDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [validationError, setValidationError] =
    useState<FaqValidationError | null>(null);
  const listQuery = useQuery({
    queryKey: FAQ_LIST_KEY,
    queryFn: () => client.adminFaq.list({}),
  });
  const entries = listQuery.data ?? [];
  const otherLandingCount = entries.filter(
    (entry) =>
      entry.isActive && entry.showOnLanding && entry.id !== editingEntry?.id,
  ).length;
  const landingCount = draft
    ? otherLandingCount + Number(draft.isActive && draft.showOnLanding)
    : entries.filter((entry) => entry.isActive && entry.showOnLanding).length;

  useEffect(() => {
    if (!validationError) return;
    const editorId =
      validationError.field === "questionEnRich"
        ? "faq-question-en-rich"
        : "faq-answer-en-rich";
    document
      .querySelector<HTMLElement>(`[data-faq-editor="${editorId}"]`)
      ?.focus();
  }, [validationError]);

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

  function updateDraft(update: Partial<FaqDraft>) {
    setDraft((current) => (current ? { ...current, ...update } : current));
    setFormError(null);
    setValidationError(null);
  }

  function saveEntry() {
    if (!draft) return;
    const questionLength = faqRichTextToPlainText(draft.questionEnRich).length;
    if (questionLength === 0) {
      setFormError(null);
      setValidationError({
        field: "questionEnRich",
        message: "Enter an English question.",
      });
      return;
    }
    if (questionLength > 500) {
      setFormError(null);
      setValidationError({
        field: "questionEnRich",
        message: "Question must be 500 characters or fewer.",
      });
      return;
    }
    if (!hasText(draft.answerEnRich)) {
      setFormError(null);
      setValidationError({
        field: "answerEnRich",
        message: "Add English answer content before saving.",
      });
      return;
    }

    setValidationError(null);
    setFormError(null);
    saveMutation.mutate({
      questionEnRich: draft.questionEnRich,
      questionIdRich: hasText(draft.questionIdRich)
        ? draft.questionIdRich
        : null,
      answerEnRich: draft.answerEnRich,
      answerIdRich: hasText(draft.answerIdRich) ? draft.answerIdRich : null,
      isActive: draft.isActive,
      showOnLanding: draft.isActive && draft.showOnLanding,
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
              Write questions and answers in English. Add an Indonesian version
              when needed, then choose up to six for the landing page.
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
              Listed alphabetically by English question. The date on each row is
              its last modified date.
            </CardDescription>
            <Badge
              variant={landingCount === MAX_LANDING_FAQS ? "warning" : "info"}
            >
              Landing FAQs: {landingCount}/{MAX_LANDING_FAQS}
            </Badge>
          </CardHeader>
          <CardBody>
            {listQuery.isPending ? (
              <p className="text-muted">Loading FAQ entries…</p>
            ) : listQuery.isError ? (
              <p className="text-danger">
                {getUserFacingError(listQuery.error)}
              </p>
            ) : entries.length === 0 ? (
              <p className="text-muted">
                No FAQ entries yet. Add the first one.
              </p>
            ) : (
              <div>
                <Stack>
                  {entries.map((entry, index) => (
                    <Item
                      key={entry.id}
                      variant="outline"
                      direction="row"
                      className="items-center"
                    >
                      <ItemMedia className="w-8 text-right text-sm text-muted">
                        #{index + 1}
                      </ItemMedia>
                      <ItemContent className="min-w-0 flex-1">
                        <ItemTitle className="max-w-full truncate">
                          {entry.questionEn}
                        </ItemTitle>
                        <ItemDescription>
                          Updated {formatModifiedDate(entry.modifiedAt)} ·
                          Version {entry.version}
                        </ItemDescription>
                      </ItemContent>
                      <ItemAction className="flex-wrap justify-end">
                        <Badge
                          variant={entry.isActive ? "success" : "secondary"}
                        >
                          {entry.isActive ? "Active" : "Inactive"}
                        </Badge>
                        {entry.isActive && entry.showOnLanding ? (
                          <Badge variant="info">Landing</Badge>
                        ) : null}
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
              </div>
            )}
          </CardBody>
        </Card>

        {draft ? (
          <Card>
            <CardHeader>
              <CardTitle>{editingEntry ? "Edit FAQ" : "Add FAQ"}</CardTitle>
              <CardDescription>
                Use bold, italic, links, and lists. English is required; blank
                Indonesian fields use the English version.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <div>
                <Stack spacing="lg">
                  <FaqRichTextEditor
                    id="faq-question-en-rich"
                    label="Question (English)"
                    description="Write the English question. Keep it under 500 characters."
                    value={draft.questionEnRich}
                    onChange={(questionEnRich) =>
                      updateDraft({ questionEnRich })
                    }
                    error={
                      validationError?.field === "questionEnRich"
                        ? validationError.message
                        : undefined
                    }
                    invalid={validationError?.field === "questionEnRich"}
                  />
                  <FaqRichTextEditor
                    id="faq-answer-en-rich"
                    label="Answer (English)"
                    description="Add paragraphs or lists, and link text where useful."
                    value={draft.answerEnRich}
                    onChange={(answerEnRich) => updateDraft({ answerEnRich })}
                    error={
                      validationError?.field === "answerEnRich"
                        ? validationError.message
                        : undefined
                    }
                    invalid={validationError?.field === "answerEnRich"}
                  />
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      aria-expanded={draft.showIndonesian}
                      aria-controls="faq-indonesian-fields"
                      onClick={() =>
                        updateDraft({ showIndonesian: !draft.showIndonesian })
                      }
                    >
                      {draft.showIndonesian
                        ? "Hide Indonesian fields"
                        : "Add Indonesian version"}
                    </Button>
                    <div
                      id="faq-indonesian-fields"
                      hidden={!draft.showIndonesian}
                    >
                      {draft.showIndonesian ? (
                        <Stack spacing="lg" className="mt-6">
                          <FaqRichTextEditor
                            id="faq-question-id-rich"
                            label="Question (Indonesian)"
                            description="Leave blank to use the English question."
                            value={draft.questionIdRich}
                            onChange={(questionIdRich) =>
                              updateDraft({ questionIdRich })
                            }
                          />
                          <FaqRichTextEditor
                            id="faq-answer-id-rich"
                            label="Answer (Indonesian)"
                            description="Leave blank to use the English answer."
                            value={draft.answerIdRich}
                            onChange={(answerIdRich) =>
                              updateDraft({ answerIdRich })
                            }
                          />
                        </Stack>
                      ) : null}
                    </div>
                  </div>

                  <Stack
                    direction="row"
                    spacing="lg"
                    className="flex-wrap items-start"
                  >
                    <Field>
                      <FieldLabel className="gap-2">
                        <Checkbox
                          checked={draft.isActive}
                          onCheckedChange={(checked) =>
                            updateDraft({
                              isActive: checked === true,
                              ...(checked === true
                                ? {}
                                : { showOnLanding: false }),
                            })
                          }
                        />
                        Active
                      </FieldLabel>
                      <FieldDescription>
                        Inactive entries are hidden from public FAQ pages.
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel className="gap-2">
                        <Checkbox
                          checked={draft.showOnLanding}
                          disabled={
                            !draft.isActive ||
                            (!draft.showOnLanding &&
                              otherLandingCount >= MAX_LANDING_FAQS)
                          }
                          onCheckedChange={(checked) =>
                            updateDraft({ showOnLanding: checked === true })
                          }
                        />
                        Show on landing page
                      </FieldLabel>
                      <FieldDescription>
                        {!draft.isActive
                          ? "Activate this FAQ before selecting it."
                          : otherLandingCount >= MAX_LANDING_FAQS &&
                              !draft.showOnLanding
                            ? "Six active FAQs are already selected. Remove one first."
                            : "Select up to six active FAQs for the landing section."}
                      </FieldDescription>
                    </Field>
                  </Stack>
                  {formError ? (
                    <p className="text-danger" role="alert">
                      {formError}
                    </p>
                  ) : null}
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
              </div>
            </CardBody>
          </Card>
        ) : null}
      </Stack>
    </main>
  );
}
