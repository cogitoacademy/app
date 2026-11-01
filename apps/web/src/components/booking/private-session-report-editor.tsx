"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ORPCError } from "@orpc/client";
import { completionFeedbackInput } from "@cogito-app/api/modules/booking/booking.types";
import type { listPrivateReportSessions } from "@cogito-app/api/modules/booking/private-report-sessions";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
import {
  Field,
  FieldLabel,
  FieldDescription,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text } from "@cogito-app/ui/components/selia/text";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { SessionFeedbackBulletInput } from "./session-feedback-bullet-input";
import type { CompletionFeedbackDraft } from "./complete-session-dialog";
import Loader from "@/components/loader";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";

export type PrivateReportSession = Awaited<
  ReturnType<typeof listPrivateReportSessions>
>[number];
type Report = CompletionFeedbackDraft & { version: number };
type Props = {
  session: PrivateReportSession;
  isAdmin: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
};

export function PrivateSessionReportEditor(props: Props) {
  const feedback = useQuery(
    orpc.booking.listCompletionFeedback.queryOptions({
      input: { bookingId: props.session.bookingId },
    }),
  );
  if (feedback.isPending) return <Loader />;
  if (feedback.isError)
    return (
      <div role="alert">
        <Text>Could not load the session report.</Text>
        <Button variant="plain" onClick={() => void feedback.refetch()}>
          Try again
        </Button>
      </div>
    );
  const report = feedback.data.find(
    (entry) => entry.sessionId === props.session.sessionId,
  );
  return (
    <PrivateReportForm
      {...props}
      initialReport={report}
      refresh={() => feedback.refetch()}
    />
  );
}

function PrivateReportForm({
  session,
  isAdmin,
  onDirtyChange,
  onPendingChange,
  initialReport,
  refresh,
}: Props & { initialReport?: Report; refresh: () => Promise<unknown> }) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<CompletionFeedbackDraft>(
    initialReport ?? { discussion: [""], strengths: [""], improvements: [""] },
  );
  const [expectedVersion, setExpectedVersion] = useState(
    initialReport?.version,
  );
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conflicted, setConflicted] = useState(false);
  const request = useRef<{ payload: string; key: string } | null>(null);
  const complete = useMutation(
    orpc.tutorActions.completeSession.mutationOptions(),
  );
  const adminReport = useMutation(
    orpc.booking.submitAdminCompletionReport.mutationOptions(),
  );
  const pending = complete.isPending || adminReport.isPending;
  const readOnly = !session.canRecord && !session.canEdit;
  const validation = completionFeedbackInput.safeParse(feedback);
  const reasonLength = Array.from(reason.trim()).length;
  const valid =
    validation.success &&
    (!isAdmin ||
      (deliveryConfirmed && reasonLength >= 1 && reasonLength <= 600));

  async function save() {
    if (!validation.success || !valid || readOnly || conflicted || pending)
      return;
    const common = {
      bookingId: session.bookingId,
      ...(session.sessionId ? { sessionId: session.sessionId } : {}),
      feedback: validation.data,
    };
    const payload = JSON.stringify([
      common,
      expectedVersion,
      reason.trim(),
      deliveryConfirmed,
    ]);
    if (request.current?.payload !== payload)
      request.current = { payload, key: crypto.randomUUID() };
    setError(null);
    onPendingChange(true);
    try {
      if (isAdmin)
        await adminReport.mutateAsync({
          ...common,
          deliveryConfirmed: true,
          reason: reason.trim(),
          ...(expectedVersion ? { expectedVersion } : {}),
          requestKey: request.current.key,
        });
      else
        await complete.mutateAsync({
          ...common,
          requestKey: request.current.key,
        });
      onDirtyChange(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.booking.listReportSessions.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.booking.listCompletionFeedback.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.booking.listCompletionFeedbackHistory.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.booking.listMine.key(),
        }),
        queryClient.invalidateQueries({ queryKey: orpc.booking.get.key() }),
        queryClient.invalidateQueries({ queryKey: ["student-report-list"] }),
      ]);
      const latest = await queryClient.fetchQuery(
        orpc.booking.listCompletionFeedback.queryOptions({
          input: { bookingId: session.bookingId },
        }),
      );
      setExpectedVersion(
        latest.find((entry) => entry.sessionId === session.sessionId)?.version,
      );
      setDeliveryConfirmed(false);
      setReason("");
      request.current = null;
      toastManager.add({
        title: expectedVersion ? "Report updated" : "Report recorded",
        type: "success",
      });
    } catch (failure) {
      if (failure instanceof ORPCError && failure.code === "CONFLICT") {
        setConflicted(true);
        await refresh();
      }
      setError(getUserFacingError(failure));
    } finally {
      onPendingChange(false);
    }
  }

  if (readOnly)
    return (
      <div className="space-y-5">
        {(["discussion", "strengths", "improvements"] as const).map((key) => (
          <section key={key}>
            <Heading level={2} size="sm">
              {key === "discussion"
                ? "Session discussion"
                : key === "strengths"
                  ? "Strengths observed"
                  : "Areas for improvement"}
            </Heading>
            <Text className="mt-2 whitespace-pre-wrap">
              {feedback[key].join("\n\n")}
            </Text>
          </section>
        ))}
        <Text className="text-sm text-muted">
          An administrator can correct a recorded private session report.
        </Text>
      </div>
    );
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Text className="text-sm text-muted">
        {expectedVersion
          ? "Corrections update report text only; settlement is not repeated."
          : "Saving this report records session completion using the existing booking settlement rules."}
      </Text>
      {conflicted ? (
        <div className="space-y-2" role="alert">
          <Text>A newer report is available. Your draft has been kept.</Text>
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              await refresh();
              const latest = queryClient.getQueryData(
                orpc.booking.listCompletionFeedback.queryOptions({
                  input: { bookingId: session.bookingId },
                }).queryKey,
              );
              setExpectedVersion(
                latest?.find((entry) => entry.sessionId === session.sessionId)
                  ?.version,
              );
              setConflicted(false);
              request.current = null;
            }}
          >
            Use my draft with the latest version
          </Button>
        </div>
      ) : null}
      {(["discussion", "strengths", "improvements"] as const).map((key) => (
        <Field key={key}>
          <FieldLabel htmlFor={`private-report-${key}`}>
            {key === "discussion"
              ? "Session discussion"
              : key === "strengths"
                ? "Strengths observed"
                : "Areas for improvement"}
          </FieldLabel>
          <SessionFeedbackBulletInput
            inputId={`private-report-${key}`}
            ariaLabel={
              key === "discussion"
                ? "Session discussion"
                : key === "strengths"
                  ? "Strengths observed"
                  : "Areas for improvement"
            }
            value={feedback[key]}
            onChange={(value) => {
              setFeedback((current) => ({ ...current, [key]: value }));
              onDirtyChange(true);
            }}
            disabled={pending}
          />
        </Field>
      ))}
      {isAdmin ? (
        <>
          <Field>
            <FieldLabel className="flex items-center gap-2">
              <Checkbox
                checked={deliveryConfirmed}
                onCheckedChange={(checked) => {
                  setDeliveryConfirmed(checked);
                  onDirtyChange(true);
                }}
                disabled={pending}
              />
              I confirm this session was delivered
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel htmlFor="private-report-reason">
              Audit reason
            </FieldLabel>
            <FieldDescription>
              Explain why you are recording or correcting this report. Maximum
              600 characters.
            </FieldDescription>
            <Textarea
              id="private-report-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                onDirtyChange(true);
              }}
              disabled={pending}
            />
          </Field>
        </>
      ) : null}
      {error ? (
        <Text role="alert" className="text-danger">
          {error}
        </Text>
      ) : null}
      <Button
        type="submit"
        disabled={!valid || pending || conflicted}
        progress={pending}
      >
        {expectedVersion ? "Save correction" : "Record report"}
      </Button>
    </form>
  );
}
