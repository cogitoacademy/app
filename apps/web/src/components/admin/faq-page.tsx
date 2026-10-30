"use client";

import { Text } from "@cogito-app/ui/components/selia/text";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconDeviceFloppy,
  IconEdit,
  IconPlus,
  IconX,
} from "@tabler/icons-react";

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
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { useBlocker } from "@tanstack/react-router";
import { FaqAnswer } from "./faq-read-only-page";
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionPanel,
} from "@cogito-app/ui/components/selia/accordion";
import {
  Drawer,
  DrawerPopup,
  DrawerTitle,
  DrawerBody,
  DrawerHeader,
} from "@cogito-app/ui/components/selia/drawer";
import {
  Dialog,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
} from "@cogito-app/ui/components/selia/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectList,
  SelectItem,
} from "@cogito-app/ui/components/selia/select";
import { Heading } from "@cogito-app/ui/components/selia/heading";
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
  const [filter, setFilter] = useState("all");
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia("(min-width: 1024px)").matches,
  );
  const [initialDraft, setInitialDraft] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const editButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
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
  const isEditorOpen = draft !== null;
  const isDirty = draft !== null && JSON.stringify(draft) !== initialDraft;
  const blocker = useBlocker({
    shouldBlockFn: () => isDirty || saveMutation.isPending,
    enableBeforeUnload: isDirty,
    withResolver: true,
  });
  const visibleEntries = entries.filter(
    (entry) =>
      filter === "all" ||
      (filter === "active" ? entry.isActive : !entry.isActive),
  );
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: FAQ_LIST_KEY }),
        queryClient.invalidateQueries({ queryKey: ["publicContent", "faq"] }),
      ]);
      toastManager.add({ title: "FAQ saved", type: "success" });
      setDraft(null);
      setEditingEntry(null);
      setFormError(null);
      setValidationError(null);
      editButton.current?.focus();
    },
    onError: async (error) => {
      setFormError(getUserFacingError(error));
      setValidationError(null);
      await queryClient.invalidateQueries({ queryKey: FAQ_LIST_KEY });
    },
  });

  useEffect(() => {
    if (isEditorOpen && isDesktop && initialDraft)
      document
        .querySelector<HTMLElement>('[data-faq-editor="faq-question-en-rich"]')
        ?.focus();
  }, [isEditorOpen, isDesktop, initialDraft]);

  function requestAction(action: () => void) {
    if (saveMutation.isPending) return;
    if (isDirty) setPendingAction(() => action);
    else action();
  }

  function closeEditor() {
    requestAction(() => {
      setDraft(null);
      setEditingEntry(null);
      editButton.current?.focus();
    });
  }

  function openNewEntry() {
    setEditingEntry(null);
    const next = emptyDraft();
    setDraft(next);
    setInitialDraft(JSON.stringify(next));
    setFormError(null);
    setValidationError(null);
  }

  function openEntry(entry: FaqEntry) {
    setEditingEntry(entry);
    const next = draftFromEntry(entry);
    setDraft(next);
    setInitialDraft(JSON.stringify(next));
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

  const editorBody = draft ? (
    <fieldset disabled={saveMutation.isPending} className="min-w-0">
      <Stack spacing="lg">
        <FaqRichTextEditor
          id="faq-question-en-rich"
          label="Question (English)"
          description="Write the English question. Keep it under 500 characters."
          value={draft.questionEnRich}
          onChange={(questionEnRich) => updateDraft({ questionEnRich })}
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
          <div id="faq-indonesian-fields" hidden={!draft.showIndonesian}>
            {draft.showIndonesian ? (
              <Stack spacing="lg" className="mt-6">
                <FaqRichTextEditor
                  id="faq-question-id-rich"
                  label="Question (Indonesian)"
                  description="Leave blank to use the English question."
                  value={draft.questionIdRich}
                  onChange={(questionIdRich) => updateDraft({ questionIdRich })}
                />
                <FaqRichTextEditor
                  id="faq-answer-id-rich"
                  label="Answer (Indonesian)"
                  description="Leave blank to use the English answer."
                  value={draft.answerIdRich}
                  onChange={(answerIdRich) => updateDraft({ answerIdRich })}
                />
              </Stack>
            ) : null}
          </div>
        </div>

        <Stack direction="row" spacing="lg" className="flex-wrap items-start">
          <Field>
            <FieldLabel className="gap-2">
              <Checkbox
                checked={draft.isActive}
                onCheckedChange={(checked) =>
                  updateDraft({
                    isActive: checked === true,
                    ...(checked === true ? {} : { showOnLanding: false }),
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
                : otherLandingCount >= MAX_LANDING_FAQS && !draft.showOnLanding
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
      </Stack>
    </fieldset>
  ) : null;
  const editorActions = draft ? (
    <Stack direction="row" spacing="sm" className="justify-end">
      <Button type="button" variant="plain" onClick={closeEditor}>
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
  ) : null;
  const title = editingEntry ? "Edit FAQ" : "Add FAQ";
  return (
    <main className="w-full min-w-0 max-w-full">
      <Stack spacing="md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Heading level={1} size="md">
              FAQ
            </Heading>
            <Text className="max-w-full text-muted">
              Answers to common questions about Cogito Academy.
            </Text>
          </div>
          <Button
            disabled={saveMutation.isPending}
            onClick={(event) => {
              editButton.current = event.currentTarget;
              requestAction(openNewEntry);
            }}
          >
            <IconPlus aria-hidden="true" />
            Add FAQ
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Select
            value={filter}
            onValueChange={(value) =>
              setFilter(typeof value === "string" ? value : "all")
            }
          >
            <SelectTrigger aria-label="Filter FAQs" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectList>
                <SelectItem value="all">All FAQs</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectList>
            </SelectPopup>
          </Select>
          <Badge
            variant={landingCount === MAX_LANDING_FAQS ? "warning" : "info"}
          >
            Landing FAQs: {landingCount}/{MAX_LANDING_FAQS}
          </Badge>
        </div>
        <div
          className={
            draft && isDesktop
              ? "grid min-w-0 grid-cols-2 items-start gap-6"
              : "min-w-0"
          }
        >
          <div className="min-w-0">
            {listQuery.isPending ? (
              <p className="text-muted">Loading FAQs…</p>
            ) : listQuery.isError ? (
              <p role="alert" className="text-danger">
                {getUserFacingError(listQuery.error)}
              </p>
            ) : visibleEntries.length === 0 ? (
              <p className="text-muted">No FAQs match this filter.</p>
            ) : (
              <Accordion className="gap-3">
                {visibleEntries.map((entry) => (
                  <AccordionItem
                    key={entry.id}
                    value={entry.id}
                    className={`group rounded-3xl border last:border-b bg-accent data-[open]:bg-card ${editingEntry?.id === entry.id && draft ? "border-primary" : "border-transparent data-[open]:border-card-border"}`}
                  >
                    <div className="relative">
                      <AccordionHeader>
                        <AccordionTrigger
                          expandableIndicator={false}
                          className="gap-4 rounded-3xl py-2 pl-5 pr-2"
                        >
                          <span className="min-w-0 flex-1 break-words py-2 pr-10">
                            {entry.questionEn}
                          </span>
                          <span
                            aria-hidden="true"
                            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card group-data-[open]:bg-accent"
                          >
                            <IconPlus className="size-4 transition-transform duration-250 group-data-[open]:rotate-45 motion-reduce:transition-none" />
                          </span>
                        </AccordionTrigger>
                      </AccordionHeader>
                      <Button
                        className="absolute right-15 top-1/2 -translate-y-1/2"
                        variant="plain"
                        size="sm-icon"
                        aria-label={`Edit ${entry.questionEn}`}
                        disabled={saveMutation.isPending}
                        onClick={(event) => {
                          editButton.current = event.currentTarget;
                          requestAction(() => openEntry(entry));
                        }}
                      >
                        <IconEdit aria-hidden="true" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
                      <Badge variant={entry.isActive ? "success" : "secondary"}>
                        {entry.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {entry.showOnLanding && entry.isActive ? (
                        <Badge variant="info">Landing</Badge>
                      ) : null}
                      <span className="text-sm text-muted">
                        Updated {formatModifiedDate(entry.modifiedAt)}
                      </span>
                    </div>
                    <AccordionPanel className="transition-[height] duration-250 ease-in-out motion-reduce:transition-none">
                      <div className="px-5 pb-3">
                        <FaqAnswer blocks={entry.answerEn} />
                      </div>
                    </AccordionPanel>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
          {draft && isDesktop ? (
            <Card
              key={editingEntry?.id ?? "new"}
              className="sticky top-4 flex max-h-[calc(100dvh-8rem)] min-w-0 flex-col"
              role="region"
              aria-label={title}
            >
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                <Button
                  variant="plain"
                  size="sm-icon"
                  aria-label="Close editor"
                  disabled={saveMutation.isPending}
                  onClick={closeEditor}
                >
                  <IconX aria-hidden="true" />
                </Button>
              </CardHeader>
              <CardBody className="min-h-0 overflow-y-auto">
                {editorBody}
              </CardBody>
              <div className="shrink-0 border-t border-card-border p-4">
                {editorActions}
              </div>
            </Card>
          ) : null}
        </div>
      </Stack>
      <Drawer
        open={!!draft && !isDesktop}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
        swipeDirection="right"
      >
        <DrawerPopup
          className="z-[800] max-w-full motion-reduce:transition-none"
          aria-describedby={undefined}
        >
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <Button
              variant="plain"
              size="sm-icon"
              className="ml-auto"
              aria-label="Close editor"
              disabled={saveMutation.isPending}
              onClick={closeEditor}
            >
              <IconX aria-hidden="true" />
            </Button>
          </DrawerHeader>
          <DrawerBody key={editingEntry?.id ?? "new"}>{editorBody}</DrawerBody>
          <div className="shrink-0 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {editorActions}
          </div>
        </DrawerPopup>
      </Drawer>
      <Dialog
        open={!!pendingAction || blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null);
            blocker.reset?.();
          }
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <div>
              <DialogTitle>Discard unsaved changes?</DialogTitle>
              <DialogDescription>
                Your changes will be lost if you continue.
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="plain"
              onClick={() => {
                setPendingAction(null);
                blocker.reset?.();
              }}
            >
              Keep editing
            </Button>
            <Button
              variant="danger"
              disabled={saveMutation.isPending}
              onClick={() => {
                const action = pendingAction;
                setPendingAction(null);
                if (blocker.status === "blocked") blocker.proceed();
                else action?.();
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </main>
  );
}
