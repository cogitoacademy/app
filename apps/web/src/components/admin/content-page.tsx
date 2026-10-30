"use client";

import { IconInbox, IconPlus, IconX } from "@tabler/icons-react";
import { EmptyState } from "@/components/empty-state";
import { TablePagination } from "@/components/table-pagination";
import Loader from "@/components/loader";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Drawer,
  DrawerPopup,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
} from "@cogito-app/ui/components/selia/drawer";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@cogito-app/ui/components/selia/dialog";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { DatePicker } from "@cogito-app/ui/components/selia/date-picker";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectList,
  SelectItem,
} from "@cogito-app/ui/components/selia/select";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text } from "@cogito-app/ui/components/selia/text";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@cogito-app/ui/components/selia/table";
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
  fileName: "",
  location: "",
  startDate: "",
  endDate: "",
  educationLevels: "",
  scale: "",
  organizer: "",
  registrationDeadline: "",
  registrationLink: "",
  socialMediaLink: "",
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
  const [isDesktop, setIsDesktop] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 10;
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const pageTitle =
    kind === "resource" ? "Knowledge Bank" : "Competition Calendar";
  const pageDescription =
    kind === "resource"
      ? "Add and update materials in their original language; saved resources appear in the student library."
      : "Add and update event details and dates; saved changes appear in the competition calendar.";
  const [editing, setEditing] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [active, setActive] = useState(true);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [initialDraft, setInitialDraft] = useState("");
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    label: string;
    action: () => void;
  } | null>(null);
  const isDirty =
    !!draft &&
    JSON.stringify({ draft, active, categoryIds, reason }) !== initialDraft;
  function requestAction(action: () => void) {
    if (busy) return;
    if (!isDirty) {
      action();
      return;
    }
    setConfirmation({
      title: "Discard unsaved changes?",
      description: "Your changes will be lost if you continue.",
      label: "Discard",
      action,
    });
  }
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (pdfPreview) URL.revokeObjectURL(pdfPreview);
    },
    [pdfPreview],
  );
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
  const filteredEntries = (entries.data ?? []).filter((row) =>
    row.title.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filteredEntries.length / pageSize) - 1),
  );
  const pageEntries = filteredEntries.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  function open(row: Row | null) {
    requestAction(() => loadEntry(row));
  }
  function loadEntry(row: Row | null) {
    const next = defaults();
    if (row)
      for (const key of Object.keys(next))
        next[key] =
          key === "educationLevels"
            ? ((row[key] as string[] | undefined) ?? []).join(", ")
            : String(row[key] ?? "");
    setPdfPreview(null);
    setInitialDraft(
      JSON.stringify({
        draft: next,
        active: row?.isActive ?? true,
        categoryIds: (row?.categoryIds as string[]) ?? [],
        reason: "",
      }),
    );
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
        sortOrder: Number(editing?.sortOrder ?? 0),
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
      if (kind === "resource" && reason.trim().length < 3)
        throw new Error("Enter a reason of at least 3 characters");
      if (editing)
        await client.adminContent.update({
          entry,
          id: editing.id,
          expectedVersion: editing.version,
          reason: kind === "resource" ? reason : undefined,
        });
      else
        await client.adminContent.create({
          entry,
          reason: kind === "resource" ? reason : undefined,
        });
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
          ? "Check the required fields, links and date range. Dates use WIB."
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
      setPdfPreview(null);
      setDraft({ ...draft, fileId: result.fileId, fileName: result.fileName });
      setMessage(`PDF ready: ${result.fileName}. Save changes to attach it.`);
    } catch (e) {
      setError(getUserFacingError(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await client.adminContent.remove({
        kind,
        id: editing.id,
        expectedVersion: editing.version,
        reason: kind === "resource" ? reason : undefined,
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
      {["startDate", "endDate", "registrationDeadline"].includes(key) ? (
        <DatePicker
          id={`content-${key}`}
          required={required}
          value={
            draft?.[key]
              ? new Date(draft[key]!).toLocaleDateString("sv-SE", {
                  timeZone: "Asia/Jakarta",
                })
              : ""
          }
          onChange={(value) =>
            setDraft({
              ...draft,
              [key]: value
                ? `${value}T${draft?.[key] ? new Date(draft[key]!).toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta", hour12: false }) : "00:00:00"}+07:00`
                : "",
            })
          }
        />
      ) : multiline ? (
        <Textarea
          id={`content-${key}`}
          value={draft?.[key] ?? ""}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      ) : (
        <Input
          id={`content-${key}`}
          required={required}
          type="text"
          value={draft?.[key] ?? ""}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      )}
    </Field>
  );
  const closeEditor = () =>
    requestAction(() => {
      setDraft(null);
      setPdfPreview(null);
      setError("");
    });
  const editorTitle = `${editing ? "Edit" : "Add"} ${kind === "resource" ? "resource" : "event"}`;
  const editorBody = draft ? (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {error ? (
        <Text role="alert" className="text-danger">
          {error}
        </Text>
      ) : null}
      <fieldset disabled={busy} className="space-y-4">
        <Text className="text-muted">
          Enter titles and descriptions in their original language.
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
              {draft.fileId ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const file = await client.adminContent.previewPdf({
                        fileId: draft.fileId!,
                      });
                      const bytes = Uint8Array.from(atob(file.base64), (char) =>
                        char.charCodeAt(0),
                      );
                      setPdfPreview(
                        URL.createObjectURL(
                          new Blob([bytes], {
                            type: "application/pdf",
                          }),
                        ),
                      );
                    } catch (error) {
                      setError(getUserFacingError(error));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Preview attached PDF
                </Button>
              ) : null}
              {pdfPreview ? (
                <iframe
                  title="Attached PDF"
                  src={pdfPreview}
                  className="h-[32rem] w-full"
                />
              ) : null}
              <Text>
                {draft.fileId
                  ? draft.fileName || "A private PDF is attached."
                  : "Upload a PDF before saving."}
              </Text>
            </Field>
          </>
        ) : (
          <>
            {field("location", "Location")}
            {field("startDate", "Start date (WIB)", true)}
            {field("endDate", "End date (WIB)", true)}
            <Text className="text-muted">
              Dates use WIB. End calendar date is included.
            </Text>
            <Field>
              <FieldLabel htmlFor="content-types">Competition types</FieldLabel>
              <Select
                multiple
                value={categoryIds}
                onValueChange={(values) =>
                  setCategoryIds(
                    Array.isArray(values) ? values.map(String) : [],
                  )
                }
              >
                <SelectTrigger id="content-types">
                  <SelectValue placeholder="Select competition types" />
                </SelectTrigger>
                <SelectPopup>
                  <SelectList>
                    {categories.data
                      ?.filter(
                        (c) =>
                          c.parentId === null &&
                          (c.isActive || categoryIds.includes(c.id)),
                      )
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {!c.isActive ? " (archived)" : ""}
                        </SelectItem>
                      ))}
                  </SelectList>
                </SelectPopup>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="content-levels">Education levels</FieldLabel>
              <Select
                multiple
                value={(draft.educationLevels ?? "")
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean)}
                onValueChange={(values) =>
                  setDraft({
                    ...draft,
                    educationLevels: Array.isArray(values)
                      ? values.join(",")
                      : "",
                  })
                }
              >
                <SelectTrigger id="content-levels">
                  <SelectValue placeholder="Select education levels" />
                </SelectTrigger>
                <SelectPopup>
                  <SelectList>
                    {["sd", "smp", "sma", "mahasiswa"].map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === "mahasiswa"
                          ? "Mahasiswa"
                          : value.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectList>
                </SelectPopup>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="content-scale">Scale</FieldLabel>
              <Select
                value={draft.scale || "none"}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    scale: value === "none" ? "" : String(value),
                  })
                }
              >
                <SelectTrigger id="content-scale">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  <SelectList>
                    <SelectItem value="none">Not specified</SelectItem>
                    <SelectItem value="international">International</SelectItem>
                    <SelectItem value="national">National</SelectItem>
                  </SelectList>
                </SelectPopup>
              </Select>
            </Field>
            {field("organizer", "Organizer")}
            {field("registrationDeadline", "Registration deadline (WIB)")}
            {field("registrationLink", "Registration link")}
            {field("socialMediaLink", "Social media link")}
          </>
        )}
        <label htmlFor="content-active" className="flex items-center gap-2">
          <Checkbox
            id="content-active"
            checked={active}
            onCheckedChange={setActive}
          />
          Active
        </label>
        {kind === "resource" ? (
          <Field>
            <FieldLabel htmlFor="content-reason">Reason for change</FieldLabel>
            <Input
              id="content-reason"
              required
              minLength={3}
              maxLength={600}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        ) : null}
        <Stack>
          <Button type="submit">{busy ? "Saving…" : "Save changes"}</Button>
          <Button variant="secondary" type="button" onClick={closeEditor}>
            Cancel
          </Button>
          {editing && !editing.sourceId ? (
            <Button
              variant="danger"
              type="button"
              disabled={kind === "resource" && reason.trim().length < 3}
              onClick={() =>
                setConfirmation({
                  title: "Delete entry?",
                  description: `“${editing.title}” will be permanently deleted. This cannot be undone.`,
                  label: "Delete entry",
                  action: () => void remove(),
                })
              }
            >
              Delete entry
            </Button>
          ) : null}
        </Stack>
        {editing?.sourceId ? (
          <Text className="text-muted">
            Imported entries can be archived to preserve existing links.
          </Text>
        ) : null}
      </fieldset>
    </form>
  ) : null;
  if (previewing)
    return (
      <Stack direction="column" spacing="lg" className="min-w-0">
        {preview(() => setPreviewing(false))}
      </Stack>
    );
  return (
    <Stack
      direction="column"
      spacing="md"
      className="w-full min-w-0 max-w-full"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Heading level={1} size="md">
            {pageTitle}
          </Heading>
          <Text className="max-w-full text-muted">{pageDescription}</Text>
        </div>
        <Stack direction="row" spacing="sm">
          <Button
            disabled={busy || entries.isError || entries.isPending}
            onClick={() => open(null)}
          >
            <IconPlus /> Add {kind === "resource" ? "resource" : "event"}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              requestAction(() => {
                setDraft(null);
                setPdfPreview(null);
                setError("");
                setMessage("");
                setPreviewing(true);
              })
            }
          >
            {kind === "resource" ? "View resources" : "View calendar"}
          </Button>
        </Stack>
      </div>
      {entries.isError ? (
        <Card>
          <CardBody>
            <Text role="alert">{getUserFacingError(entries.error)}</Text>
            <Button onClick={() => void entries.refetch()}>Try again</Button>
          </CardBody>
        </Card>
      ) : null}
      {error ? <Text role="alert">{error} Your draft is retained.</Text> : null}
      {message ? <Text role="status">{message}</Text> : null}
      <div
        className={
          draft && isDesktop
            ? "grid min-w-0 grid-cols-2 items-start gap-6"
            : "min-w-0"
        }
      >
        <section className="min-w-0 space-y-4">
          <div>
            <Stack direction="column">
              <Input
                aria-label="Search entries"
                placeholder="Search titles"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
              {entries.isPending ? <Loader /> : null}
              <TableContainer id="managed-content-table">
                <Table className="[&_[data-slot=table-cell]]:py-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageEntries.map((row) => (
                      <TableRow
                        key={row.id}
                        className={
                          draft && editing?.id === row.id
                            ? "bg-accent"
                            : undefined
                        }
                      >
                        <TableCell>{row.title}</TableCell>
                        <TableCell>
                          {row.isActive ? "Active" : "Archived"}
                        </TableCell>
                        <TableCell>{row.version}</TableCell>
                        <TableCell>
                          <Button
                            variant="plain"
                            size="sm"
                            disabled={busy}
                            onClick={() => open(row)}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                targetId="managed-content-table"
                label={kind === "resource" ? "resources" : "events"}
                pageSize={pageSize}
                page={currentPage}
                itemCount={pageEntries.length}
                hasNext={(currentPage + 1) * pageSize < filteredEntries.length}
                isFetching={entries.isFetching}
                onPrevious={() => setPage(Math.max(0, currentPage - 1))}
                onNext={() => setPage(currentPage + 1)}
              />
              {filteredEntries.length === 0 ? (
                <EmptyState
                  icon={<IconInbox />}
                  title="No matching entries"
                  description="Try another search or add an entry."
                  size="compact"
                />
              ) : null}
            </Stack>
          </div>
        </section>
        {draft && isDesktop ? (
          <Card
            className="sticky top-4 flex max-h-[calc(100dvh-8rem)] min-w-0 flex-col"
            role="region"
            aria-label={editorTitle}
          >
            <CardHeader>
              <CardTitle>{editorTitle}</CardTitle>
              <Button
                variant="plain"
                size="sm-icon"
                aria-label="Close editor"
                disabled={busy}
                onClick={closeEditor}
              >
                <IconX />
              </Button>
            </CardHeader>
            <CardBody className="min-h-0 overflow-y-auto">
              {editorBody}
            </CardBody>
          </Card>
        ) : null}
      </div>
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
            <DrawerTitle>{editorTitle}</DrawerTitle>
            <Button
              variant="plain"
              size="sm-icon"
              className="ml-auto"
              aria-label="Close editor"
              disabled={busy}
              onClick={closeEditor}
            >
              <IconX />
            </Button>
          </DrawerHeader>
          <DrawerBody>{editorBody}</DrawerBody>
        </DrawerPopup>
      </Drawer>
      <Dialog
        open={!!confirmation}
        onOpenChange={(isOpen) => {
          if (!isOpen && !busy) setConfirmation(null);
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <div>
              <DialogTitle>{confirmation?.title}</DialogTitle>
              <DialogDescription>{confirmation?.description}</DialogDescription>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="plain"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              {confirmation?.label === "Discard" ? "Keep editing" : "Cancel"}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                const action = confirmation?.action;
                setConfirmation(null);
                action?.();
              }}
            >
              {confirmation?.label}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </Stack>
  );
}
