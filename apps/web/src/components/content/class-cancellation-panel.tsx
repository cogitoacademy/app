"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@cogito-app/ui/components/selia/button";
import { CardBody } from "@cogito-app/ui/components/selia/card";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";

export function ClassCancellationPanel({
  enrollmentId,
  allocations,
  sessions,
  onChanged,
}: {
  enrollmentId: string;
  allocations: {
    sessionId: string;
    state: string;
    fundedMarks: number;
    spentMarks: number;
    releasedMarks: number;
  }[];
  sessions: { id: string; sequenceNumber: number; startAt: Date | string }[];
  onChanged: () => Promise<unknown>;
}) {
  const [requestKey, setRequestKey] = useState("");
  const [viewOpenedAt] = useState(() => Date.now());
  function showError(error: Error) {
    toastManager.add({
      title: "Cancellation could not be completed",
      description: getUserFacingError(error),
      type: "error",
    });
  }
  const preview = useMutation(
    orpc.classes.quoteCancellation.mutationOptions({
      onSuccess: () => setRequestKey(crypto.randomUUID()),
      onError: showError,
    }),
  );
  const confirm = useMutation(
    orpc.classes.confirmCancellation.mutationOptions({
      onSuccess: async (result) => {
        preview.reset();
        toastManager.add({
          title:
            result.scope === "withdrawal"
              ? "Withdrawal confirmed"
              : "Seat cancelled",
          description: `${result.returnMarks} Marks returned to your available balance.`,
          type: "success",
        });
        await onChanged();
      },
      onError: showError,
    }),
  );
  const quote = preview.data;
  const busy = preview.isPending || confirm.isPending;
  const funded = allocations
    .filter(
      (row) =>
        row.state === "funded" &&
        row.fundedMarks > row.spentMarks + row.releasedMarks,
    )
    .map((row) => sessions.find((session) => session.id === row.sessionId))
    .filter(
      (session) =>
        session && new Date(session.startAt).getTime() > viewOpenedAt,
    );
  if (
    !funded.length &&
    !allocations.some((row) => row.state === "unfunded_reserved")
  )
    return null;
  return (
    <CardBody className="space-y-3 border-t border-border">
      <Text className="font-medium">Cancellation and withdrawal</Text>
      <Text className="text-sm text-muted">
        Returns go to your available Marks balance, never cash. Review the exact
        fee and return before confirming. Funded seats cancelled inside 24 hours
        remain held for session completion.
      </Text>
      <Stack direction="row" spacing="sm" className="flex-wrap">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => preview.mutate({ enrollmentId })}
        >
          Review withdrawal
        </Button>
        {funded.map((session) =>
          session ? (
            <Button
              key={session.id}
              variant="plain"
              disabled={busy}
              onClick={() =>
                preview.mutate({ enrollmentId, sessionId: session.id })
              }
            >
              Cancel session {session.sequenceNumber}
            </Button>
          ) : null,
        )}
      </Stack>
      {quote ? (
        <div
          className="space-y-3 rounded border border-border p-4"
          role="region"
          aria-label="Cancellation review"
        >
          <Text className="font-medium">
            {quote.scope === "withdrawal"
              ? "Review class withdrawal"
              : "Review seat cancellation"}
          </Text>
          <Text>
            Fee: {quote.feeMarks} Marks · Return: {quote.returnMarks} Marks
          </Text>
          {quote.retainedMarks > 0 ? (
            <Text>
              {quote.retainedMarks} Marks stay held for sessions inside the
              cancellation deadline.
            </Text>
          ) : null}
          {quote.unpaidAllocationIds.length > 0 ? (
            <Text>
              The unpaid installment will be cancelled; no next-half charge.
            </Text>
          ) : null}
          {quote.allocations.map((row) => (
            <Text key={row.allocationId} className="text-sm text-muted">
              Session{" "}
              {
                sessions.find((session) => session.id === row.sessionId)
                  ?.sequenceNumber
              }
              : cancellation deadline{" "}
              {new Intl.DateTimeFormat("en", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Jakarta",
              }).format(new Date(row.deadline))}
            </Text>
          ))}
          <Stack direction="row" spacing="sm">
            <Button
              variant="danger"
              disabled={busy || !requestKey}
              progress={confirm.isPending}
              onClick={() =>
                confirm.mutate({
                  enrollmentId,
                  ...(quote.sessionId ? { sessionId: quote.sessionId } : {}),
                  requestKey,
                  quoteVersion: quote.quoteVersion,
                })
              }
            >
              Confirm{" "}
              {quote.scope === "withdrawal"
                ? "withdrawal"
                : "seat cancellation"}
            </Button>
            <Button
              variant="plain"
              disabled={busy}
              onClick={() => preview.reset()}
            >
              Keep my enrollment
            </Button>
          </Stack>
        </div>
      ) : null}
    </CardBody>
  );
}
