"use client";

import { IconInbox } from "@tabler/icons-react";
import { EmptyState } from "@/components/empty-state";
import Loader from "@/components/loader";

import { CrossBrowserDateTimeInput } from "@/components/booking/minute-time-input";

import { NumberField as SeliaNumberField } from "@cogito-app/ui/components/selia/number-field";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { FormEvent } from "react";
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
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { getUserFacingError } from "@/lib/error-message";
import { client, orpc } from "@/utils/orpc";

import { mergeAcademyClassQueryResults } from "./academy-class-page-utils";

type ClassRecord = Awaited<
  ReturnType<typeof client.admin.saveAcademyClassDraft>
>;
type ClassKind = "cohort" | "masterclass";
type SessionMode = "online" | "in_person";
type SessionForm = {
  id?: string;
  capacity: string;
  titleEn: string;
  curriculumEn: string;
  startAt: string;
  durationMinutes: string;
  mode: SessionMode;
  roomId: string;
  tutorId: string;
};

type DraftForm = {
  id?: string;
  expectedVersion?: number;
  kind: ClassKind;
  competitionId: string;
  titleEn: string;
  descriptionEn: string;
  tutorFeeIdr: string;
  minimumEnrollment: string;
  minimumCheckAt: string;
  fullRateMarks: string;
  halfRateMarks: string;
  singleRateMarks: string;
  masterclassRateMarks: string;
  sessions: SessionForm[];
};

const emptySession = (): SessionForm => ({
  capacity: "",
  titleEn: "",
  curriculumEn: "",
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
  descriptionEn: "",
  tutorFeeIdr: kind === "cohort" ? "400000" : "300000",
  minimumEnrollment: "",
  minimumCheckAt: "",
  fullRateMarks: "20",
  halfRateMarks: "22",
  singleRateMarks: "25",
  masterclassRateMarks: "5",
  sessions: [emptySession()],
});

function toLocalDateTime(value: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function draftFromRecord(record: ClassRecord): DraftForm {
  return {
    id: record.id,
    expectedVersion: record.version,
    kind: record.kind as ClassKind,
    competitionId: record.competitionId,
    titleEn: record.titleEn,
    descriptionEn: record.descriptionEn,
    tutorFeeIdr: String(record.tutorFeeIdr),
    minimumEnrollment: String(record.minimumEnrollment ?? ""),
    minimumCheckAt: toLocalDateTime(record.minimumCheckAt),
    fullRateMarks: String(record.cohortFullRateMarks ?? ""),
    halfRateMarks: String(record.cohortHalfRateMarks ?? ""),
    singleRateMarks: String(record.cohortSingleRateMarks ?? ""),
    masterclassRateMarks: String(record.masterclassRateMarks ?? ""),
    sessions: record.sessions.map((session) => ({
      id: session.id,
      capacity: String(session.capacity),
      titleEn: session.titleEn,
      curriculumEn: session.curriculumEn ?? "",
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
  const [reasonAction, setReasonAction] = useState<"save" | "publish" | null>(
    null,
  );
  const [actionReason, setActionReason] = useState("");
  const [reasonSubmitting, setReasonSubmitting] = useState(false);
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
  const classes = classesQuery.data ?? [];
  const publishedClasses = mergeAcademyClassQueryResults(
    publishedClassesQuery.data ?? [],
    postponedClassesQuery.data ?? [],
  ).toSorted(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
  const competitions = competitionsQuery.data ?? [];
  const sortedCompetitions = [...competitions].sort((a, b) => {
    const parentA = a.parent?.name ?? a.name;
    const parentB = b.parent?.name ?? b.name;
    return (
      parentA.localeCompare(parentB) ||
      (a.parent ? 1 : b.parent ? -1 : 0) ||
      a.name.localeCompare(b.name)
    );
  });
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

  function draftInputFromForm(reason: string) {
    const sessions = form.sessions.map((session) => ({
      ...(session.id ? { id: session.id } : {}),
      capacity: Number(session.capacity),
      titleEn: session.titleEn,
      curriculumEn: session.curriculumEn,
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
      descriptionEn: form.descriptionEn,
      tutorFeeIdr: Number(form.tutorFeeIdr),
      reason,
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
    return JSON.stringify(form) !== JSON.stringify(draftFromRecord(saved));
  }

  async function publishCurrentDraft(
    input: ReturnType<typeof draftInputFromForm>,
  ) {
    if (!form.id) return false;
    try {
      const saved = hasUnsavedDraftChanges()
        ? await saveDraft.mutateAsync(input)
        : await client.admin.getAcademyClass({ id: form.id });
      await publishClass.mutateAsync({
        id: saved.id,
        expectedVersion: saved.version,
        reason: input.reason,
      });
      return true;
    } catch {
      // Each mutation displays its own actionable error toast.
      return false;
    }
  }

  function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const action =
      submitter instanceof HTMLButtonElement &&
      submitter.name === "class-action" &&
      submitter.value === "publish"
        ? "publish"
        : "save";
    setActionReason("");
    setReasonAction(action);
  }

  async function confirmReasonAction() {
    if (!reasonAction || reasonSubmitting) return;
    const reason = actionReason.trim();
    if (reason.length < 3) return;
    const input = draftInputFromForm(reason);
    setReasonSubmitting(true);
    try {
      const success =
        reasonAction === "publish"
          ? await publishCurrentDraft(input)
          : await saveDraft
              .mutateAsync(input)
              .then(() => true)
              .catch(() => false);
      if (success) {
        setReasonAction(null);
        setActionReason("");
      }
    } finally {
      setReasonSubmitting(false);
    }
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
            className="w-full sm:w-80"
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
              onClick={() => {
                setForm(emptyDraft());
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
                const pendingMeetings =
                  onlineSessions.length -
                  failedMeetings.length -
                  createdMeetings.length;
                return (
                  <Card
                    key={record.id}
                    data-testid={`published-class-${record.id}`}
                    className="min-w-0 p-4 flex flex-col"
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
                    <Button
                      role="link"
                      variant="primary"
                      nativeButton={false}
                      className="mt-4 self-end"
                      render={
                        <Link
                          to="/classes/$classId"
                          params={{ classId: record.id }}
                          aria-label={`View class details for ${record.titleEn}`}
                        />
                      }
                    >
                      View class details
                    </Button>
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
                            aria-label={`Edit ${record.titleEn}`}
                            onClick={() => {
                              setForm(draftFromRecord(record));
                              setShowDrafts(false);
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
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                            items={sortedCompetitions.map((competition) => ({
                              value: competition.id,
                              label: competition.name,
                            }))}
                          >
                            <SelectTrigger id="class-competition">
                              <SelectValue placeholder="Choose a competition" />
                            </SelectTrigger>
                            <SelectPopup>
                              <SelectList className="max-h-56">
                                {sortedCompetitions.map((competition) => (
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
                        <TextField
                          id="class-title-en"
                          label="Title"
                          value={form.titleEn}
                          onChange={(value) => updateForm("titleEn", value)}
                          required
                          maxLength={200}
                        />
                        <TextareaField
                          id="class-description-en"
                          label="Description"
                          value={form.descriptionEn}
                          onChange={(value) =>
                            updateForm("descriptionEn", value)
                          }
                          required
                          maxLength={5_000}
                        />
                      </div>
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
                    <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                      {form.kind === "cohort" ? (
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
                      ) : null}
                    </div>
                    {form.kind === "cohort" ? (
                      <div className="flex flex-col gap-4">
                        <div className="grid items-start gap-4">
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
                              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                <TextField
                                  id={`session-${index}-title-en`}
                                  label="Session title"
                                  value={session.titleEn}
                                  onChange={(value) =>
                                    updateSession(index, { titleEn: value })
                                  }
                                  required
                                  maxLength={200}
                                />
                                {form.kind === "cohort" ? (
                                  <div className="grid gap-4">
                                    <TextareaField
                                      id={`session-${index}-curriculum-en`}
                                      label="Curriculum description"
                                      value={session.curriculumEn}
                                      onChange={(value) =>
                                        updateSession(index, {
                                          curriculumEn: value,
                                        })
                                      }
                                      required
                                      maxLength={5_000}
                                    />
                                  </div>
                                ) : null}
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
                  </CardBody>
                  <CardFooter className="flex-wrap justify-end gap-3">
                    {form.id ? (
                      <Button
                        type="submit"
                        name="class-action"
                        value="publish"
                        disabled={saveDraft.isPending || publishClass.isPending}
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
                        disabled={saveDraft.isPending || publishClass.isPending}
                        onClick={() => {
                          setForm(emptyDraft());
                        }}
                      >
                        Cancel edit
                      </Button>
                    ) : null}
                    <Button
                      type="submit"
                      disabled={saveDraft.isPending || publishClass.isPending}
                    >
                      <IconDeviceFloppy />
                      {saveDraft.isPending ? "Saving…" : "Save draft"}
                    </Button>
                  </CardFooter>
                </Card>
                <ConfirmationDialog
                  open={reasonAction !== null}
                  onOpenChange={(open) => {
                    if (!open) {
                      setReasonAction(null);
                      setActionReason("");
                    }
                  }}
                  title={
                    reasonAction === "publish"
                      ? "Publish this class?"
                      : "Save this draft?"
                  }
                  description={
                    reasonAction === "publish"
                      ? "Publishing makes this class visible in the student catalog."
                      : "This draft is not public and does not reserve a room."
                  }
                  confirmLabel={
                    reasonAction === "publish" ? "Publish class" : "Save draft"
                  }
                  pending={
                    reasonSubmitting ||
                    saveDraft.isPending ||
                    publishClass.isPending
                  }
                  confirmDisabled={actionReason.trim().length < 3}
                  onConfirm={() => void confirmReasonAction()}
                >
                  <Field>
                    <FieldLabel htmlFor="class-audit-reason" required>
                      Reason for this change
                    </FieldLabel>
                    <Textarea
                      id="class-audit-reason"
                      required
                      minLength={3}
                      maxLength={500}
                      value={actionReason}
                      onChange={(event) => setActionReason(event.target.value)}
                      rows={4}
                      aria-required="true"
                      placeholder="Explain what changed and why."
                    />
                    <FieldDescription>
                      Saved with the admin actor and before/after snapshot.
                    </FieldDescription>
                  </Field>
                </ConfirmationDialog>
              </form>
            )}
          </div>
        </TabsPanel>
      </Tabs>
    </Stack>
  );
}
