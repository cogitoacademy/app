"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@cogito-app/ui/components/selia/button";
import { ReasonField } from "@/components/reason-field";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";

export function ClassAdminCancellationPanel({
  classId,
  expectedVersion,
  onChanged,
}: {
  classId: string;
  expectedVersion: number;
  onChanged: () => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [requestKey, setRequestKey] = useState("");
  function showError(error: Error) {
    toastManager.add({
      title: "Class cancellation could not be completed",
      description: getUserFacingError(error),
      type: "error",
    });
  }
  const preview = useMutation(
    orpc.classes.previewAdminCancellation.mutationOptions({
      onSuccess: () => setRequestKey(crypto.randomUUID()),
      onError: showError,
    }),
  );
  const confirm = useMutation(
    orpc.classes.confirmAdminCancellation.mutationOptions({
      onError: showError,
      onSuccess: async (result) => {
        toastManager.add({
          title: "Class cancelled",
          description: `${result.returnMarks} Marks returned. Calendar cancellation will retry automatically if needed.`,
          type: "success",
        });
        preview.reset();
        await onChanged();
      },
    }),
  );
  const busy = preview.isPending || confirm.isPending;
  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <ReasonField
        label="Class cancellation reason"
        id={`class-cancel-reason-${classId}`}
        value={reason}
        required
        minLength={3}
        maxLength={500}
        disabled={busy}
        onChange={(value) => {
          setReason(value);
          preview.reset();
        }}
      />
      <Button
        variant="secondary"
        disabled={busy || reason.trim().length < 3}
        onClick={() => preview.mutate({ classId, expectedVersion, reason })}
      >
        Review class cancellation
      </Button>
      {preview.data ? (
        <div
          role="region"
          aria-label="Admin class cancellation review"
          className="space-y-3"
        >
          <Text>
            {preview.data.cancelledSessionIds.length} future session(s) will be
            cancelled.
          </Text>
          <Text>
            Cancellation fee: 0 Marks · Return: {preview.data.returnMarks} Marks
          </Text>
          <Text className="text-sm text-muted">
            Returns go to available Marks, never cash.{" "}
            {preview.data.retainedMarks} Marks remain held for past or ongoing
            delivery/report resolution. Earned tutor fees are preserved.
            Students and tutors will be notified.
          </Text>
          <Stack direction="row" spacing="sm" className="flex-wrap">
            <Button
              variant="danger"
              disabled={busy || !requestKey}
              progress={confirm.isPending}
              onClick={() =>
                confirm.mutate({
                  classId,
                  expectedVersion,
                  reason,
                  requestKey,
                  quoteVersion: preview.data!.quoteVersion,
                })
              }
            >
              Confirm class cancellation
            </Button>
            <Button
              variant="plain"
              disabled={busy}
              onClick={() => preview.reset()}
            >
              Keep class scheduled
            </Button>
          </Stack>
        </div>
      ) : null}
    </div>
  );
}
