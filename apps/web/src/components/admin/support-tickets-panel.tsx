"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  IconClock,
  IconLifebuoy,
  IconRefresh,
  IconTicket,
} from "@tabler/icons-react";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Dialog,
  DialogBody,
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

import { EmptyStateCard } from "@/components/empty-state";
import Loader from "@/components/loader";
import { TablePagination } from "@/components/table-pagination";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";

type SupportStatus = "open" | "in_progress" | "resolved" | "closed";
type StatusFilter = "all" | SupportStatus;

type Ticket = {
  id: string;
  reporterId: string;
  reporterName: string | null;
  reporterEmail: string | null;
  bookingId: string | null;
  bookingNumber: number | null;
  category: string;
  description: string;
  status: string;
  slaDeadline: Date;
  resolution: string | null;
  createdAt: Date;
};

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All tickets",
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

const CATEGORY_LABELS: Record<string, string> = {
  tutor_late: "Tutor late",
  tutor_no_show: "Tutor no-show",
  technical: "Technical",
  payment: "Payment",
  other: "Other",
};

function statusVariant(status: string) {
  if (status === "open") return "warning" as const;
  if (status === "in_progress") return "info" as const;
  if (status === "resolved") return "success" as const;
  return "secondary" as const;
}

function formatDeadline(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function isOverdue(ticket: Ticket, now: number) {
  return (
    (ticket.status === "open" || ticket.status === "in_progress") &&
    new Date(ticket.slaDeadline).getTime() < now
  );
}

export function SupportTicketsPanel() {
  const [status, setStatus] = useState<StatusFilter>("open");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [resolution, setResolution] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const query = useQuery({
    ...orpc.support.adminListTickets.queryOptions({
      input: {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        ...(status === "all" ? {} : { status }),
      },
    }),
    placeholderData: keepPreviousData,
  });

  const resolveMutation = useMutation({
    ...orpc.support.adminResolveTicket.mutationOptions(),
    onSuccess: async () => {
      await query.refetch();
      setSelected(null);
      setResolution("");
      setFormError(null);
      toastManager.add({
        title: "Support ticket resolved",
        description: "The reporter has been notified.",
        type: "success",
      });
    },
    onError: (error) => {
      setFormError(
        getUserFacingError(error, "The ticket could not be resolved."),
      );
    },
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const hasNext = (page + 1) * PAGE_SIZE < total;

  function openTicket(ticket: Ticket) {
    setSelected(ticket);
    setResolution(ticket.resolution ?? "");
    setFormError(null);
  }

  function submitResolution() {
    if (!selected) return;
    const trimmed = resolution.trim();
    if (!trimmed) {
      setFormError("Write the resolution before closing the ticket.");
      return;
    }
    resolveMutation.mutate({
      ticketId: selected.id,
      resolution: trimmed,
    });
  }

  return (
    <Stack direction="column" spacing="lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Text className="text-muted">
            Student reports ordered by SLA deadline. Overdue tickets are
            escalated automatically.
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={status}
            onValueChange={(value) => {
              if (
                value === "all" ||
                value === "open" ||
                value === "in_progress" ||
                value === "resolved" ||
                value === "closed"
              ) {
                setStatus(value);
                setPage(0);
              }
            }}
          >
            <SelectTrigger className="w-40" aria-label="Filter support tickets">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectPopup>
              <SelectList>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="all">All tickets</SelectItem>
              </SelectList>
            </SelectPopup>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label="Refresh support tickets"
          >
            <IconRefresh />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {query.isPending ? (
        <Loader />
      ) : query.isError ? (
        <EmptyStateCard
          icon={<IconLifebuoy />}
          tone="danger"
          title="Support tickets could not be loaded"
          description={getUserFacingError(query.error)}
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyStateCard
          icon={<IconTicket />}
          tone="success"
          title="No tickets in this view"
          description={
            status === "all"
              ? "No support tickets have been created yet."
              : `There are no ${STATUS_LABELS[status].toLowerCase()} tickets.`
          }
        />
      ) : (
        <TableContainer id="support-tickets">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead className="hidden sm:table-cell">Reporter</TableHead>
                <TableHead className="hidden md:table-cell">Booking</TableHead>
                <TableHead className="hidden md:table-cell">SLA</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="max-w-72 align-top">
                    <Stack direction="column" spacing="sm">
                      <Text className="font-medium">
                        {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                      </Text>
                      <Text className="line-clamp-2 text-muted">
                        {ticket.description}
                      </Text>
                      <div className="flex flex-wrap items-center gap-2 md:hidden">
                        <Badge variant={statusVariant(ticket.status)} size="sm">
                          {STATUS_LABELS[ticket.status as StatusFilter] ??
                            ticket.status}
                        </Badge>
                        <Text className="text-muted">
                          SLA {formatDeadline(ticket.slaDeadline)}
                        </Text>
                        <Text className="text-muted">
                          {ticket.reporterName ?? ticket.reporterEmail}
                        </Text>
                        {isOverdue(ticket, now) ? (
                          <Badge variant="danger" size="sm">
                            <IconClock /> Overdue
                          </Badge>
                        ) : null}
                      </div>
                    </Stack>
                  </TableCell>
                  <TableCell className="hidden align-top sm:table-cell">
                    <Stack direction="column" spacing="sm">
                      <Text>{ticket.reporterName ?? "Unknown student"}</Text>
                      <Text className="text-muted">
                        {ticket.reporterEmail ?? ticket.reporterId}
                      </Text>
                    </Stack>
                  </TableCell>
                  <TableCell className="hidden align-top md:table-cell">
                    {ticket.bookingNumber ? (
                      <Text>#{ticket.bookingNumber}</Text>
                    ) : (
                      <Text className="text-muted">No booking</Text>
                    )}
                  </TableCell>
                  <TableCell className="hidden align-top md:table-cell">
                    <Stack direction="column" spacing="sm">
                      <Text>{formatDeadline(ticket.slaDeadline)}</Text>
                      {isOverdue(ticket, now) ? (
                        <Badge variant="danger" size="sm">
                          <IconClock /> Overdue
                        </Badge>
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell className="hidden align-top md:table-cell">
                    <Badge variant={statusVariant(ticket.status)} size="sm">
                      {STATUS_LABELS[ticket.status as StatusFilter] ??
                        ticket.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <Button
                      variant="plain"
                      size="sm"
                      onClick={() => openTicket(ticket)}
                    >
                      {ticket.status === "resolved" ||
                      ticket.status === "closed"
                        ? "View"
                        : "Resolve"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {items.length > 0 ? (
        <TablePagination
          targetId="support-tickets"
          label="tickets"
          pageSize={PAGE_SIZE}
          page={page}
          itemCount={items.length}
          hasNext={hasNext}
          isFetching={query.isFetching}
          onPrevious={() => setPage((current) => Math.max(0, current - 1))}
          onNext={() => setPage((current) => current + 1)}
        />
      ) : null}

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setResolution("");
            setFormError(null);
          }
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>
              {selected?.status === "resolved" || selected?.status === "closed"
                ? "Support ticket"
                : "Resolve support ticket"}
            </DialogTitle>
            <DialogDescription>
              {selected
                ? `${CATEGORY_LABELS[selected.category] ?? selected.category} · ${
                    selected.reporterName ?? selected.reporterEmail ?? "Student"
                  }`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Stack direction="column" spacing="md">
              <div>
                <Text className="text-sm font-medium">Student report</Text>
                <Text className="mt-1 text-muted">
                  {selected?.description ?? ""}
                </Text>
              </div>
              <Field>
                <FieldLabel>Resolution</FieldLabel>
                <Textarea
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                  placeholder="Describe what was done for the student."
                  rows={5}
                  disabled={
                    selected?.status === "resolved" ||
                    selected?.status === "closed"
                  }
                />
                <FieldDescription>
                  The student receives this text in their notification.
                </FieldDescription>
              </Field>
              {formError ? (
                <Text className="text-danger">{formError}</Text>
              ) : null}
            </Stack>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelected(null);
                setResolution("");
                setFormError(null);
              }}
            >
              Close
            </Button>
            {selected?.status !== "resolved" &&
            selected?.status !== "closed" ? (
              <Button
                onClick={submitResolution}
                disabled={resolveMutation.isPending}
              >
                {resolveMutation.isPending ? "Resolving..." : "Resolve ticket"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </Stack>
  );
}
