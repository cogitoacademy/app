"use client";

import { useState } from "react";
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
import { SessionFeedbackBulletInput } from "./session-feedback-bullet-input";

export type CompletionFeedbackDraft = {
  discussion: string[];
  strengths: string[];
  improvements: string[];
};

function clean(bullets: string[]) {
  return bullets.map((s) => s.trim()).filter(Boolean);
}

export function CompleteSessionDialog({
  open,
  pending = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (feedback: CompletionFeedbackDraft) => void;
}) {
  const [discussion, setDiscussion] = useState<string[]>([""]);
  const [strengths, setStrengths] = useState<string[]>([""]);
  const [improvements, setImprovements] = useState<string[]>([""]);

  const cleanDiscussion = clean(discussion);
  const cleanStrengths = clean(strengths);
  const cleanImprovements = clean(improvements);
  const valid =
    cleanDiscussion.length > 0 &&
    cleanStrengths.length > 0 &&
    cleanImprovements.length > 0;

  function reset() {
    setDiscussion([""]);
    setStrengths([""]);
    setImprovements([""]);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogPopup className="sm:max-w-xl">
        <DialogHeader className="flex-col items-start gap-1.5">
          <DialogTitle>Complete session</DialogTitle>
          <DialogDescription>
            Isi 3 bagian ini. Tiap Enter bikin bullet baru. Student dan admin
            bisa lihat hasil ini; admin pakai sebagai bahan payout.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <Field>
            <FieldLabel>Session discussion</FieldLabel>
            <SessionFeedbackBulletInput
              value={discussion}
              onChange={setDiscussion}
              disabled={pending}
              ariaLabel="Session discussion"
              placeholder="What was covered? Enter for new bullet"
            />
            <FieldDescription>Topik, materi, aktivitas sesi.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Identified strengths</FieldLabel>
            <SessionFeedbackBulletInput
              value={strengths}
              onChange={setStrengths}
              disabled={pending}
              ariaLabel="Identified strengths"
              placeholder="Kekuatan student. Enter for new bullet"
            />
            <FieldDescription>Hal yang sudah bagus.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Points of improvement</FieldLabel>
            <SessionFeedbackBulletInput
              value={improvements}
              onChange={setImprovements}
              disabled={pending}
              ariaLabel="Points of improvement"
              placeholder="Perlu ditingkatkan. Enter for new bullet"
            />
            <FieldDescription>Fokus follow-up sesi berikut.</FieldDescription>
          </Field>
        </DialogBody>
        <DialogFooter className="flex-col-reverse items-stretch sm:flex-row sm:items-center">
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            disabled={pending}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!valid || pending}
            progress={pending}
            onClick={() =>
              onConfirm({
                discussion: cleanDiscussion,
                strengths: cleanStrengths,
                improvements: cleanImprovements,
              })
            }
            className="w-full sm:w-auto"
          >
            Complete session
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
