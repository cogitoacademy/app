"use client";

import { IconInbox } from "@tabler/icons-react";
import { EmptyState } from "@/components/empty-state";
import Loader from "@/components/loader";

import { CrossBrowserDateTimeInput } from "@/components/booking/minute-time-input";

import { NumberField as SeliaNumberField } from "@cogito-app/ui/components/selia/number-field";

import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconDeviceFloppy,
  IconEdit,
  IconMapPin,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionPanel,
} from "@cogito-app/ui/components/selia/accordion";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import {
  Tabs,
  TabsList,
  TabsItem,
  TabsPanel,
} from "@cogito-app/ui/components/selia/tabs";
import {
  Drawer,
  DrawerTrigger,
  DrawerPopup,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerClose,
} from "@cogito-app/ui/components/selia/drawer";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Text } from "@cogito-app/ui/components/selia/text";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { getUserFacingError } from "@/lib/error-message";
import { resolveProfileImageUrl } from "@/lib/profile-image-url";
import { client, orpc } from "@/utils/orpc";

import { mergeAcademyClassQueryResults } from "./academy-class-page-utils";
import { ClassAdminCancellationPanel } from "./class-admin-cancellation-panel";
import { ClassAdminLifecyclePanel } from "./class-admin-lifecycle-panel";

type ClassRecord = Awaited<ReturnType<typeof client.admin.getAcademyClass>>;
type ClassKind = "cohort" | "masterclass";
type SessionMode = "online" | "in_person";
type SessionForm = {
  id?: string;
  capacity: string;
  titleEn: string;
  titleId: string;
  curriculumEn: string;
  curriculumId: string;
  startAt: string;
  durationMinutes: string;
  mode: SessionMode;
  roomId: string;
  tutorId: string;
};
const COVER_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;
const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024;
type CoverImageType = (typeof COVER_IMAGE_TYPES)[number];

type DraftForm = {
  id?: string;
  expectedVersion?: number;
  kind: ClassKind;
  competitionId: string;
  titleEn: string;
  titleId: string;
  descriptionEn: string;
  descriptionId: string;
  coverKey: string;
  tutorFeeIdr: string;
  minimumEnrollment: string;
  minimumCheckAt: string;
  fullRateMarks: string;
  halfRateMarks: string;
  singleRateMarks: string;
  masterclassRateMarks: string;
  reason: string;
  sessions: SessionForm[];
};

const emptySession = (): SessionForm => ({
  capacity: "",
  titleEn: "",
  titleId: "",
  curriculumEn: "",
  curriculumId: "",
  startAt: "",
  durationMinutes: "60",
  mode: "online",
  roomId: "",
  tutorId: "",
});

const emptyDraft = (kind: ClassKind = "cohort"): DraftForm => ({
  kind,
  competitionId: "",
  titleEn: "",
  titleId: "",
  descriptionEn: "",
  descriptionId: "",
  coverKey: "",
  tutorFeeIdr: kind === "cohort" ? "400000" : "300000",
  minimumEnrollment: "",
  minimumCheckAt: "",
  fullRateMarks: "20",
  halfRateMarks: "22",
  singleRateMarks: "25",
  masterclassRateMarks: "5",
  reason: "",
  sessions: [emptySession()],
});

function toLocalDateTime(value: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toWibDateTimeInput(value: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Jakarta",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function fromWibDateTimeInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function draftFromRecord(record: ClassRecord): DraftForm {
  return {
    id: record.id,
    expectedVersion: record.version,
    kind: record.kind as ClassKind,
    competitionId: record.competitionId,
    titleEn: record.titleEn,
    titleId: record.titleId ?? "",
    descriptionEn: record.descriptionEn,
    descriptionId: record.descriptionId ?? "",
    coverKey: record.coverKey ?? "",
    tutorFeeIdr: String(record.tutorFeeIdr),
    minimumEnrollment: String(record.minimumEnrollment ?? ""),
    minimumCheckAt: toLocalDateTime(record.minimumCheckAt),
    fullRateMarks: String(record.cohortFullRateMarks ?? ""),
    halfRateMarks: String(record.cohortHalfRateMarks ?? ""),
    singleRateMarks: String(record.cohortSingleRateMarks ?? ""),
    masterclassRateMarks: String(record.masterclassRateMarks ?? ""),
    reason: "",
    sessions: record.sessions.map((session) => ({
      id: session.id,
      capacity: String(session.capacity),
      titleEn: session.titleEn,
      titleId: session.titleId ?? "",
      curriculumEn: session.curriculumEn ?? "",
      curriculumId: session.curriculumId ?? "",
      startAt: toLocalDateTime(session.startAt),
      durationMinutes: String(
        (new Date(session.endAt).getTime() -
          new Date(session.startAt).getTime()) /
          60_000,
      ),
      mode: session.mode as SessionMode,
      roomId: session.roomId ?? "",
      tutorId: session.tutorId,
    })),
  };
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min = 1,
  max,
  required = true,
  description,
  readOnly = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  required?: boolean;
  description?: string;
  readOnly?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <SeliaNumberField
        id={id}
        allowOutOfRange
        format={{ useGrouping: false }}
        min={min}
        max={max}
        step={1}
        required={required}
        readOnly={readOnly}
        value={value === "" ? null : Number(value)}
        onValueChange={(nextValue) =>
          onChange(nextValue === null ? "" : String(nextValue))
        }
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  required = false,
  type = "text",
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  maxLength?: number;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {type === "datetime-local" ? (
        <CrossBrowserDateTimeInput
          id={id}
          value={value}
          onChange={onChange}
          required={required}
        />
      ) : (
        <Input
          id={id}
          type={type}
          maxLength={maxLength}
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

function TextareaField({
  id,
  label,
  value,
  onChange,
  required = false,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        maxLength={maxLength}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
      />
    </Field>
  );
}

export function AcademyClassPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<DraftForm>(() => emptyDraft());
  const [openSessions, setOpenSessions] = useState<number[]>([0]);
  const [workspace, setWorkspace] = useState("published");
  const [showDrafts, setShowDrafts] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [meetingRetryReasons, setMeetingRetryReasons] = useState<
    Record<string, string>
  >({});
  const [replacementTutorIds, setReplacementTutorIds] = useState<
    Record<string, string>
  >({});
  const [replacementReasons, setReplacementReasons] = useState<
    Record<string, string>
  >({});
  const [rescheduleValues, setRescheduleValues] = useState<
    Record<string, { startAt: string; reason: string }>
  >({});
  const classesQuery = useQuery(
    orpc.admin.listAcademyClasses.queryOptions({ input: { state: "draft" } }),
  );
  const publishedClassesQuery = useQuery(
    orpc.admin.listAcademyClasses.queryOptions({
      input: { state: "published" },
    }),
  );
  const postponedClassesQuery = useQuery(
    orpc.admin.listAcademyClasses.queryOptions({
      input: { state: "postponed" },
    }),
  );
  const competitionsQuery = useQuery(
    orpc.admin.listCompetitionCatalog.queryOptions({
      input: { includeArchived: false },
    }),
  );
  const tutorsQuery = useQuery(
    orpc.adminTutor.listTutorProfiles.queryOptions({
      input: { status: "published", limit: 100, offset: 0 },
    }),
  );
  const roomsQuery = useQuery(orpc.room.list.queryOptions({ input: {} }));
  const saveDraft = useMutation(
    orpc.admin.saveAcademyClassDraft.mutationOptions({
      onSuccess: async (record) => {
        setForm(draftFromRecord(record));
        await queryClient.invalidateQueries({
          queryKey: orpc.admin.listAcademyClasses.key({
            input: { state: "draft" },
          }),
        });
        toastManager.add({
          title: "Class draft saved",
          description: "This draft is not public and does not reserve a room.",
          type: "success",
        });
      },
      onError: (error: Error) => {
        toastManager.add({
          title: "Class draft could not be saved",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );
  const publishClass = useMutation(
    orpc.admin.publishAcademyClass.mutationOptions({
      onSuccess: async (record) => {
        setForm(emptyDraft());
        setWorkspace("published");
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: orpc.admin.listAcademyClasses.key({
              input: { state: "draft" },
            }),
          }),
          queryClient.invalidateQueries({
            queryKey: orpc.admin.listAcademyClasses.key({
              input: { state: "published" },
            }),
          }),
        ]);
        toastManager.add({
          title: "Class published",
          description: `${record.titleEn} is now visible in the student catalog.`,
          type: "success",
        });
      },
      onError: (error: Error) => {
        toastManager.add({
          title: "Class could not be published",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );
  const retryClassMeetings = useMutation(
    orpc.admin.retryAcademyClassMeetings.mutationOptions({
      onSuccess: async (record) => {
        setMeetingRetryReasons((current) => ({
          ...current,
          [record.id]: "",
        }));
        await queryClient.invalidateQueries({
          queryKey: orpc.admin.listAcademyClasses.key({
            input: { state: "published" },
          }),
        });
        await queryClient.invalidateQueries({
          queryKey: orpc.admin.listAcademyClasses.key({
            input: { state: "postponed" },
          }),
        });
        toastManager.add({
          title: "Meeting setup retried",
          description: `${record.titleEn} meeting setup has been retried.`,
          type: "success",
        });
      },
      onError: (error: Error) => {
        toastManager.add({
          title: "Meeting retry could not be started",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );
  const replaceAbsentTutor = useMutation(
    orpc.admin.replaceAbsentClassTutor.mutationOptions({
      onSuccess: async () => {
        await Promise.all(
          ["published", "postponed"].map((state) =>
            queryClient.invalidateQueries({
              queryKey: orpc.admin.listAcademyClasses.key({
                input: { state: state as "published" | "postponed" },
              }),
            }),
          ),
        );
        toastManager.add({
          title: "Tutor replaced",
          description: "The session time and class fee stayed the same.",
          type: "success",
        });
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Tutor replacement failed",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );
  const rescheduleSession = useMutation(
    orpc.admin.rescheduleClassSession.mutationOptions({
      onSuccess: async (record) => {
        await Promise.all(
          ["published", "postponed"].map((state) =>
            queryClient.invalidateQueries({
              queryKey: orpc.admin.listAcademyClasses.key({
                input: { state: state as "published" | "postponed" },
              }),
            }),
          ),
        );
        setRescheduleValues((current) => {
          const next = { ...current };
          for (const session of record.sessions) delete next[session.id];
          return next;
        });
        toastManager.add({
          title: "Session time updated",
          description:
            "Enrolled students can review the schedule-change exit window.",
          type: "success",
        });
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Session time could not be updated",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  const classes = classesQuery.data ?? [];
  const publishedClasses = mergeAcademyClassQueryResults(
    publishedClassesQuery.data ?? [],
    postponedClassesQuery.data ?? [],
  ).toSorted(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
  const competitions = competitionsQuery.data ?? [];
  const tutors = tutorsQuery.data ?? [];
  const rooms = roomsQuery.data ?? [];

  function updateForm<Key extends keyof DraftForm>(
    key: Key,
    value: DraftForm[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateSession(index: number, patch: Partial<SessionForm>) {
    setForm((current) => ({
      ...current,
      sessions: current.sessions.map((session, sessionIndex) =>
        sessionIndex === index ? { ...session, ...patch } : session,
      ),
    }));
  }

  function changeKind(kind: ClassKind) {
    setForm((current) => ({
      ...current,
      kind,
      tutorFeeIdr: kind === "cohort" ? "400000" : "300000",
      sessions:
        kind === "masterclass"
          ? current.sessions.slice(0, 1)
          : current.sessions,
    }));
  }

  async function uploadCover(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    if (!COVER_IMAGE_TYPES.includes(file.type as CoverImageType)) {
      toastManager.add({
        title: "Unsupported cover image",
        description: "Choose a PNG, JPEG, WebP, or GIF image.",
        type: "error",
      });
      input.value = "";
      return;
    }
    if (file.size > MAX_COVER_IMAGE_BYTES) {
      toastManager.add({
        title: "Cover image is too large",
        description: "Choose an image up to 5 MB.",
        type: "error",
      });
      input.value = "";
      return;
    }

    setCoverUploading(true);
    try {
      const signed = await client.upload.createUploadUrl({
        filename: file.name,
        contentType: file.type as CoverImageType,
        contentLength: file.size,
      });
      const uploadUrl =
        resolveProfileImageUrl(signed.uploadUrl) ?? signed.uploadUrl;
      const isLocalUpload = signed.uploadUrl.startsWith("/");
      const fields = signed.fields ?? {};
      let response: Response;

      if (Object.keys(fields).length > 0) {
        const body = new FormData();
        Object.entries(fields).forEach(([key, value]) =>
          body.append(key, value),
        );
        body.append("file", file, file.name);
        response = await fetch(uploadUrl, {
          method: signed.method,
          body,
        });
      } else {
        response = await fetch(uploadUrl, {
          method: signed.method,
          credentials: isLocalUpload ? "include" : "omit",
          headers: { "content-type": file.type },
          body: file,
        });
      }

      if (!response.ok) throw new Error("Cover image upload failed.");
      setForm((current) => ({ ...current, coverKey: signed.key }));
      setCoverPreviewUrl(resolveProfileImageUrl(signed.publicUrl) ?? null);
      toastManager.add({
        title: "Cover image uploaded",
        description: "Save the draft to attach this cover image.",
        type: "success",
      });
    } catch (error) {
      toastManager.add({
        title: "Cover image could not be uploaded",
        description: getUserFacingError(error),
        type: "error",
      });
    } finally {
      setCoverUploading(false);
      input.value = "";
    }
  }

  function draftInputFromForm() {
    const sessions = form.sessions.map((session) => ({
      ...(session.id ? { id: session.id } : {}),
      capacity: Number(session.capacity),
      titleEn: session.titleEn,
      titleId: session.titleId,
      curriculumEn: session.curriculumEn,
      curriculumId: session.curriculumId,
      startAt: new Date(session.startAt).toISOString(),
      endAt: new Date(
        new Date(session.startAt).getTime() +
          Number(session.durationMinutes) * 60_000,
      ).toISOString(),
      mode: session.mode,
      roomId: session.roomId || null,
      tutorId: session.tutorId,
    }));
    const common = {
      ...(form.id
        ? { id: form.id, expectedVersion: form.expectedVersion }
        : {}),
      competitionId: form.competitionId,
      titleEn: form.titleEn,
      titleId: form.titleId,
      descriptionEn: form.descriptionEn,
      descriptionId: form.descriptionId,
      coverKey: form.coverKey,
      tutorFeeIdr: Number(form.tutorFeeIdr),
      reason: form.reason,
      sessions,
    };
    const input =
      form.kind === "cohort"
        ? {
            ...common,
            kind: "cohort" as const,
            minimumEnrollment: Number(form.minimumEnrollment),
            minimumCheckAt: new Date(form.minimumCheckAt).toISOString(),
            fullRateMarks: Number(form.fullRateMarks),
            halfRateMarks: Number(form.halfRateMarks),
            singleRateMarks: Number(form.singleRateMarks),
          }
        : {
            ...common,
            kind: "masterclass" as const,
            masterclassRateMarks: Number(form.masterclassRateMarks),
          };
    return input;
  }

  function hasUnsavedDraftChanges() {
    if (!form.id) return true;
    const saved = classes.find((record) => record.id === form.id);
    if (!saved) return true;
    return (
      JSON.stringify({ ...form, reason: "" }) !==
      JSON.stringify({ ...draftFromRecord(saved), reason: "" })
    );
  }

  async function publishCurrentDraft(
    input: ReturnType<typeof draftInputFromForm>,
  ) {
    if (!form.id) return;
    try {
      const saved = hasUnsavedDraftChanges()
        ? await saveDraft.mutateAsync(input)
        : await client.admin.getAcademyClass({ id: form.id });
      await publishClass.mutateAsync({
        id: saved.id,
        expectedVersion: saved.version,
        reason: input.reason,
      });
    } catch {
      // Each mutation displays its own actionable error toast.
    }
  }

  function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = draftInputFromForm();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (
      submitter instanceof HTMLButtonElement &&
      submitter.name === "class-action" &&
      submitter.value === "publish"
    ) {
      void publishCurrentDraft(input);
      return;
    }
    saveDraft.mutate(input);
  }

  return (
    <Stack direction="column" spacing="lg" className="w-full min-w-0 pb-8">
      <div className="min-w-0 max-w-full">
        <Heading level={1} size="md">
          Class Studio
        </Heading>
        <Text className="max-w-full text-muted">
          Manage published classes, or build a draft before sharing it with
          students.
        </Text>
      </div>

      <Tabs
        value={workspace}
        onValueChange={(value) => setWorkspace(String(value))}
        className="gap-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList
            aria-label="Class studio workspace"
            className="w-full sm:w-fit"
          >
            <TabsItem value="published" className="whitespace-nowrap">
              Published classes
            </TabsItem>
            <TabsItem value="drafts" className="whitespace-nowrap">
              Drafts &amp; editor
            </TabsItem>
          </TabsList>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              aria-expanded={workspace === "drafts" && showDrafts}
              onClick={() => {
                setWorkspace("drafts");
                setShowDrafts((current) => !current);
              }}
            >
              Drafts
            </Button>
            <Button
              type="button"
              size="icon"
              aria-label="New class"
              disabled={coverUploading}
              onClick={() => {
                setForm(emptyDraft());
                setCoverPreviewUrl(null);
                setWorkspace("drafts");
                setShowDrafts(false);
              }}
            >
              <IconPlus />
            </Button>
          </div>
        </div>
        <TabsPanel value="published">
          <div className="grid min-w-0 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {publishedClassesQuery.isLoading ? (
              <Loader />
            ) : postponedClassesQuery.isLoading ? (
              <Loader />
            ) : publishedClassesQuery.isError ||
              postponedClassesQuery.isError ? (
              <Text className="text-danger-foreground">
                Published or postponed classes could not be loaded. Refresh to
                try again.
              </Text>
            ) : publishedClasses.length === 0 ? (
              <Text className="text-muted">
                No classes have been published.
              </Text>
            ) : (
              publishedClasses.map((record) => {
                const onlineSessions = record.sessions.filter(
                  (session) => session.mode === "online",
                );
                const failedMeetings = onlineSessions.filter(
                  (session) => session.meeting?.status === "failed",
                );
                const createdMeetings = onlineSessions.filter(
                  (session) => session.meeting?.status === "created",
                );
                const absenceNotices = record.sessions.flatMap((session) =>
                  session.tutorAbsences.map((notice) => ({ session, notice })),
                );
                const pendingMeetings =
                  onlineSessions.length -
                  failedMeetings.length -
                  createdMeetings.length;
                const retryReason = meetingRetryReasons[record.id] ?? "";
                return (
                  <Card
                    key={record.id}
                    data-testid={`published-class-${record.id}`}
                    className="min-w-0 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Heading
                            level={2}
                            size="sm"
                            className="w-full line-clamp-2 wrap-anywhere leading-snug"
                            title={record.titleEn}
                          >
                            {record.titleEn}
                          </Heading>
                          <Badge variant="secondary" size="sm">
                            {record.competition.name}
                          </Badge>
                          <Badge
                            variant={
                              record.state === "postponed"
                                ? "warning"
                                : "success"
                            }
                          >
                            {record.state === "postponed"
                              ? "Postponed"
                              : "Published"}
                          </Badge>
                          <Badge variant="tertiary" size="sm">
                            {record.kind === "cohort"
                              ? "Cohort"
                              : "Masterclass"}
                          </Badge>
                        </div>
                        <div className="mt-3 flex min-w-0 items-center gap-3">
                          {record.sessions[0] ? (
                            <div
                              className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-lg bg-accent"
                              aria-hidden="true"
                            >
                              <span className="text-sm uppercase">
                                {new Intl.DateTimeFormat("en", {
                                  weekday: "short",
                                  timeZone: "Asia/Jakarta",
                                }).format(new Date(record.sessions[0].startAt))}
                              </span>
                              <span className="text-2xl font-semibold tabular-nums">
                                {new Intl.DateTimeFormat("en", {
                                  day: "numeric",
                                  timeZone: "Asia/Jakarta",
                                }).format(new Date(record.sessions[0].startAt))}
                              </span>
                              <span className="text-sm uppercase">
                                {new Intl.DateTimeFormat("en", {
                                  month: "short",
                                  timeZone: "Asia/Jakarta",
                                }).format(new Date(record.sessions[0].startAt))}
                              </span>
                            </div>
                          ) : null}
                          <div className="min-w-0 space-y-1">
                            <Text>
                              {record.sessions[0]
                                ? new Intl.DateTimeFormat("en", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                    timeZone: "Asia/Jakarta",
                                  }).format(
                                    new Date(record.sessions[0].startAt),
                                  ) + " WIB"
                                : "Schedule unavailable"}
                            </Text>
                            <Text className="text-muted">
                              {onlineSessions.length === record.sessions.length
                                ? "Online"
                                : onlineSessions.length === 0
                                  ? "Offline"
                                  : "Online · Offline"}
                            </Text>
                            <Text className="text-muted">
                              {record.sessions.length} session
                              {record.sessions.length === 1 ? "" : "s"}
                            </Text>
                          </div>
                        </div>
                        <Text className="mt-2 text-sm text-muted">
                          {onlineSessions.length === 0
                            ? "In-person sessions use managed rooms; no Meet is created."
                            : `${createdMeetings.length} Meet(s) ready${pendingMeetings > 0 ? ` · ${pendingMeetings} pending` : ""}${failedMeetings.length > 0 ? ` · ${failedMeetings.length} failed` : ""}.`}
                        </Text>
                      </div>
                    </div>
                    {failedMeetings.length > 0 ? (
                      <div className="mt-4 flex flex-wrap items-end gap-3">
                        <Field className="w-full min-w-0 flex-1 sm:min-w-64">
                          <FieldLabel htmlFor={`meeting-retry-${record.id}`}>
                            Retry reason
                          </FieldLabel>
                          <Input
                            id={`meeting-retry-${record.id}`}
                            maxLength={500}
                            value={retryReason}
                            onChange={(event) =>
                              setMeetingRetryReasons((current) => ({
                                ...current,
                                [record.id]: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={
                            retryClassMeetings.isPending ||
                            retryReason.trim().length < 3
                          }
                          onClick={() =>
                            retryClassMeetings.mutate({
                              id: record.id,
                              reason: retryReason,
                            })
                          }
                        >
                          Retry failed meeting setup
                        </Button>
                      </div>
                    ) : pendingMeetings > 0 ? (
                      <Text className="mt-3 text-sm text-muted">
                        Meeting work is queued or running. Failed attempts are
                        retried automatically.
                      </Text>
                    ) : null}
                    {record.sessions.some(
                      (session) => session.state === "scheduled",
                    ) ? (
                      <section
                        className="mt-4 space-y-3"
                        aria-label="Change scheduled session time"
                      >
                        <Heading level={3} size="sm">
                          Change session time
                        </Heading>
                        {record.sessions
                          .filter((session) => session.state === "scheduled")
                          .map((session) => {
                            const edit = rescheduleValues[session.id] ?? {
                              startAt: toWibDateTimeInput(session.startAt),
                              reason: "",
                            };
                            const duration =
                              new Date(session.endAt).getTime() -
                              new Date(session.startAt).getTime();
                            const nextStart = fromWibDateTimeInput(
                              edit.startAt,
                            );
                            const nextEnd =
                              nextStart && !Number.isNaN(nextStart.getTime())
                                ? new Date(nextStart.getTime() + duration)
                                : null;
                            return (
                              <div
                                key={session.id}
                                className="grid min-w-0 gap-3 rounded-md border border-border p-3 sm:grid-cols-2"
                              >
                                <Text className="sm:col-span-2">
                                  {session.titleEn} · currently{" "}
                                  {new Intl.DateTimeFormat("en", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                    timeZone: "Asia/Jakarta",
                                  }).format(new Date(session.startAt))}{" "}
                                  WIB
                                </Text>
                                <Field className="sm:col-span-2">
                                  <FieldLabel
                                    htmlFor={`reschedule-${session.id}`}
                                  >
                                    New date and start time
                                  </FieldLabel>
                                  <CrossBrowserDateTimeInput
                                    id={`reschedule-${session.id}`}
                                    value={edit.startAt}
                                    min={toWibDateTimeInput(new Date())}
                                    onChange={(startAt) =>
                                      setRescheduleValues((current) => ({
                                        ...current,
                                        [session.id]: { ...edit, startAt },
                                      }))
                                    }
                                    disabled={rescheduleSession.isPending}
                                  />
                                  <FieldDescription>
                                    Duration, tutor, room, mode, and class fee
                                    stay the same.
                                  </FieldDescription>
                                </Field>
                                <Field className="sm:col-span-2">
                                  <FieldLabel
                                    htmlFor={`reschedule-reason-${session.id}`}
                                  >
                                    Reason for students
                                  </FieldLabel>
                                  <Input
                                    id={`reschedule-reason-${session.id}`}
                                    maxLength={500}
                                    value={edit.reason}
                                    onChange={(event) =>
                                      setRescheduleValues((current) => ({
                                        ...current,
                                        [session.id]: {
                                          ...edit,
                                          reason: event.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </Field>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="sm:col-span-2"
                                  disabled={
                                    rescheduleSession.isPending ||
                                    !edit.startAt ||
                                    !nextEnd ||
                                    nextStart?.getTime() ===
                                      new Date(session.startAt).getTime() ||
                                    edit.reason.trim().length < 3
                                  }
                                  onClick={() =>
                                    nextStart &&
                                    nextEnd &&
                                    rescheduleSession.mutate({
                                      sessionId: session.id,
                                      expectedVersion: session.version,
                                      startAt: nextStart.toISOString(),
                                      endAt: nextEnd.toISOString(),
                                      reason: edit.reason.trim(),
                                    })
                                  }
                                >
                                  {rescheduleSession.isPending
                                    ? "Updating schedule…"
                                    : "Update session time"}
                                </Button>
                              </div>
                            );
                          })}
                      </section>
                    ) : null}
                    {record.sessions.some(
                      (session) => session.state === "scheduled",
                    ) ? (
                      <section
                        className="mt-4 space-y-3"
                        aria-label="Same-time tutor replacement"
                      >
                        <Heading level={3} size="sm">
                          Same-time tutor replacement
                        </Heading>
                        {record.sessions
                          .filter((session) => session.state === "scheduled")
                          .map((session) => (
                            <div
                              key={session.id}
                              className="grid min-w-0 gap-3 rounded-md border border-border p-3 sm:grid-cols-2"
                            >
                              <Text className="sm:col-span-2">
                                {session.titleEn} ·{" "}
                                {session.tutor?.name ?? "Current tutor"}
                                {session.tutorAbsence
                                  ? " · Absence reported"
                                  : ""}
                              </Text>
                              <Field>
                                <FieldLabel
                                  htmlFor={`replacement-${session.id}`}
                                >
                                  Replacement tutor
                                </FieldLabel>
                                <Select
                                  value={replacementTutorIds[session.id] ?? ""}
                                  onValueChange={(value) =>
                                    setReplacementTutorIds((current) => ({
                                      ...current,
                                      [session.id]: String(value ?? ""),
                                    }))
                                  }
                                  items={tutors
                                    .filter(
                                      (tutor) =>
                                        tutor.userId !== session.tutorId,
                                    )
                                    .map((tutor) => ({
                                      value: tutor.userId,
                                      label: tutor.user.name,
                                    }))}
                                >
                                  <SelectTrigger
                                    id={`replacement-${session.id}`}
                                  >
                                    <SelectValue placeholder="Choose a published tutor" />
                                  </SelectTrigger>
                                  <SelectPopup>
                                    <SelectList>
                                      {tutors
                                        .filter(
                                          (tutor) =>
                                            tutor.userId !== session.tutorId,
                                        )
                                        .map((tutor) => (
                                          <SelectItem
                                            key={tutor.userId}
                                            value={tutor.userId}
                                          >
                                            {tutor.user.name}
                                          </SelectItem>
                                        ))}
                                    </SelectList>
                                  </SelectPopup>
                                </Select>
                              </Field>
                              <Field>
                                <FieldLabel
                                  htmlFor={`replacement-reason-${session.id}`}
                                >
                                  Admin reason
                                </FieldLabel>
                                <Input
                                  id={`replacement-reason-${session.id}`}
                                  maxLength={500}
                                  value={replacementReasons[session.id] ?? ""}
                                  onChange={(event) =>
                                    setReplacementReasons((current) => ({
                                      ...current,
                                      [session.id]: event.target.value,
                                    }))
                                  }
                                />
                                <FieldDescription>
                                  This keeps the session time, fee, and student
                                  allocations unchanged. It does not create a
                                  schedule-change exit window.
                                </FieldDescription>
                              </Field>
                              <Button
                                type="button"
                                variant="secondary"
                                className="sm:col-span-2"
                                disabled={
                                  replaceAbsentTutor.isPending ||
                                  !replacementTutorIds[session.id] ||
                                  (replacementReasons[session.id] ?? "").trim()
                                    .length < 3
                                }
                                onClick={() =>
                                  replaceAbsentTutor.mutate({
                                    sessionId: session.id,
                                    expectedVersion: session.version,
                                    replacementTutorId:
                                      replacementTutorIds[session.id]!,
                                    reason:
                                      replacementReasons[session.id]!.trim(),
                                  })
                                }
                              >
                                Replace tutor
                              </Button>
                            </div>
                          ))}
                      </section>
                    ) : null}
                    {absenceNotices.length > 0 ? (
                      <section
                        className="mt-4 space-y-2"
                        aria-label="Tutor absence notices"
                      >
                        <Heading level={3} size="sm">
                          Tutor absence history ({absenceNotices.length})
                        </Heading>
                        {absenceNotices.map(({ session, notice }) => (
                          <div
                            key={notice.id}
                            className="rounded-md border border-warning-border bg-warning/10 p-3 text-sm"
                          >
                            <Text className="font-medium">
                              {session.titleEn} · {notice.tutor.name ?? "Tutor"}
                              {notice.late ? " · Late notice" : ""}
                            </Text>
                            <Text className="text-muted">
                              Reported{" "}
                              {new Intl.DateTimeFormat("en", {
                                dateStyle: "medium",
                                timeStyle: "short",
                                timeZone: "Asia/Jakarta",
                              }).format(new Date(notice.reportedAt))}{" "}
                              WIB · {notice.reason} ·{" "}
                              {notice.tutorLateNoticeCount} late notice(s) for
                              this tutor
                            </Text>
                          </div>
                        ))}
                      </section>
                    ) : null}
                    <Drawer>
                      <DrawerTrigger
                        render={
                          <Button
                            variant="secondary"
                            className="mt-4"
                            aria-label="Manage class"
                          />
                        }
                      >
                        Manage class
                      </DrawerTrigger>
                      <DrawerPopup direction="right">
                        <DrawerHeader>
                          <div className="min-w-0 flex-1">
                            <DrawerTitle className="wrap-anywhere">
                              {record.titleEn}
                            </DrawerTitle>
                            <DrawerDescription>
                              Manage class schedule, enrollment, and lifecycle.
                            </DrawerDescription>
                          </div>
                          <DrawerClose aria-label="Close class management">
                            Close
                          </DrawerClose>
                        </DrawerHeader>
                        <DrawerBody>
                          <div className="space-y-4 pb-4">
                            <ClassAdminCancellationPanel
                              classId={record.id}
                              expectedVersion={record.version}
                              onChanged={() =>
                                Promise.all([
                                  queryClient.invalidateQueries({
                                    queryKey: orpc.admin.listAcademyClasses.key(
                                      {
                                        input: { state: "published" },
                                      },
                                    ),
                                  }),
                                  queryClient.invalidateQueries({
                                    queryKey: orpc.admin.listAcademyClasses.key(
                                      {
                                        input: { state: "postponed" },
                                      },
                                    ),
                                  }),
                                ])
                              }
                            />
                            <ClassAdminLifecyclePanel
                              classRecord={record}
                              onChanged={() =>
                                Promise.all([
                                  queryClient.invalidateQueries({
                                    queryKey: orpc.admin.listAcademyClasses.key(
                                      {
                                        input: { state: "published" },
                                      },
                                    ),
                                  }),
                                  queryClient.invalidateQueries({
                                    queryKey: orpc.admin.listAcademyClasses.key(
                                      {
                                        input: { state: "postponed" },
                                      },
                                    ),
                                  }),
                                ])
                              }
                            />
                          </div>
                        </DrawerBody>
                      </DrawerPopup>
                    </Drawer>
                  </Card>
                );
              })
            )}
          </div>
        </TabsPanel>
        <TabsPanel value="drafts" keepMounted>
          <div className="min-w-0 space-y-6">
            {showDrafts ? (
              <Card>
                <CardHeader>
                  <CardTitle>Draft classes</CardTitle>
                  <CardDescription>
                    Only your team can see these drafts.
                  </CardDescription>
                </CardHeader>
                <CardBody>
                  <Stack direction="column" spacing="sm">
                    {classesQuery.isLoading ? (
                      <Loader />
                    ) : classesQuery.isError ? (
                      <Text className="text-danger-foreground">
                        Draft classes could not be loaded. Refresh to try again.
                      </Text>
                    ) : classes.length === 0 ? (
                      <EmptyState
                        icon={<IconInbox />}
                        title="No class drafts yet."
                        description="Create a class draft to start planning your next class."
                        size="compact"
                      />
                    ) : (
                      classes.map((record) => (
                        <div
                          key={record.id}
                          className="flex min-w-0 items-start justify-between gap-3 rounded-lg border border-item-border bg-item p-3"
                        >
                          <div className="min-w-0">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <Text className="font-medium">
                                {record.titleEn}
                              </Text>
                              <Badge variant="secondary">{record.kind}</Badge>
                            </div>
                            <Text className="text-muted text-sm">
                              {record.sessions.length} session
                              {record.sessions.length === 1 ? "" : "s"} ·{" "}
                              {record.competition.name}
                            </Text>
                          </div>
                          <Button
                            type="button"
                            variant="plain"
                            size="sm"
                            disabled={coverUploading}
                            aria-label={`Edit ${record.titleEn}`}
                            onClick={() => {
                              setForm(draftFromRecord(record));
                              setShowDrafts(false);
                              setCoverPreviewUrl(null);
                            }}
                          >
                            <IconEdit />
                          </Button>
                        </div>
                      ))
                    )}
                  </Stack>
                </CardBody>
              </Card>
            ) : (
              <form onSubmit={submitDraft} className="min-w-0 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {form.id ? "Edit class draft" : "New class draft"}
                    </CardTitle>
                  </CardHeader>
                  <CardBody>
                    <div className="flex min-w-0 flex-col gap-5">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="class-kind">
                            Class type
                          </FieldLabel>
                          <Select
                            value={form.kind}
                            onValueChange={(value) =>
                              changeKind(String(value) as ClassKind)
                            }
                            items={[
                              { value: "cohort", label: "Cohort" },
                              { value: "masterclass", label: "Masterclass" },
                            ]}
                          >
                            <SelectTrigger id="class-kind">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectPopup>
                              <SelectList>
                                <SelectItem value="cohort">Cohort</SelectItem>
                                <SelectItem value="masterclass">
                                  Masterclass
                                </SelectItem>
                              </SelectList>
                            </SelectPopup>
                          </Select>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="class-competition">
                            Competition
                          </FieldLabel>
                          <Select
                            value={form.competitionId}
                            onValueChange={(value) =>
                              updateForm("competitionId", String(value ?? ""))
                            }
                            items={competitions.map((competition) => ({
                              value: competition.id,
                              label: competition.name,
                            }))}
                          >
                            <SelectTrigger id="class-competition">
                              <SelectValue placeholder="Choose a competition" />
                            </SelectTrigger>
                            <SelectPopup>
                              <SelectList>
                                {competitions.map((competition) => (
                                  <SelectItem
                                    key={competition.id}
                                    value={competition.id}
                                  >
                                    {competition.parent
                                      ? `${competition.parent.name} · ${competition.name}`
                                      : competition.name}
                                  </SelectItem>
                                ))}
                              </SelectList>
                            </SelectPopup>
                          </Select>
                        </Field>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextField
                          id="class-title-en"
                          label="Title (English)"
                          value={form.titleEn}
                          onChange={(value) => updateForm("titleEn", value)}
                          required
                          maxLength={200}
                        />
                        <TextField
                          id="class-title-id"
                          label="Title (Indonesian, optional)"
                          value={form.titleId}
                          onChange={(value) => updateForm("titleId", value)}
                          maxLength={200}
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextareaField
                          id="class-description-en"
                          label="Description (English)"
                          value={form.descriptionEn}
                          onChange={(value) =>
                            updateForm("descriptionEn", value)
                          }
                          required
                          maxLength={5_000}
                        />
                        <TextareaField
                          id="class-description-id"
                          label="Description (Indonesian, optional)"
                          value={form.descriptionId}
                          onChange={(value) =>
                            updateForm("descriptionId", value)
                          }
                          maxLength={5_000}
                        />
                      </div>
                      <Field>
                        <FieldLabel htmlFor="class-cover">
                          Cover image
                        </FieldLabel>
                        <Input
                          id="class-cover"
                          type="file"
                          accept={COVER_IMAGE_TYPES.join(",")}
                          disabled={coverUploading}
                          onChange={(event) => void uploadCover(event)}
                        />
                        <FieldDescription>
                          {coverUploading
                            ? "Uploading cover image…"
                            : "PNG, JPEG, WebP, or GIF up to 5 MB. Upload the approved class cover asset."}
                        </FieldDescription>
                        <Text className="text-muted text-sm">
                          {form.coverKey
                            ? "A cover image is attached to this draft. Save to keep it."
                            : "No cover image is attached yet."}
                        </Text>
                        {coverPreviewUrl ? (
                          <img
                            src={coverPreviewUrl}
                            alt=""
                            className="mt-2 aspect-video max-h-48 w-full rounded-lg border border-card-border object-cover"
                          />
                        ) : null}
                      </Field>
                    </div>
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Pricing &amp; enrollment</CardTitle>
                    <CardDescription>
                      Set session rates and the minimum enrollment check.
                    </CardDescription>
                  </CardHeader>
                  <CardBody className="flex min-w-0 flex-col gap-5">
                    <div className="grid items-start gap-4 sm:grid-cols-2">
                      <NumberField
                        id="class-tutor-fee"
                        label="Flat tutor fee per session (IDR)"
                        value={form.tutorFeeIdr}
                        onChange={(value) => updateForm("tutorFeeIdr", value)}
                        min={1}
                        max={2_000_000_000}
                        description={
                          form.kind === "cohort"
                            ? "Default: Rp400,000. Set the agreed fee for this class; applies to every session in either delivery mode."
                            : "Default: Rp300,000 for the single masterclass session."
                        }
                      />
                      {form.kind === "cohort" ? (
                        <NumberField
                          id="class-minimum-enrollment"
                          label="Minimum full/half-plan students"
                          value={form.minimumEnrollment}
                          onChange={(value) =>
                            updateForm("minimumEnrollment", value)
                          }
                        />
                      ) : (
                        <NumberField
                          id="class-masterclass-rate"
                          label="Seat price (Marks)"
                          value={form.masterclassRateMarks}
                          onChange={(value) =>
                            updateForm("masterclassRateMarks", value)
                          }
                          description="Default: 5 Marks for the single session."
                        />
                      )}
                    </div>
                    {form.kind === "cohort" ? (
                      <div className="flex flex-col gap-4">
                        <div className="grid items-start gap-4">
                          <TextField
                            id="class-minimum-check-at"
                            label="Minimum-enrollment check date"
                            type="datetime-local"
                            value={form.minimumCheckAt}
                            onChange={(value) =>
                              updateForm("minimumCheckAt", value)
                            }
                            required
                          />
                          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-4">
                            <NumberField
                              id="class-full-rate"
                              label="Full plan · Marks/session"
                              value={form.fullRateMarks}
                              onChange={(value) =>
                                updateForm("fullRateMarks", value)
                              }
                              description="Default 20"
                            />
                            <NumberField
                              id="class-half-rate"
                              label="Half plan · Marks/session"
                              value={form.halfRateMarks}
                              onChange={(value) =>
                                updateForm("halfRateMarks", value)
                              }
                              description="Default 22"
                            />
                            <NumberField
                              id="class-single-rate"
                              label="Single session · Marks"
                              value={form.singleRateMarks}
                              onChange={(value) =>
                                updateForm("singleRateMarks", value)
                              }
                              description="Default 25"
                            />
                          </div>
                        </div>
                        <Text className="text-muted text-sm">
                          The minimum counts unique active full/half-plan
                          students. Single-session buyers do not count.
                        </Text>
                      </div>
                    ) : null}
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle id="class-sessions-heading">Sessions</CardTitle>
                    <CardDescription>
                      Each session has its own tutor, capacity, delivery mode,
                      and schedule.
                    </CardDescription>
                  </CardHeader>
                  <CardBody className="space-y-5">
                    <Accordion
                      multiple
                      value={openSessions}
                      onValueChange={(values) =>
                        setOpenSessions(
                          values.filter(
                            (value): value is number =>
                              typeof value === "number",
                          ),
                        )
                      }
                      onInvalidCapture={() =>
                        setOpenSessions(form.sessions.map((_, index) => index))
                      }
                    >
                      {form.sessions.map((session, index) => (
                        <AccordionItem
                          key={session.id ?? `new-${index}`}
                          value={index}
                        >
                          <AccordionHeader render={<h3 />}>
                            <AccordionTrigger type="button" className="py-2">
                              <span className="flex size-9 shrink-0 items-center justify-center rounded bg-accent tabular-nums">
                                <span className="sr-only">Session </span>
                                {index + 1}
                              </span>
                              <span className="min-w-0 flex-1 wrap-anywhere font-semibold">
                                {session.titleEn || `Session ${index + 1}`}
                              </span>
                            </AccordionTrigger>
                          </AccordionHeader>
                          <AccordionPanel keepMounted>
                            <div className="space-y-4 px-0.5 pt-0.5 pb-3">
                              <div className="grid gap-4 sm:grid-cols-2">
                                <TextField
                                  id={`session-${index}-title-en`}
                                  label="Session title (English)"
                                  value={session.titleEn}
                                  onChange={(value) =>
                                    updateSession(index, { titleEn: value })
                                  }
                                  required
                                  maxLength={200}
                                />
                                <TextField
                                  id={`session-${index}-title-id`}
                                  label="Session title (Indonesian, optional)"
                                  value={session.titleId}
                                  onChange={(value) =>
                                    updateSession(index, { titleId: value })
                                  }
                                  maxLength={200}
                                />
                              </div>
                              {form.kind === "cohort" ? (
                                <div className="grid gap-4 sm:grid-cols-2">
                                  <TextareaField
                                    id={`session-${index}-curriculum-en`}
                                    label="Curriculum description (English)"
                                    value={session.curriculumEn}
                                    onChange={(value) =>
                                      updateSession(index, {
                                        curriculumEn: value,
                                      })
                                    }
                                    required
                                    maxLength={5_000}
                                  />
                                  <TextareaField
                                    id={`session-${index}-curriculum-id`}
                                    label="Curriculum description (Indonesian, optional)"
                                    value={session.curriculumId}
                                    onChange={(value) =>
                                      updateSession(index, {
                                        curriculumId: value,
                                      })
                                    }
                                    maxLength={5_000}
                                  />
                                </div>
                              ) : null}
                              <div className="grid gap-4 sm:grid-cols-2">
                                <TextField
                                  id={`session-${index}-start`}
                                  label="Start"
                                  type="datetime-local"
                                  value={session.startAt}
                                  onChange={(value) =>
                                    updateSession(index, { startAt: value })
                                  }
                                  required
                                />
                                <NumberField
                                  id={`session-${index}-duration`}
                                  label="Duration (minutes)"
                                  description="End time is calculated from the start time and duration."
                                  value={session.durationMinutes}
                                  onChange={(value) =>
                                    updateSession(index, {
                                      durationMinutes: value,
                                    })
                                  }
                                  required
                                />
                              </div>
                              <div className="grid gap-4 sm:grid-cols-2">
                                <NumberField
                                  id={`session-${index}-capacity`}
                                  label="Session capacity"
                                  value={session.capacity}
                                  onChange={(value) =>
                                    updateSession(index, { capacity: value })
                                  }
                                />
                                <Field>
                                  <FieldLabel htmlFor={`session-${index}-mode`}>
                                    Delivery mode
                                  </FieldLabel>
                                  <Select
                                    value={session.mode}
                                    onValueChange={(value) =>
                                      updateSession(index, {
                                        mode: String(value) as SessionMode,
                                        roomId:
                                          String(value) === "in_person"
                                            ? session.roomId
                                            : "",
                                      })
                                    }
                                    items={[
                                      { value: "online", label: "Online" },
                                      {
                                        value: "in_person",
                                        label: "In person",
                                      },
                                    ]}
                                  >
                                    <SelectTrigger id={`session-${index}-mode`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectPopup>
                                      <SelectList>
                                        <SelectItem value="online">
                                          Online
                                        </SelectItem>
                                        <SelectItem value="in_person">
                                          In person
                                        </SelectItem>
                                      </SelectList>
                                    </SelectPopup>
                                  </Select>
                                </Field>
                              </div>
                              <div className="grid gap-4 sm:grid-cols-2">
                                <Field>
                                  <FieldLabel
                                    htmlFor={`session-${index}-tutor`}
                                  >
                                    Published tutor
                                  </FieldLabel>
                                  <Select
                                    value={session.tutorId}
                                    onValueChange={(value) =>
                                      updateSession(index, {
                                        tutorId: String(value ?? ""),
                                      })
                                    }
                                    items={tutors.map((tutor) => ({
                                      value: tutor.userId,
                                      label: tutor.user.name,
                                    }))}
                                  >
                                    <SelectTrigger
                                      id={`session-${index}-tutor`}
                                    >
                                      <SelectValue placeholder="Choose a tutor" />
                                    </SelectTrigger>
                                    <SelectPopup>
                                      <SelectList>
                                        {tutors.map((tutor) => (
                                          <SelectItem
                                            key={tutor.userId}
                                            value={tutor.userId}
                                          >
                                            {tutor.user.name}
                                          </SelectItem>
                                        ))}
                                      </SelectList>
                                    </SelectPopup>
                                  </Select>
                                </Field>
                                {session.mode === "in_person" ? (
                                  <Field>
                                    <FieldLabel
                                      htmlFor={`session-${index}-room`}
                                    >
                                      <span className="inline-flex items-center gap-1">
                                        <IconMapPin className="size-4" />
                                        Managed room
                                      </span>
                                    </FieldLabel>
                                    <Select
                                      value={session.roomId}
                                      onValueChange={(value) =>
                                        updateSession(index, {
                                          roomId: String(value ?? ""),
                                        })
                                      }
                                      items={rooms.map((room) => ({
                                        value: room.id,
                                        label: `${room.name} · ${room.location}`,
                                      }))}
                                    >
                                      <SelectTrigger
                                        id={`session-${index}-room`}
                                      >
                                        <SelectValue placeholder="Choose a room" />
                                      </SelectTrigger>
                                      <SelectPopup>
                                        <SelectList>
                                          {rooms.map((room) => (
                                            <SelectItem
                                              key={room.id}
                                              value={room.id}
                                            >
                                              {room.name} · {room.location} ·
                                              capacity {room.capacity}
                                            </SelectItem>
                                          ))}
                                        </SelectList>
                                      </SelectPopup>
                                    </Select>
                                  </Field>
                                ) : null}
                              </div>
                              {form.kind === "cohort" ? (
                                <div className="flex min-h-9 items-center justify-between gap-3">
                                  {index === form.sessions.length - 1 ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setOpenSessions((current) => [
                                          ...current,
                                          form.sessions.length,
                                        ]);
                                        updateForm("sessions", [
                                          ...form.sessions,
                                          emptySession(),
                                        ]);
                                      }}
                                    >
                                      <IconPlus aria-hidden="true" />
                                      Add session
                                    </Button>
                                  ) : (
                                    <span aria-hidden="true" />
                                  )}
                                  <Button
                                    type="button"
                                    variant="plain"
                                    size="xs-icon"
                                    disabled={form.sessions.length <= 1}
                                    aria-label={`Remove session ${index + 1}`}
                                    onClick={() =>
                                      updateForm(
                                        "sessions",
                                        form.sessions.filter(
                                          (_, i) => i !== index,
                                        ),
                                      )
                                    }
                                  >
                                    <IconTrash aria-hidden="true" />
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          </AccordionPanel>
                        </AccordionItem>
                      ))}
                    </Accordion>

                    <Field>
                      <FieldLabel htmlFor="class-audit-reason">
                        Reason for this change
                      </FieldLabel>
                      <Textarea
                        id="class-audit-reason"
                        required
                        minLength={3}
                        maxLength={500}
                        value={form.reason}
                        onChange={(event) =>
                          updateForm("reason", event.target.value)
                        }
                        rows={2}
                      />
                      <FieldDescription>
                        Saved with the admin actor and before/after snapshot.
                      </FieldDescription>
                    </Field>
                  </CardBody>
                  <CardFooter className="flex-wrap justify-end gap-3">
                    {form.id ? (
                      <Button
                        type="submit"
                        name="class-action"
                        value="publish"
                        disabled={
                          saveDraft.isPending ||
                          publishClass.isPending ||
                          coverUploading
                        }
                      >
                        {publishClass.isPending
                          ? "Publishing…"
                          : "Publish class"}
                      </Button>
                    ) : null}
                    {form.id ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={
                          coverUploading ||
                          saveDraft.isPending ||
                          publishClass.isPending
                        }
                        onClick={() => {
                          setForm(emptyDraft());
                          setCoverPreviewUrl(null);
                        }}
                      >
                        Cancel edit
                      </Button>
                    ) : null}
                    <Button
                      type="submit"
                      disabled={
                        saveDraft.isPending ||
                        publishClass.isPending ||
                        coverUploading
                      }
                    >
                      <IconDeviceFloppy />
                      {saveDraft.isPending ? "Saving…" : "Save draft"}
                    </Button>
                  </CardFooter>
                </Card>
              </form>
            )}
          </div>
        </TabsPanel>
      </Tabs>
    </Stack>
  );
}
