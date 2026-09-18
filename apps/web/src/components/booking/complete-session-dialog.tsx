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

function FeedbackSection({
  id,
  label,
  description,
  placeholder,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  placeholder: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
}) {
  return (
    <Field className="gap-1 py-5 first:pt-0 last:pb-0">
      <FieldLabel htmlFor={id} className="font-semibold leading-none">
        {label}
      </FieldLabel>
      <FieldDescription className="mb-1">{description}</FieldDescription>
      <SessionFeedbackBulletInput
        value={value}
        onChange={onChange}
        disabled={disabled}
        ariaLabel={label}
        inputId={id}
        placeholder={placeholder}
      />
    </Field>
  );
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
        <DialogHeader className="flex-col items-start gap-1.5 border-b! border-border!">
          <DialogTitle>Complete session</DialogTitle>
          <DialogDescription className="text-sm md:text-base">
            Add your feedback from today&apos;s session.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="min-h-0">
          <section aria-labelledby="session-feedback-heading">
            <div className="divide-y divide-border">
              <FeedbackSection
                id="session-discussion"
                label="Session discussion"
                description="Topics, activities, and key takeaways covered today."
                placeholder="e.g. Reviewed the structure of a persuasive opening"
                value={discussion}
                onChange={setDiscussion}
                disabled={pending}
              />
              <FeedbackSection
                id="identified-strengths"
                label="Strengths observed"
                description="Progress, skills, or habits the student demonstrated."
                placeholder="e.g. Supported each claim with a relevant example"
                value={strengths}
                onChange={setStrengths}
                disabled={pending}
              />
              <FeedbackSection
                id="points-of-improvement"
                label="Areas for improvement"
                description="Specific focus areas for the next session."
                placeholder="e.g. Practise concise rebuttals under time pressure"
                value={improvements}
                onChange={setImprovements}
                disabled={pending}
              />
            </div>
          </section>
        </DialogBody>

        <DialogFooter className="flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
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
