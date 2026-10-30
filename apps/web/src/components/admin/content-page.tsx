"use client";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text } from "@cogito-app/ui/components/selia/text";
import {
  resourceFields,
  eventFields,
  type ContentEntry,
  type ContentKind,
} from "@cogito-app/api/modules/content-admin/content-admin.types";
import { client, orpc } from "@/utils/orpc";
import { getUserFacingError } from "@/lib/error-message";

type Row = {
  id: string;
  sourceId: string | null;
  title: string;
  version: number;
  isActive: boolean;
  [key: string]: unknown;
};
type Draft = { [key: string]: string };
const defaults = (): Draft => ({
  title: "",
  description: "",
  category: "",
  fileId: "",
  location: "",
  startDate: "",
  endDate: "",
  educationLevels: "",
  scale: "",
  organizer: "",
  registrationDeadline: "",
  registrationLink: "",
  socialMediaLink: "",
  sortOrder: "0",
});
export function ContentPage({
  kind,
  preview,
}: {
  kind: ContentKind;
  preview: (onManage: () => void) => ReactNode;
}) {
  const queryClient = useQueryClient();
  const [previewing, setPreviewing] = useState(true);
  const pageTitle =
    kind === "resource"
      ? "Curate Learning Resources"
      : "Publish Competition Opportunities";
  const pageDescription =
    kind === "resource"
      ? "Add and update materials in their original language; saved resources appear in the student library."
      : "Add and update event details and dates; saved changes appear in the competition calendar.";
  const [editing, setEditing] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [active, setActive] = useState(true);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const entries = useQuery({
    enabled: !previewing,
    queryKey: ["adminContent", kind],
    queryFn: () => client.adminContent.list({ kind }),
    retry: false,
  });
  const categories = useQuery({
    enabled: !previewing && kind === "event",
    queryKey: ["adminContent", "categories"],
    queryFn: () => client.adminContent.categories(),
    retry: false,
  });
  function open(row: Row | null) {
    const next = defaults();
    if (row)
      for (const key of Object.keys(next))
        next[key] =
          key === "educationLevels"
            ? ((row[key] as string[] | undefined) ?? []).join(", ")
            : String(row[key] ?? "");
    setEditing(row);
    setDraft(next);
    setActive(row?.isActive ?? true);
    setCategoryIds((row?.categoryIds as string[]) ?? []);
    setReason("");
    setError("");
    setMessage("");
  }
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const common = {
        title: draft.title,
        description: draft.description || null,
        isActive: active,
        sortOrder: Number(draft.sortOrder),
      };
      const entry: ContentEntry =
        kind === "resource"
          ? {
              kind,
              values: resourceFields.parse({
                ...common,
                category: draft.category,
                fileId: draft.fileId,
              }),
            }
          : {
              kind,
              values: eventFields.parse({
                ...common,
                location: draft.location || null,
                startDate: draft.startDate,
                endDate: draft.endDate,
                categoryIds,
                educationLevels: draft
                  .educationLevels!.split(",")
                  .map((v) => v.trim())
                  .filter(Boolean),
                scale: draft.scale || null,
                organizer: draft.organizer || null,
                registrationDeadline: draft.registrationDeadline || null,
                registrationLink: draft.registrationLink || null,
                socialMediaLink: draft.socialMediaLink || null,
              }),
            };
      if (reason.trim().length < 3)
        throw new Error("Enter a reason of at least 3 characters");
      if (editing)
        await client.adminContent.update({
          entry,
          id: editing.id,
          expectedVersion: editing.version,
          reason,
        });
      else await client.adminContent.create({ entry, reason });
      setDraft(null);
      setEditing(null);
      setMessage("Changes saved live.");
      await entries.refetch();
      await queryClient.invalidateQueries({
        queryKey:
          kind === "resource"
            ? orpc.content.listStudentResources.key()
            : orpc.content.listCompetitions.key(),
      });
    } catch (e) {
      setError(
        e instanceof Error && e.name === "ZodError"
          ? "Check the required fields, links and date range. Dates need an explicit timezone, for example 2026-11-01T09:00:00+07:00."
          : getUserFacingError(e),
      );
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file || !draft) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Upload a PDF of at most 5 MiB");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const result = await client.adminContent.uploadPdf({
        fileName: file.name,
        base64: btoa(binary),
      });
      setDraft({ ...draft, fileId: result.fileId });
      setMessage(`PDF ready: ${result.fileName}. Save changes to attach it.`);
    } catch (e) {
      setError(getUserFacingError(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !editing ||
      !window.confirm(`Delete “${editing.title}”? This cannot be undone.`)
    )
      return;
    setBusy(true);
    setError("");
    try {
      await client.adminContent.remove({
        kind,
        id: editing.id,
        expectedVersion: editing.version,
        reason,
      });
      setDraft(null);
      setEditing(null);
      await entries.refetch();
      await queryClient.invalidateQueries({
        queryKey:
          kind === "resource"
            ? orpc.content.listStudentResources.key()
            : orpc.content.listCompetitions.key(),
      });
      setMessage("Entry deleted.");
    } catch (e) {
      setError(getUserFacingError(e));
    } finally {
      setBusy(false);
    }
  }
  const field = (
    key: string,
    label: string,
    required = false,
    multiline = false,
  ) => (
    <Field key={key}>
      <FieldLabel htmlFor={`content-${key}`}>{label}</FieldLabel>
      {multiline ? (
        <Textarea
          id={`content-${key}`}
          value={draft?.[key] ?? ""}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      ) : (
        <Input
          id={`content-${key}`}
          required={required}
          type={key === "sortOrder" ? "number" : "text"}
          value={draft?.[key] ?? ""}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      )}
    </Field>
  );
  if (previewing)
    return (
      <Stack direction="column" spacing="lg" className="min-w-0">
        {preview(() => setPreviewing(false))}
      </Stack>
    );
  return (
    <Stack direction="column" spacing="lg" className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading level={1} size="md">
            {pageTitle}
          </Heading>
          <Text className="max-w-full text-muted">{pageDescription}</Text>
        </div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (
              draft &&
              !window.confirm(
                "Discard this unsaved draft and return to the page?",
              )
            )
              return;
            setDraft(null);
            setError("");
            setMessage("");
            setPreviewing(true);
          }}
        >
          {kind === "resource" ? "View resources" : "View calendar"}
        </Button>
      </div>
      {entries.isError ? (
        <Card>
          <CardBody>
            <Text role="alert">{getUserFacingError(entries.error)}</Text>
            <Button onClick={() => void entries.refetch()}>
              Reload entries
            </Button>
          </CardBody>
        </Card>
      ) : null}
      {error ? (
        <Text role="alert">
          {error} Your draft is retained. Reload entries, then reopen the entry
          to review its latest version.
        </Text>
      ) : null}
      {message ? <Text role="status">{message}</Text> : null}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              {kind === "resource" ? "Resources" : "Competitions"}
            </CardTitle>
          </CardHeader>
          <CardBody>
            <Stack direction="column">
              <Input
                aria-label="Search entries"
                placeholder="Search titles"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Stack>
                <Button
                  disabled={busy || entries.isError || entries.isPending}
                  onClick={() => open(null)}
                >
                  Create entry
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void entries.refetch()}
                >
                  Reload entries
                </Button>
              </Stack>
              {entries.isPending ? <Text>Loading entries…</Text> : null}
              {entries.data
                ?.filter((row) =>
                  row.title.toLowerCase().includes(search.toLowerCase()),
                )
                .map((row) => (
                  <Button
                    key={row.id}
                    variant="secondary"
                    disabled={busy}
                    className="h-auto min-h-10 justify-start whitespace-normal text-left"
                    onClick={() => open(row)}
                  >
                    {row.title} · {row.isActive ? "Active" : "Archived"} · v
                    {row.version}
                  </Button>
                ))}
              {entries.data?.length === 0 ? (
                <Text>No entries yet. Create the first entry.</Text>
              ) : null}
            </Stack>
          </CardBody>
        </Card>
        {draft ? (
          <Card>
            <CardHeader>
              <CardTitle>{editing ? "Edit entry" : "Create entry"}</CardTitle>
            </CardHeader>
            <CardBody>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <fieldset disabled={busy} className="space-y-4">
                  <Text className="text-muted">
                    One value per field, in any language.
                  </Text>
                  {field("title", "Title", true)}
                  {field("description", "Description", false, true)}
                  {kind === "resource" ? (
                    <>
                      {field("category", "Resource category", true)}
                      <Field>
                        <FieldLabel htmlFor="content-pdf">
                          Private PDF (up to 5 MiB)
                        </FieldLabel>
                        <Input
                          id="content-pdf"
                          type="file"
                          accept="application/pdf,.pdf"
                          onChange={(e) => void upload(e.target.files?.[0])}
                        />
                        <Text>
                          {draft.fileId
                            ? "A private PDF is attached."
                            : "Upload a PDF before saving."}
                        </Text>
                      </Field>
                    </>
                  ) : (
                    <>
                      {field("location", "Location")}
                      {field(
                        "startDate",
                        "Start (ISO timestamp with timezone)",
                        true,
                      )}
                      {field(
                        "endDate",
                        "End (ISO timestamp with timezone)",
                        true,
                      )}
                      <Text className="text-muted">
                        Example: 2026-11-01T09:00:00+07:00 (WIB). End calendar
                        date is included.
                      </Text>
                      <fieldset>
                        <legend>Competition types</legend>
                        {categories.data
                          ?.filter(
                            (c) =>
                              c.parentId === null &&
                              (c.isActive || categoryIds.includes(c.id)),
                          )
                          .map((c) => (
                            <label
                              key={c.id}
                              htmlFor={`content-category-${c.id}`}
                              className="flex items-center gap-2 py-1"
                            >
                              <Checkbox
                                id={`content-category-${c.id}`}
                                checked={categoryIds.includes(c.id)}
                                onCheckedChange={(checked) =>
                                  setCategoryIds(
                                    checked
                                      ? [...categoryIds, c.id]
                                      : categoryIds.filter((id) => id !== c.id),
                                  )
                                }
                              />
                              {c.name}
                              {!c.isActive ? " (archived)" : ""}
                            </label>
                          ))}
                      </fieldset>
                      {field(
                        "educationLevels",
                        "Education levels (comma separated)",
                      )}
                      {field("scale", "Scale")}
                      {field("organizer", "Organizer")}
                      {field(
                        "registrationDeadline",
                        "Registration deadline (ISO timestamp with timezone)",
                      )}
                      {field("registrationLink", "Registration link")}
                      {field("socialMediaLink", "Social media link")}
                    </>
                  )}
                  {field("sortOrder", "Order", true)}
                  <label
                    htmlFor="content-active"
                    className="flex items-center gap-2"
                  >
                    <Checkbox
                      id="content-active"
                      checked={active}
                      onCheckedChange={setActive}
                    />
                    Active
                  </label>
                  <Field>
                    <FieldLabel htmlFor="content-reason">
                      Reason for change
                    </FieldLabel>
                    <Input
                      id="content-reason"
                      required
                      minLength={3}
                      maxLength={600}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </Field>
                  <Stack>
                    <Button type="submit">
                      {busy ? "Saving…" : "Save changes"}
                    </Button>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => setDraft(null)}
                    >
                      Cancel
                    </Button>
                    {editing && !editing.sourceId ? (
                      <Button
                        variant="danger"
                        type="button"
                        disabled={reason.trim().length < 3}
                        onClick={() => void remove()}
                      >
                        Delete entry
                      </Button>
                    ) : null}
                  </Stack>
                  {editing?.sourceId ? (
                    <Text className="text-muted">
                      Imported entries can be archived to preserve existing
                      links.
                    </Text>
                  ) : null}
                </fieldset>
              </form>
            </CardBody>
          </Card>
        ) : (
          <Text className="text-muted">
            Select an entry to edit, or create a new one.
          </Text>
        )}
      </div>
    </Stack>
  );
}
