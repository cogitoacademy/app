"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Input } from "@cogito-app/ui/components/selia/input";
import { DatePicker } from "@cogito-app/ui/components/selia/date-picker";
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
import { MinuteTimeInput } from "@/components/booking/minute-time-input";
import { formatPublicationState } from "./activity-form-utils";
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
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.7fr)]">
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Articles</h2>
            <Button
              onClick={() => {
                setEditing(null);
                setForm(empty);
              }}
            >
              New article
            </Button>
          </div>
          {list.isPending ? (
            <p className="text-muted">Loading activities…</p>
          ) : list.isError ? (
            <p role="alert">Could not load activities.</p>
          ) : list.data.length === 0 ? (
            <p className="text-muted">No activities yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {list.data.map((row) => (
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
                          remove.mutate({
                            id: row.id,
                            expectedVersion: row.version,
                          });
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{editing ? "Edit article" : "New article"}</CardTitle>
          </CardHeader>
          <CardBody>
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate({
                  titleEn: form.titleEn,
                  titleId: null,
                  descriptionEn: form.descriptionEn,
                  descriptionId: null,
                  coverUrl: form.coverUrl,
                  location: form.location,
                  startAt: new Date(form.startAt + "+07:00").toISOString(),
                  endAt: new Date(form.endAt + "+07:00").toISOString(),
                  bodyEn: form.bodyEn,
                  bodyId: null,
                  state: form.state,
                  ...(editing
                    ? { id: editing.id, expectedVersion: editing.version }
                    : {}),
                });
              }}
            >
              <div className="flex min-w-0 flex-col gap-8">
                <div className="min-w-0 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {(
                      [
                        "titleEn",
                        "descriptionEn",
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
                              titleEn: "Title",
                              descriptionEn: "Short description",
                              coverUrl: "Cover image URL",
                              location: "Location / online link",
                              startAt: "Starts at (WIB)",
                              endAt: "Ends at (WIB)",
                            }[key]
                          }
                        </FieldLabel>
                        {key.endsWith("At") ? (
                          <div className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-2">
                            <DatePicker
                              id={"activity-" + key}
                              value={form[key].split("T")[0]}
                              onChange={(date) => {
                                const time = form[key].split("T")[1] || "09:00";
                                setForm({
                                  ...form,
                                  [key]: date ? `${date}T${time}` : "",
                                });
                              }}
                              placeholder="Pick a date"
                              required
                            />
                            <MinuteTimeInput
                              ariaLabel={
                                key === "startAt"
                                  ? "Start time (WIB)"
                                  : "End time (WIB)"
                              }
                              showIcon={false}
                              required
                              value={form[key].split("T")[1] ?? ""}
                              onChange={(time) => {
                                const date = form[key].split("T")[0];
                                setForm({
                                  ...form,
                                  [key]: date ? `${date}T${time}` : `T${time}`,
                                });
                              }}
                            />
                          </div>
                        ) : (
                          <Input
                            id={"activity-" + key}
                            type={key === "coverUrl" ? "url" : "text"}
                            required={!key.endsWith("Id")}
                            value={form[key]}
                            onChange={(e) =>
                              setForm({ ...form, [key]: e.target.value })
                            }
                          />
                        )}
                      </Field>
                    ))}
                  </div>
                  <Field>
                    <FieldLabel>Publication</FieldLabel>
                    <Select
                      value={form.state}
                      onValueChange={(value) => {
                        if (value)
                          setForm({
                            ...form,
                            state: value as typeof form.state,
                          });
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
                                {formatPublicationState(state)}
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
                    id="article"
                    label="Article"
                    value={form.bodyEn}
                    onChange={(bodyEn) => setForm({ ...form, bodyEn })}
                    description="Paragraphs, lists and links. Put registration links here."
                  />
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
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
