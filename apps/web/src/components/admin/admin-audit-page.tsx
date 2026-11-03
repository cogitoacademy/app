"use client";

import { useState, type FormEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { IconSearch, IconX } from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { DatePicker } from "@cogito-app/ui/components/selia/date-picker";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerDescription,
  DrawerHeader,
  DrawerPopup,
  DrawerTitle,
} from "@cogito-app/ui/components/selia/drawer";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Input } from "@cogito-app/ui/components/selia/input";
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
import { EmptyState } from "@/components/empty-state";
import Loader from "@/components/loader";
import { TablePagination } from "@/components/table-pagination";
import { getUserFacingError } from "@/lib/error-message";
import { client, orpc } from "@/utils/orpc";

const PAGE_SIZE = 25;

type AuditLogItem = Awaited<
  ReturnType<typeof client.admin.listAuditLogs>
>["items"][number];

type FilterDraft = {
  action: string;
  targetType: string;
  targetId: string;
  actorId: string;
  dateFrom: string;
  dateTo: string;
};

const EMPTY_FILTERS: FilterDraft = {
  action: "",
  targetType: "",
  targetId: "",
  actorId: "",
  dateFrom: "",
  dateTo: "",
};

function toWibStartIso(value: string) {
  return new Date(`${value}T00:00:00+07:00`).toISOString();
}

function toWibEndIso(value: string) {
  return new Date(`${value}T23:59:59.999+07:00`).toISOString();
}

function formatWibDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function describeDetails(details: Record<string, unknown> | null) {
  if (!details) return "No details";
  const keys = Object.keys(details);
  if (keys.length === 0) return "No details";
  const preview = keys.slice(0, 3).join(", ");
  return keys.length > 3 ? `${preview}, +${keys.length - 3} more` : preview;
}

function actorLabel(item: AuditLogItem) {
  if (item.actorName) return item.actorName;
  if (item.actorEmail) return item.actorEmail;
  return item.actorId ? item.actorId : "System";
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <Text className="text-sm text-muted">No state recorded.</Text>;
  }

  return (
    <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-item p-3 font-mono text-xs leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function AdminAuditPage() {
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterDraft>(EMPTY_FILTERS);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [selected, setSelected] = useState<AuditLogItem | null>(null);

  const cursor = pageCursors[page];
  const queryInput = {
    limit: PAGE_SIZE,
    ...(cursor ? { cursor } : {}),
    ...(applied.action ? { action: applied.action } : {}),
    ...(applied.targetType ? { targetType: applied.targetType } : {}),
    ...(applied.targetId ? { targetId: applied.targetId } : {}),
    ...(applied.actorId ? { actorId: applied.actorId } : {}),
    ...(applied.dateFrom ? { dateFrom: toWibStartIso(applied.dateFrom) } : {}),
    ...(applied.dateTo ? { dateTo: toWibEndIso(applied.dateTo) } : {}),
  };
  const logsQuery = useQuery({
    ...orpc.admin.listAuditLogs.queryOptions({ input: queryInput }),
    placeholderData: keepPreviousData,
  });

  function resetPage() {
    setPage(0);
    setPageCursors([undefined]);
  }

  function nextPage() {
    const nextCursor = logsQuery.data?.nextCursor;
    if (!nextCursor) return;

    setPageCursors((current) => {
      const next = current.slice(0, page + 1);
      next.push(nextCursor);
      return next;
    });
    setPage((current) => current + 1);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) {
      setFilterError("The start date cannot be after the end date.");
      return;
    }

    setFilterError(null);
    setApplied({
      action: draft.action.trim(),
      targetType: draft.targetType.trim(),
      targetId: draft.targetId.trim(),
      actorId: draft.actorId.trim(),
      dateFrom: draft.dateFrom,
      dateTo: draft.dateTo,
    });
    resetPage();
  }

  function handleReset() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setFilterError(null);
    setSelected(null);
    resetPage();
  }

  return (
    <Stack direction="column" spacing="lg">
      <div>
        <Heading level={1} size="md">
          Audit log
        </Heading>
        <Text className="max-w-full text-muted">
          Read-only history of recorded admin and system actions, newest first.
        </Text>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardBody>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={handleSubmit}
          >
            <Field className="min-w-52">
              <FieldLabel htmlFor="audit-action">Action</FieldLabel>
              <Input
                id="audit-action"
                type="search"
                value={draft.action}
                maxLength={100}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    action: event.target.value,
                  }))
                }
                placeholder="economy_config_updated"
              />
            </Field>
            <Field className="min-w-48">
              <FieldLabel htmlFor="audit-target-type">Target type</FieldLabel>
              <Input
                id="audit-target-type"
                type="search"
                value={draft.targetType}
                maxLength={100}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    targetType: event.target.value,
                  }))
                }
                placeholder="economy_config"
              />
            </Field>
            <Field className="min-w-44">
              <FieldLabel htmlFor="audit-target-id">Target ID</FieldLabel>
              <Input
                id="audit-target-id"
                type="search"
                value={draft.targetId}
                maxLength={100}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    targetId: event.target.value,
                  }))
                }
              />
            </Field>
            <Field className="min-w-44">
              <FieldLabel htmlFor="audit-actor-id">Actor ID</FieldLabel>
              <Input
                id="audit-actor-id"
                type="search"
                value={draft.actorId}
                maxLength={100}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    actorId: event.target.value,
                  }))
                }
              />
            </Field>
            <Field className="min-w-40">
              <FieldLabel htmlFor="audit-date-from">Date from</FieldLabel>
              <DatePicker
                id="audit-date-from"
                value={draft.dateFrom}
                maxDate={draft.dateTo || undefined}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, dateFrom: value }))
                }
              />
            </Field>
            <Field className="min-w-40">
              <FieldLabel htmlFor="audit-date-to">Date to</FieldLabel>
              <DatePicker
                id="audit-date-to"
                value={draft.dateTo}
                minDate={draft.dateFrom || undefined}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, dateTo: value }))
                }
              />
            </Field>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm">
                Apply filters
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleReset}
              >
                Reset
              </Button>
            </div>
          </form>
          {filterError ? (
            <Field className="mt-3">
              <FieldError>{filterError}</FieldError>
            </Field>
          ) : null}
        </CardBody>
      </Card>

      <Card id="admin-audit-log" className="scroll-mt-4">
        <CardHeader>
          <div>
            <CardTitle>Recorded actions</CardTitle>
            <Text className="mt-1 text-sm text-muted">
              Times shown in WIB (Asia/Jakarta).
            </Text>
          </div>
        </CardHeader>
        <CardBody aria-busy={logsQuery.isFetching}>
          {logsQuery.isPending ? (
            <Loader />
          ) : logsQuery.isError ? (
            <div className="space-y-3">
              <Text className="text-sm text-danger">
                {getUserFacingError(
                  logsQuery.error,
                  "The audit log could not be loaded.",
                )}
              </Text>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void logsQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : logsQuery.data.items.length === 0 ? (
            <EmptyState
              icon={<IconSearch />}
              title={
                page === 0 ? "No audit entries" : "No entries on this page"
              }
              description={
                page === 0
                  ? "No recorded action matches these filters."
                  : "Go back to the previous page to continue browsing."
              }
              tone="secondary"
              size="compact"
            />
          ) : (
            <>
              <TableContainer>
                <Table className="min-w-[60rem] text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-44 whitespace-nowrap">
                        Created
                      </TableHead>
                      <TableHead className="min-w-48">Actor</TableHead>
                      <TableHead className="min-w-56">Action</TableHead>
                      <TableHead className="min-w-48">Target</TableHead>
                      <TableHead className="min-w-48">Details</TableHead>
                      <TableHead className="w-24 text-right">View</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logsQuery.data.items.map((item) => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer"
                        onClick={() => setSelected(item)}
                      >
                        <TableCell className="align-top whitespace-nowrap text-sm">
                          {formatWibDateTime(item.createdAt)}
                        </TableCell>
                        <TableCell className="align-top">
                          <Text className="font-medium">
                            {actorLabel(item)}
                          </Text>
                          {item.actorName && item.actorEmail ? (
                            <Text className="text-sm text-muted">
                              {item.actorEmail}
                            </Text>
                          ) : null}
                          <Badge variant="tertiary" size="sm" pill>
                            {item.actorType}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top">
                          <Text className="font-medium">
                            {humanize(item.action)}
                          </Text>
                          <Text className="font-mono text-xs text-dimmed">
                            {item.action}
                          </Text>
                        </TableCell>
                        <TableCell className="align-top">
                          <Text className="font-mono text-xs">
                            {item.targetType}
                          </Text>
                          {item.targetId ? (
                            <Text className="break-all font-mono text-xs text-muted">
                              {item.targetId}
                            </Text>
                          ) : (
                            <Text className="text-xs text-dimmed">
                              No target ID
                            </Text>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-sm text-muted">
                          {describeDetails(item.details)}
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={`View audit entry ${item.action}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelected(item);
                            }}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                targetId="admin-audit-log"
                label="entries"
                pageSize={PAGE_SIZE}
                page={page}
                itemCount={logsQuery.data.items.length}
                hasNext={Boolean(logsQuery.data.nextCursor)}
                isFetching={logsQuery.isFetching}
                onPrevious={() =>
                  setPage((current) => Math.max(0, current - 1))
                }
                onNext={nextPage}
              />
            </>
          )}
        </CardBody>
      </Card>

      <Drawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DrawerPopup direction="right" className="w-full max-w-2xl">
          <DrawerHeader className="justify-between border-b border-drawer-border pb-4">
            <div className="min-w-0">
              <DrawerTitle className="truncate">
                {selected ? humanize(selected.action) : "Audit entry"}
              </DrawerTitle>
              <DrawerDescription className="mt-1 text-sm">
                {selected
                  ? `${formatWibDateTime(selected.createdAt)} WIB · ${actorLabel(selected)}`
                  : ""}
              </DrawerDescription>
            </div>
            <DrawerClose
              render={
                <Button
                  variant="plain"
                  size="sm"
                  aria-label="Close audit entry"
                />
              }
            >
              <IconX />
            </DrawerClose>
          </DrawerHeader>
          <DrawerBody className="min-h-0 space-y-4 p-5">
            {selected ? (
              <>
                <section className="space-y-2">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-dimmed">
                    Before
                  </Text>
                  <JsonBlock value={selected.beforeState} />
                </section>
                <section className="space-y-2">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-dimmed">
                    After
                  </Text>
                  <JsonBlock value={selected.afterState} />
                </section>
                <section className="space-y-2">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-dimmed">
                    Details
                  </Text>
                  <JsonBlock value={selected.details} />
                </section>
              </>
            ) : null}
          </DrawerBody>
        </DrawerPopup>
      </Drawer>
    </Stack>
  );
}
