"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectList,
  SelectItem,
} from "@cogito-app/ui/components/selia/select";
import { FaqRichTextEditor } from "./faq-rich-text-editor";
import type { FaqRichTextDocument } from "@cogito-app/api/modules/faq/faq.types";
import { orpc } from "@/utils/orpc";
const emptyBody: FaqRichTextDocument = {
  type: "doc",
  blocks: [{ type: "paragraph", content: [{ text: "" }] }],
};
const empty = {
  titleEn: "",
  titleId: "",
  descriptionEn: "",
  descriptionId: "",
  coverUrl: "",
  location: "",
  startAt: "",
  endAt: "",
  state: "draft" as "draft" | "published" | "cancelled" | "postponed",
  bodyEn: emptyBody,
  bodyId: null as FaqRichTextDocument | null,
};
export function ActivitiesPage() {
  const qc = useQueryClient();
  const list = useQuery(orpc.adminActivities.list.queryOptions());
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<{
    id: string;
    version: number;
  } | null>(null);
  const save = useMutation(
    orpc.adminActivities.save.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: orpc.adminActivities.list.key() });
        setEditing(null);
        setForm(empty);
      },
    }),
  );
  const remove = useMutation(
    orpc.adminActivities.remove.mutationOptions({
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: orpc.adminActivities.list.key() }),
    }),
  );
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold">Activities · Others</h1>
        <p className="text-muted">
          Write community articles for the main website. Add registration links
          inside the article.
        </p>
      </header>
      <section className="divide-y divide-border">
        {list.isError ? <p role="alert">Could not load activities.</p> : null}
        {list.data?.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 py-4"
          >
            <div>
              <h2 className="font-semibold">{row.titleEn}</h2>
              <p className="text-sm text-muted">
                {row.state} · {new Date(row.startAt).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing({ id: row.id, version: row.version });
                  setForm({
                    ...row,
                    titleId: row.titleId ?? "",
                    descriptionId: row.descriptionId ?? "",
                    state: row.state as typeof empty.state,
                    startAt: new Intl.DateTimeFormat("sv-SE", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "Asia/Jakarta",
                    })
                      .format(new Date(row.startAt))
                      .replace(" ", "T"),
                    endAt: new Intl.DateTimeFormat("sv-SE", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "Asia/Jakarta",
                    })
                      .format(new Date(row.endAt))
                      .replace(" ", "T"),
                  });
                }}
              >
                Edit
              </Button>
              <Button
                variant="danger"
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm(`Delete ${row.titleEn}?`))
                    remove.mutate({ id: row.id, expectedVersion: row.version });
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </section>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({
            ...form,
            ...(editing
              ? { id: editing.id, expectedVersion: editing.version }
              : {}),
            titleId: form.titleId.trim() || null,
            descriptionId: form.descriptionId.trim() || null,
            startAt: new Date(form.startAt + "+07:00").toISOString(),
            endAt: new Date(form.endAt + "+07:00").toISOString(),
          });
        }}
      >
        <h2 className="text-lg font-semibold">
          {editing ? "Edit article" : "New article"}
        </h2>
        <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="min-w-0 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {(
                [
                  "titleEn",
                  "titleId",
                  "descriptionEn",
                  "descriptionId",
                  "coverUrl",
                  "location",
                  "startAt",
                  "endAt",
                ] as const
              ).map((key) => (
                <Field key={key}>
                  <FieldLabel htmlFor={"activity-" + key}>
                    {
                      {
                        titleEn: "Title (English)",
                        titleId: "Title (Indonesian, optional)",
                        descriptionEn: "Short description (English)",
                        descriptionId:
                          "Short description (Indonesian, optional)",
                        coverUrl: "Cover image URL",
                        location: "Location / online link",
                        startAt: "Starts at (WIB)",
                        endAt: "Ends at (WIB)",
                      }[key]
                    }
                  </FieldLabel>
                  <Input
                    id={"activity-" + key}
                    type={
                      key.endsWith("At")
                        ? "datetime-local"
                        : key === "coverUrl"
                          ? "url"
                          : "text"
                    }
                    required={!key.endsWith("Id")}
                    value={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                  />
                </Field>
              ))}
            </div>
            <Field>
              <FieldLabel>Publication</FieldLabel>
              <Select
                value={form.state}
                onValueChange={(value) => {
                  if (value)
                    setForm({ ...form, state: value as typeof form.state });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  <SelectList>
                    {["draft", "published", "cancelled", "postponed"].map(
                      (state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ),
                    )}
                  </SelectList>
                </SelectPopup>
              </Select>
            </Field>
          </div>
          <div className="min-w-0 space-y-5 lg:[&_.tiptap]:min-h-80">
            <FaqRichTextEditor
              id="article-en"
              label="Article (English)"
              value={form.bodyEn}
              onChange={(bodyEn) => setForm({ ...form, bodyEn })}
              description="Paragraphs, lists and links. Put registration links here."
            />
            <Button
              type="button"
              variant="plain"
              onClick={() =>
                setForm({ ...form, bodyId: form.bodyId ? null : emptyBody })
              }
            >
              {form.bodyId
                ? "Remove Indonesian article"
                : "Add Indonesian article"}
            </Button>
            {form.bodyId ? (
              <FaqRichTextEditor
                id="article-id"
                label="Article (Indonesian)"
                value={form.bodyId}
                onChange={(bodyId) => setForm({ ...form, bodyId })}
                description="Optional; falls back to English."
              />
            ) : null}
          </div>
        </div>
        {save.error || remove.error ? (
          <p role="alert" className="text-danger">
            {(save.error || remove.error)?.message}
          </p>
        ) : null}
        <div className="flex gap-3">
          <Button disabled={save.isPending} type="submit">
            Save article
          </Button>
          <Button
            type="button"
            variant="plain"
            onClick={() => {
              setEditing(null);
              setForm(empty);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
