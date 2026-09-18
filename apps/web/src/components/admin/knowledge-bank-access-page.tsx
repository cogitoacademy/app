"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@cogito-app/ui/components/selia/avatar";
import {
  IconClock,
  IconEdit,
  IconMail,
  IconPlus,
  IconSearch,
  IconShieldCheck,
  IconTrash,
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
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  InputGroup,
  InputGroupAddon,
} from "@cogito-app/ui/components/selia/input-group";
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@cogito-app/ui/components/selia/table";
import { Text } from "@cogito-app/ui/components/selia/text";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { CrossBrowserDateTimeInput } from "@/components/booking/minute-time-input";
import Loader from "@/components/loader";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";

type StatusFilter = "all" | "active" | "expired";

type Grant = {
  id: string;
  userId: string;
  studentName: string;
  studentEmail: string;
  expiresAt: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  status: "active" | "expired";
};

type FormState = {
  email: string;
  expiresAt: string;
  note: string;
};

type StudentSearchResult = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
};

const EMPTY_FORM: FormState = { email: "", expiresAt: "", note: "" };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateTimeLocalValue(date: Date) {
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join("T");
}

function defaultExpiryValue() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  date.setHours(23, 59, 0, 0);
  return toDateTimeLocalValue(date);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function KnowledgeBankAccessPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingGrant, setEditingGrant] = useState<Grant | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Grant | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] =
    useState<StudentSearchResult | null>(null);

  const grantsQuery = useQuery(
    orpc.adminKnowledgeBank.list.queryOptions({
      input: { status: statusFilter },
    }),
  );

  const grants = useMemo(
    () => (grantsQuery.data ?? []) as Grant[],
    [grantsQuery.data],
  );
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedStudentSearch(studentSearch.trim()),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [studentSearch]);

  const studentSearchQuery = useQuery({
    ...orpc.admin.searchUsers.queryOptions({
      input: { query: debouncedStudentSearch || "--", limit: 10 },
    }),
    enabled: formOpen && !editingGrant && debouncedStudentSearch.length >= 2,
    retry: 1,
  });
  const studentResults = useMemo(
    () =>
      (studentSearchQuery.data ?? []).filter(
        (candidate) => candidate.role === "student",
      ),
    [studentSearchQuery.data],
  );
  const showStudentSearchResults =
    !editingGrant && !selectedStudent && studentSearch.trim().length >= 2;
  const canSelectStudent =
    !studentSearchQuery.isFetching &&
    debouncedStudentSearch === studentSearch.trim();
  const visibleGrants = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return grants;
    return grants.filter(
      (grant) =>
        grant.studentName.toLowerCase().includes(query) ||
        grant.studentEmail.toLowerCase().includes(query),
    );
  }, [grants, search]);

  async function invalidateGrants() {
    await queryClient.invalidateQueries({
      queryKey: orpc.adminKnowledgeBank.list.key(),
    });
  }

  const createMutation = useMutation(
    orpc.adminKnowledgeBank.create.mutationOptions({
      onSuccess: async () => {
        await invalidateGrants();
        setFormOpen(false);
        toastManager.add({
          title: "Knowledge Bank access granted",
          description:
            "The student can access the Knowledge Bank until the selected expiry.",
          type: "success",
        });
      },
      onError: (error: unknown) => {
        setFormError(
          getUserFacingError(error, "Could not grant Knowledge Bank access."),
        );
      },
    }),
  );

  const updateMutation = useMutation(
    orpc.adminKnowledgeBank.update.mutationOptions({
      onSuccess: async () => {
        await invalidateGrants();
        setFormOpen(false);
        toastManager.add({
          title: "Knowledge Bank access updated",
          type: "success",
        });
      },
      onError: (error: unknown) => {
        setFormError(
          getUserFacingError(error, "Could not update Knowledge Bank access."),
        );
      },
    }),
  );

  const removeMutation = useMutation(
    orpc.adminKnowledgeBank.remove.mutationOptions({
      onSuccess: async () => {
        await invalidateGrants();
        setRemoveTarget(null);
        toastManager.add({
          title: "Knowledge Bank access removed",
          description:
            "The student must meet the normal Marks threshold again.",
          type: "success",
        });
      },
      onError: (error: unknown) => {
        toastManager.add({
          title: "Access could not be removed",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function openCreate() {
    setEditingGrant(null);
    setForm({ ...EMPTY_FORM, expiresAt: defaultExpiryValue() });
    setFormError(null);
    setStudentSearch("");
    setDebouncedStudentSearch("");
    setSelectedStudent(null);
    setFormOpen(true);
  }

  function openEdit(grant: Grant) {
    setEditingGrant(grant);
    setForm({
      email: grant.studentEmail,
      expiresAt: toDateTimeLocalValue(new Date(grant.expiresAt)),
      note: grant.note ?? "",
    });
    setFormError(null);
    setStudentSearch("");
    setDebouncedStudentSearch("");
    setSelectedStudent(null);
    setFormOpen(true);
  }

  function closeForm(open: boolean) {
    setFormOpen(open);
    if (!open) {
      setFormError(null);
      setForm(EMPTY_FORM);
      setEditingGrant(null);
      setStudentSearch("");
      setDebouncedStudentSearch("");
      setSelectedStudent(null);
    }
  }

  function selectStudent(student: StudentSearchResult) {
    setSelectedStudent(student);
    setStudentSearch("");
    setDebouncedStudentSearch("");
    setForm((current) => ({ ...current, email: student.email }));
  }

  function clearSelectedStudent() {
    setSelectedStudent(null);
    setForm((current) => ({ ...current, email: "" }));
  }

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const expiry = new Date(form.expiresAt);
    if (!form.expiresAt || Number.isNaN(expiry.getTime())) {
      setFormError("Choose a valid expiry date and time.");
      return;
    }
    if (!editingGrant && !selectedStudent) {
      setFormError("Choose a student from the search results.");
      return;
    }
    if (expiry.getTime() <= Date.now()) {
      setFormError("Expiry must be in the future.");
      return;
    }

    const expiresAt = expiry.toISOString();
    if (editingGrant) {
      updateMutation.mutate({
        id: editingGrant.id,
        expiresAt,
        note: form.note,
      });
    } else {
      createMutation.mutate({
        email: form.email,
        expiresAt,
        note: form.note,
      });
    }
  }

  if (grantsQuery.isPending) return <Loader />;

  if (grantsQuery.isError) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
          <IconBox variant="danger-subtle" size="lg">
            <IconShieldCheck />
          </IconBox>
          <Heading size="sm">Access grants unavailable</Heading>
          <Text className="max-w-md text-muted">
            {getUserFacingError(
              grantsQuery.error,
              "We could not load Knowledge Bank access grants.",
            )}
          </Text>
          <Button onClick={() => void grantsQuery.refetch()}>Try again</Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <Stack direction="column" spacing="lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Heading level={1} size="md">
              Knowledge Bank access
            </Heading>
            <Text className="mt-1 max-w-2xl text-muted">
              Give selected students temporary access when their legacy
              membership or package predates the Marks gate. Access closes
              automatically at the expiry time.
            </Text>
          </div>
          <Button onClick={openCreate}>
            <IconPlus />
            Add student access
          </Button>
        </div>

        <Card className="w-full min-w-0 max-w-full overflow-hidden">
          <CardHeader>
            <IconBox variant="info-subtle">
              <IconShieldCheck />
            </IconBox>
            <CardTitle>Temporary exceptions</CardTitle>
            <CardDescription>
              Expired grants stay visible for reference but no longer bypass the
              35-Mark requirement.
            </CardDescription>
          </CardHeader>
          <CardBody className="min-w-0 max-w-full p-0!">
            <div className="flex flex-col gap-3 p-6 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by student name or email"
                  aria-label="Search Knowledge Bank access grants"
                  className="pl-9"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  if (
                    value === "all" ||
                    value === "active" ||
                    value === "expired"
                  ) {
                    setStatusFilter(value);
                  }
                }}
              >
                <SelectTrigger
                  className="sm:w-44"
                  aria-label="Filter access grants"
                >
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectPopup>
                  <SelectList>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="all">All grants</SelectItem>
                  </SelectList>
                </SelectPopup>
              </Select>
            </div>

            {visibleGrants.length === 0 ? (
              <div className="mx-6 mb-6 rounded-lg border border-dashed border-item-border px-6 py-12 text-center">
                <IconMail className="mx-auto size-8 text-muted" />
                <Text className="mt-3 font-medium">
                  {search ? "No matching students" : "No access grants yet"}
                </Text>
                <Text className="mt-1 text-sm text-muted">
                  {search
                    ? "Try another name or email."
                    : "Add a student email to create the first temporary exception."}
                </Text>
              </div>
            ) : (
              <div className="min-w-0 max-w-full overflow-hidden">
                <TableContainer className="min-w-0">
                  <Table className="min-w-[48rem]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Access until</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleGrants.map((grant) => (
                        <TableRow key={grant.id}>
                          <TableCell>
                            <div className="min-w-48">
                              <Text className="font-medium">
                                {grant.studentName}
                              </Text>
                              <Text className="mt-0.5 text-sm text-muted">
                                {grant.studentEmail}
                              </Text>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Text className="flex items-center gap-2 whitespace-nowrap text-sm">
                              <IconClock className="size-4 text-muted" />
                              {formatDateTime(grant.expiresAt)}
                            </Text>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                grant.status === "active"
                                  ? "success"
                                  : "secondary"
                              }
                            >
                              {grant.status === "active" ? "Active" : "Expired"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Text className="max-w-56 text-sm text-muted">
                              {grant.note || "—"}
                            </Text>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="plain"
                                size="sm-icon"
                                onClick={() => openEdit(grant)}
                                aria-label={`Edit access for ${grant.studentEmail}`}
                                title="Edit access"
                              >
                                <IconEdit />
                              </Button>
                              <Button
                                variant="plain"
                                size="sm-icon"
                                onClick={() => setRemoveTarget(grant)}
                                aria-label={`Remove access for ${grant.studentEmail}`}
                                title="Remove access"
                                className="text-danger"
                              >
                                <IconTrash />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>
            )}
          </CardBody>
        </Card>
      </Stack>

      <Dialog open={formOpen} onOpenChange={closeForm}>
        <DialogPopup>
          <DialogHeader className="items-start">
            <div className="min-w-0">
              <DialogTitle>
                {editingGrant
                  ? "Edit Knowledge Bank access"
                  : "Add Knowledge Bank access"}
              </DialogTitle>
              <DialogDescription>
                This exception bypasses the student Marks threshold only until
                the selected time.
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogBody>
            <form
              id="knowledge-bank-access-form"
              className="flex flex-col gap-4"
              onSubmit={submitForm}
            >
              <Field>
                <FieldLabel
                  htmlFor={
                    editingGrant
                      ? "knowledge-bank-access-email"
                      : "knowledge-bank-access-student-search"
                  }
                >
                  Student email
                </FieldLabel>
                {editingGrant ? (
                  <Input
                    id="knowledge-bank-access-email"
                    type="email"
                    value={form.email}
                    disabled
                    required
                  />
                ) : (
                  <>
                    {selectedStudent ? (
                      <div className="flex items-center gap-3 rounded border border-item-border bg-item p-2.5">
                        <Avatar size="sm" className="size-8">
                          <AvatarImage
                            src={selectedStudent.image ?? undefined}
                            alt=""
                          />
                          <AvatarFallback>
                            {selectedStudent.name.slice(0, 1).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <Text className="truncate text-sm font-medium">
                            {selectedStudent.name}
                          </Text>
                          <Text className="truncate text-xs text-muted">
                            {selectedStudent.email}
                          </Text>
                        </div>
                        <Button
                          type="button"
                          variant="plain"
                          size="sm-icon"
                          aria-label="Change selected student"
                          onClick={clearSelectedStudent}
                        >
                          <IconX aria-hidden="true" />
                        </Button>
                      </div>
                    ) : null}
                    <div className="relative">
                      <InputGroup className="min-w-0">
                        <InputGroupAddon>
                          <IconSearch aria-hidden="true" />
                        </InputGroupAddon>
                        <Input
                          id="knowledge-bank-access-student-search"
                          name="student-search"
                          autoComplete="off"
                          role="combobox"
                          aria-autocomplete="list"
                          aria-expanded={showStudentSearchResults}
                          aria-controls={
                            showStudentSearchResults
                              ? "knowledge-bank-student-results"
                              : undefined
                          }
                          value={studentSearch}
                          onChange={(event) => {
                            setSelectedStudent(null);
                            setStudentSearch(event.target.value);
                            setForm((current) => ({
                              ...current,
                              email: "",
                            }));
                          }}
                          onKeyDown={(event) => {
                            if (
                              event.key !== "Enter" ||
                              !canSelectStudent ||
                              !studentResults[0]
                            )
                              return;
                            event.preventDefault();
                            selectStudent(studentResults[0]);
                          }}
                          placeholder="Type a name or email…"
                        />
                      </InputGroup>
                      {showStudentSearchResults ? (
                        <div
                          id="knowledge-bank-student-results"
                          role="listbox"
                          aria-label="Student search results"
                          className="absolute inset-x-0 top-full z-30 mt-2 rounded border border-popover-border bg-popover p-1.5 text-popover-foreground shadow-popover"
                        >
                          {studentSearchQuery.isFetching ||
                          debouncedStudentSearch !== studentSearch.trim() ? (
                            <Text className="px-2.5 py-2 text-sm text-muted">
                              Searching students…
                            </Text>
                          ) : studentSearchQuery.isError ? (
                            <div className="flex items-center justify-between gap-3 p-1">
                              <Text className="text-sm text-danger">
                                Student search is temporarily unavailable.
                              </Text>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                  void studentSearchQuery.refetch()
                                }
                              >
                                Try again
                              </Button>
                            </div>
                          ) : (
                            <>
                              {studentResults.map((student) => (
                                <Button
                                  key={student.id}
                                  type="button"
                                  variant="plain"
                                  role="option"
                                  aria-selected={false}
                                  className="h-auto w-full justify-start gap-3 px-2.5 py-2"
                                  onClick={() => selectStudent(student)}
                                >
                                  <Avatar size="sm" className="size-7">
                                    <AvatarImage
                                      src={student.image ?? undefined}
                                      alt=""
                                    />
                                    <AvatarFallback className="text-xs">
                                      {student.name.slice(0, 1).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="min-w-0 text-left">
                                    <span className="block truncate text-sm font-medium">
                                      {student.name}
                                    </span>
                                    <span className="block truncate text-xs text-muted">
                                      {student.email}
                                    </span>
                                  </span>
                                </Button>
                              ))}
                              {studentResults.length === 0 ? (
                                <Text className="px-2.5 py-2 text-sm text-muted">
                                  No matching students. Try a different name or
                                  email.
                                </Text>
                              ) : null}
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
                <FieldDescription>
                  {editingGrant
                    ? "The student account cannot be changed after access is created."
                    : "Search by student name or email, then select the matching student account."}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="knowledge-bank-access-expires-at-date">
                  Access expires
                </FieldLabel>
                <CrossBrowserDateTimeInput
                  id="knowledge-bank-access-expires-at"
                  value={form.expiresAt}
                  min={toDateTimeLocalValue(new Date())}
                  timeAriaLabel="Access expiry time"
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      expiresAt: value,
                    }))
                  }
                />
                <FieldDescription>
                  Choose a date and time in your device's local timezone. New
                  grants default to 23:59.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="knowledge-bank-access-note">
                  Internal note (optional)
                </FieldLabel>
                <Textarea
                  id="knowledge-bank-access-note"
                  value={form.note}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  placeholder="Legacy membership / package purchased before launch"
                  maxLength={500}
                />
              </Field>
              {formError ? (
                <Text className="text-sm text-danger" role="alert">
                  {formError}
                </Text>
              ) : null}
            </form>
          </DialogBody>
          <DialogFooter>
            <DialogClose disabled={isSaving}>Cancel</DialogClose>
            <Button
              type="submit"
              form="knowledge-bank-access-form"
              progress={isSaving}
              disabled={
                isSaving ||
                (!editingGrant && !selectedStudent) ||
                !form.email ||
                !form.expiresAt
              }
            >
              {editingGrant ? "Save changes" : "Grant access"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !removeMutation.isPending) setRemoveTarget(null);
        }}
      >
        <DialogPopup>
          <DialogHeader className="items-start">
            <div>
              <DialogTitle>Remove Knowledge Bank access?</DialogTitle>
              <DialogDescription>
                {removeTarget?.studentEmail} will need to meet the normal
                35-Mark requirement again immediately.
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogFooter>
            <DialogClose disabled={removeMutation.isPending}>
              Cancel
            </DialogClose>
            <Button
              variant="danger"
              progress={removeMutation.isPending}
              disabled={!removeTarget || removeMutation.isPending}
              onClick={() => {
                if (removeTarget)
                  removeMutation.mutate({ id: removeTarget.id });
              }}
            >
              Remove access
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
