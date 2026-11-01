"use client";

import { ClassActionReason } from "./class-action-reason";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@cogito-app/ui/components/selia/dialog";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";

import Loader from "@/components/loader";

import { CrossBrowserDateTimeInput } from "@/components/booking/minute-time-input";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { getUserFacingError } from "@/lib/error-message";
import { client, orpc } from "@/utils/orpc";

type MinimumDecisionInput = Parameters<
  typeof client.classes.previewAdminMinimumDecision
>[0];
type SessionCancellationInput = Parameters<
  typeof client.classes.previewAdminSessionCancellation
>[0];

type LifecycleClass = {
  id: string;
  version: number;
  kind: string;
  state: string;
  minimumCheckAt: Date | string | null;
  postponementCount: number;
  freeExitUntil: Date | string | null;
  sessions: {
    id: string;
    sequenceNumber: number;
    startAt: Date | string;
    endAt: Date | string;
    state: string;
    version: number;
  }[];
};

function formatDate(value: Date | string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(new Date(value))
    : "Not set";
}

export function ClassAdminLifecyclePanel({
  classRecord,
  onChanged,
  sessionOnly = false,
  minimumOnly = false,
}: {
  classRecord: LifecycleClass;
  sessionOnly?: boolean;
  minimumOnly?: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const [replacementStarts, setReplacementStarts] = useState<
    Record<string, string>
  >({});
  const [decisionReview, setDecisionReview] = useState<{
    input: MinimumDecisionInput;
    quote: Awaited<
      ReturnType<typeof client.classes.previewAdminMinimumDecision>
    >;
    requestKey: string;
  } | null>(null);
  const [cancelSessionId, setCancelSessionId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [sessionReview, setSessionReview] = useState<{
    input: SessionCancellationInput;
    quote: Awaited<
      ReturnType<typeof client.classes.previewAdminSessionCancellation>
    >;
    requestKey: string;
  } | null>(null);
  const scheduledSessions = classRecord.sessions.filter(
    (session) => session.state === "scheduled",
  );
  const minimumCheck = useQuery({
    ...orpc.classes.getAdminMinimumCheck.queryOptions({
      input: { classId: classRecord.id },
    }),
    enabled:
      !sessionOnly &&
      classRecord.kind === "cohort" &&
      classRecord.minimumCheckAt !== null,
  });

  const invalidateClassLists = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpc.admin.listAcademyClasses.key({
          input: { state: "published" },
        }),
      }),
      queryClient.invalidateQueries({
        queryKey: orpc.admin.listAcademyClasses.key({
          input: { state: "postponed" },
        }),
      }),
      queryClient.invalidateQueries({
        queryKey: orpc.classes.getAdminMinimumCheck.key({
          input: { classId: classRecord.id },
        }),
      }),
    ]);
    await onChanged();
  };

  const previewDecision = useMutation(
    orpc.classes.previewAdminMinimumDecision.mutationOptions({
      onSuccess: (quote, input) =>
        setDecisionReview({ input, quote, requestKey: crypto.randomUUID() }),
      onError: (error: Error) =>
        toastManager.add({
          title: "Minimum decision could not be reviewed",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );
  const confirmDecision = useMutation(
    orpc.classes.confirmAdminMinimumDecision.mutationOptions({
      onSuccess: async (result) => {
        setDecisionReview(null);
        setReplacementStarts({});
        await invalidateClassLists();
        toastManager.add({
          title:
            result.decision === "postpone"
              ? "Cohort postponed"
              : "Cohort will continue",
          description:
            result.decision === "postpone" && result.freeExitUntil
              ? `Students may withdraw without a fee until ${formatDate(result.freeExitUntil)} WIB.`
              : "The minimum enrollment decision was recorded.",
          type: "success",
        });
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Minimum decision could not be confirmed",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );
  const previewSessionCancellation = useMutation(
    orpc.classes.previewAdminSessionCancellation.mutationOptions({
      onSuccess: (quote, input) =>
        setSessionReview({ input, quote, requestKey: crypto.randomUUID() }),
      onError: (error: Error) =>
        toastManager.add({
          title: "Session cancellation could not be reviewed",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );
  const confirmSessionCancellation = useMutation(
    orpc.classes.confirmAdminSessionCancellation.mutationOptions({
      onSuccess: async () => {
        setSessionReview(null);
        setCancelSessionId(null);
        setCancelReason("");
        await invalidateClassLists();
        toastManager.add({
          title: "Class session cancelled",
          description:
            "The undelivered session has no tutor fee. Unspent funded Marks were returned.",
          type: "success",
        });
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Session cancellation could not be confirmed",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  const check = minimumCheck.data;
  const busy =
    previewDecision.isPending ||
    confirmDecision.isPending ||
    previewSessionCancellation.isPending ||
    confirmSessionCancellation.isPending;

  function previewMinimumDecision(
    decision: "continue" | "postpone",
    actionReason: string,
  ) {
    const starts =
      decision === "postpone"
        ? scheduledSessions.map((session) => ({
            sessionId: session.id,
            expectedSessionVersion: session.version,
            startAt: new Date(replacementStarts[session.id] ?? ""),
          }))
        : [];
    setDecisionReview(null);
    return previewDecision.mutateAsync({
      classId: classRecord.id,
      expectedClassVersion: classRecord.version,
      decision,
      reason: actionReason,
      replacementStarts: starts,
    });
  }

  function previewSessionCancel(sessionId: string) {
    if (cancelReason.trim().length < 3) return;
    const session = scheduledSessions.find((item) => item.id === sessionId);
    if (!session) return;
    setSessionReview(null);
    previewSessionCancellation.mutate({
      classId: classRecord.id,
      sessionId,
      expectedClassVersion: classRecord.version,
      expectedSessionVersion: session.version,
      reason: cancelReason.trim(),
    });
  }

  return (
    <Stack direction="column" spacing="sm" className="mt-4">
      {!sessionOnly &&
      classRecord.kind === "cohort" &&
      classRecord.minimumCheckAt ? (
        <Card>
          <CardHeader>
            <CardTitle>Minimum enrollment check</CardTitle>
            <CardDescription>
              Check date: {formatDate(classRecord.minimumCheckAt)}
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-3">
            {minimumCheck.isPending ? (
              <Loader />
            ) : minimumCheck.isError ? (
              <Text className="text-sm text-danger-foreground">
                Current count is unavailable. Refresh this class to try again.
              </Text>
            ) : check ? (
              <>
                <Stack direction="row" spacing="sm" className="flex-wrap">
                  <Badge
                    variant={check.shortfall === 0 ? "success" : "warning"}
                  >
                    {check.activeFullHalfStudents} / {check.minimumEnrollment}{" "}
                    active full/half students
                  </Badge>
                  {check.shortfall > 0 ? (
                    <Badge variant="warning">
                      Shortfall: {check.shortfall}
                    </Badge>
                  ) : null}
                  {check.minimumCheckResolvedAt ? (
                    <Badge variant="secondary">Resolved</Badge>
                  ) : null}
                  {check.postponementCount > 0 ? (
                    <Badge variant="secondary">Postponed once</Badge>
                  ) : null}
                </Stack>
                <Text className="text-sm text-muted">
                  Counts unique active full and half-plan students with funded
                  seats. Single-session buyers, expired checkouts, cancelled
                  enrollments, and defaulted plans do not count.
                </Text>
                {check.freeExitUntil ? (
                  <Text className="text-sm text-warning-foreground">
                    Student penalty-free withdrawal deadline:{" "}
                    {formatDate(check.freeExitUntil)} WIB.
                  </Text>
                ) : null}
                {check.eligible ? (
                  <>
                    {check.proposedFreeExitUntil ? (
                      <Text className="text-sm text-muted">
                        If postponed, the free-exit deadline will be at least{" "}
                        {formatDate(check.proposedFreeExitUntil)} WIB. Every
                        replacement session must start after that deadline.
                      </Text>
                    ) : null}
                    {scheduledSessions.map((session) => (
                      <Field key={session.id}>
                        <FieldLabel htmlFor={`replacement-${session.id}`}>
                          Replacement start · session {session.sequenceNumber}
                        </FieldLabel>
                        <CrossBrowserDateTimeInput
                          id={`replacement-${session.id}`}
                          value={replacementStarts[session.id] ?? ""}
                          onChange={(value) => {
                            setReplacementStarts((current) => ({
                              ...current,
                              [session.id]: value,
                            }));
                            setDecisionReview(null);
                          }}
                        />
                      </Field>
                    ))}
                    <Stack direction="row" spacing="sm" className="flex-wrap">
                      <ClassActionReason
                        label="Review continue decision"
                        reasonLabel="Decision reason"
                        disabled={busy}
                        onConfirm={(value) =>
                          previewMinimumDecision("continue", value)
                        }
                      />
                      <ClassActionReason
                        label="Review one-time postponement"
                        reasonLabel="Decision reason"
                        disabled={
                          busy ||
                          check.postponementCount > 0 ||
                          scheduledSessions.some(
                            (session) => !replacementStarts[session.id],
                          )
                        }
                        onConfirm={(value) =>
                          previewMinimumDecision("postpone", value)
                        }
                      />
                    </Stack>
                  </>
                ) : null}
                {decisionReview ? (
                  <div
                    className="space-y-3 rounded border border-border p-4"
                    role="region"
                    aria-label="Minimum decision review"
                  >
                    <Text className="font-medium">
                      {decisionReview.quote.decision === "postpone"
                        ? "Review replacement schedule"
                        : "Review continue decision"}
                    </Text>
                    <Text className="text-sm text-muted">
                      {decisionReview.quote.activeFullHalfStudents} /{" "}
                      {decisionReview.quote.minimumEnrollment} unique active
                      full/half students · shortfall{" "}
                      {decisionReview.quote.shortfall}.
                    </Text>
                    {decisionReview.quote.freeExitUntil ? (
                      <Text className="text-sm text-warning-foreground">
                        Free withdrawal deadline:{" "}
                        {formatDate(decisionReview.quote.freeExitUntil)} WIB.
                        Replacement sessions start after this deadline.
                      </Text>
                    ) : null}
                    {decisionReview.quote.replacementSessions.map((session) => (
                      <Text key={session.sessionId} className="text-sm">
                        Session{" "}
                        {
                          classRecord.sessions.find(
                            (item) => item.id === session.sessionId,
                          )?.sequenceNumber
                        }
                        : {formatDate(session.startAt)}
                      </Text>
                    ))}
                    <Stack direction="row" spacing="sm" className="flex-wrap">
                      <Button
                        variant={
                          decisionReview.quote.decision === "postpone"
                            ? "danger"
                            : "primary"
                        }
                        disabled={busy}
                        progress={confirmDecision.isPending}
                        onClick={() =>
                          confirmDecision.mutate({
                            ...decisionReview.input,
                            requestKey: decisionReview.requestKey,
                            quoteVersion: decisionReview.quote.quoteVersion,
                          })
                        }
                      >
                        Confirm {decisionReview.quote.decision}
                      </Button>
                      <Button
                        variant="plain"
                        disabled={busy}
                        onClick={() => setDecisionReview(null)}
                      >
                        Revise
                      </Button>
                    </Stack>
                  </div>
                ) : null}
              </>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {!minimumOnly && scheduledSessions.length > 0 && (
        <div className="mt-3">
          {scheduledSessions.map((session) => (
            <Button
              key={session.id}
              size="xs"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setCancelSessionId(session.id);
                setSessionReview(null);
              }}
            >
              Cancel session
            </Button>
          ))}
          <Dialog
            open={cancelSessionId !== null}
            onOpenChange={(open) => {
              if (!open && !busy) {
                setCancelSessionId(null);
                setCancelReason("");
                setSessionReview(null);
              }
            }}
          >
            <DialogPopup>
              <DialogHeader>
                <DialogTitle>Cancel session</DialogTitle>
              </DialogHeader>
              <DialogBody className="space-y-3">
                <DialogDescription>
                  Review the return before confirming cancellation.
                </DialogDescription>
                <Field>
                  <FieldLabel required>Cancellation reason</FieldLabel>
                  <Textarea
                    aria-label="Cancellation reason"
                    maxLength={500}
                    value={cancelReason}
                    disabled={busy || !!sessionReview}
                    onChange={(event) => {
                      setCancelReason(event.target.value);
                      setSessionReview(null);
                    }}
                  />
                </Field>
                <Button
                  disabled={busy || cancelReason.trim().length < 3}
                  onClick={() => {
                    if (cancelSessionId) previewSessionCancel(cancelSessionId);
                  }}
                >
                  Preview exact return
                </Button>
                {sessionReview ? (
                  <div
                    className="space-y-3"
                    role="region"
                    aria-label="Session cancellation review"
                  >
                    <Text>
                      Return: {sessionReview.quote.returnMarks} Marks · Fee: 0
                      Marks · {sessionReview.quote.releasedAllocationIds.length}{" "}
                      seat allocation(s) released.
                    </Text>
                    <Stack direction="row" spacing="sm" className="flex-wrap">
                      <Button
                        variant="danger"
                        disabled={busy}
                        progress={confirmSessionCancellation.isPending}
                        onClick={() =>
                          confirmSessionCancellation.mutate({
                            ...sessionReview.input,
                            requestKey: sessionReview.requestKey,
                            quoteVersion: sessionReview.quote.quoteVersion,
                          })
                        }
                      >
                        Confirm session cancellation
                      </Button>
                      <Button
                        variant="plain"
                        disabled={busy}
                        onClick={() => {
                          setSessionReview(null);
                          setCancelReason("");
                          setCancelSessionId(null);
                        }}
                      >
                        Keep session
                      </Button>
                    </Stack>
                  </div>
                ) : null}
              </DialogBody>
            </DialogPopup>
          </Dialog>
        </div>
      )}
    </Stack>
  );
}
