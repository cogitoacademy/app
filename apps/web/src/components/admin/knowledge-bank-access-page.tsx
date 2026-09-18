"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconClock,
  IconEdit,
  IconMail,
  IconPlus,
  IconSearch,
  IconShieldCheck,
  IconTrash,
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
  date.setSeconds(0, 0);
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

  const grantsQuery = useQuery(
    orpc.adminKnowledgeBank.list.queryOptions({
      input: { status: statusFilter },
    }),
  );

  const grants = useMemo(
    () => (grantsQuery.data ?? []) as Grant[],
    [grantsQuery.data],
  );
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
    setFormOpen(true);
  }

  function closeForm(open: boolean) {
    setFormOpen(open);
    if (!open) {
      setFormError(null);
      setForm(EMPTY_FORM);
      setEditingGrant(null);
    }
  }

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const expiry = new Date(form.expiresAt);
    if (!form.expiresAt || Number.isNaN(expiry.getTime())) {
      setFormError("Choose a valid expiry date and time.");
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

        <Card>
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
          <CardBody>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row">
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
              <div className="rounded-lg border border-dashed border-item-border px-6 py-12 text-center">
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
              <TableContainer>
                <Table>
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
                <FieldLabel htmlFor="knowledge-bank-access-email">
                  Student email
                </FieldLabel>
                <Input
                  id="knowledge-bank-access-email"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="student@example.com"
                  disabled={Boolean(editingGrant)}
                  required
                />
                <FieldDescription>
                  The account must already exist and have the student role.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="knowledge-bank-access-expires-at">
                  Access expires
                </FieldLabel>
                <Input
                  id="knowledge-bank-access-expires-at"
                  type="datetime-local"
                  value={form.expiresAt}
                  min={toDateTimeLocalValue(new Date())}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      expiresAt: event.target.value,
                    }))
                  }
                  required
                />
                <FieldDescription>
                  Uses your device's local time.
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
              disabled={isSaving || !form.email || !form.expiresAt}
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
