"use client";

import { useState } from "react";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
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
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import { SessionFeedbackBulletInput } from "./session-feedback-bullet-input";
import {
  normalizeFeedbackBullets,
  countFeedbackCharacters,
  MAX_FEEDBACK_CHARACTERS,
} from "@cogito-app/api/modules/booking/feedback-rules";

export type CompletionFeedbackDraft = {
  discussion: string[];
  strengths: string[];
  improvements: string[];
};

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
  adminMode = false,
  initialFeedback,
  requestScope,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  pending?: boolean;
  adminMode?: boolean;
  initialFeedback?: CompletionFeedbackDraft;
  requestScope?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    feedback: CompletionFeedbackDraft,
    admin: { deliveryConfirmed: boolean; reason: string; requestKey: string },
  ) => void;
}) {
  const [discussion, setDiscussion] = useState<string[]>(
    initialFeedback?.discussion ?? [""],
  );
  const [strengths, setStrengths] = useState<string[]>(
    initialFeedback?.strengths ?? [""],
  );
  const [improvements, setImprovements] = useState<string[]>(
    initialFeedback?.improvements ?? [""],
  );
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [lastSubmission, setLastSubmission] = useState<{
    payloadKey: string;
    requestKey: string;
  } | null>(null);

  const cleanDiscussion = normalizeFeedbackBullets(discussion);
  const cleanStrengths = normalizeFeedbackBullets(strengths);
  const cleanImprovements = normalizeFeedbackBullets(improvements);
  const valid =
    cleanDiscussion.length > 0 &&
    cleanStrengths.length > 0 &&
    cleanImprovements.length > 0 &&
    [discussion, strengths, improvements].every(
      (items) => countFeedbackCharacters(items) <= MAX_FEEDBACK_CHARACTERS,
    ) &&
    (!adminMode ||
      (deliveryConfirmed &&
        reason.trim().length > 0 &&
        Array.from(reason.trim()).length <= MAX_FEEDBACK_CHARACTERS));

  function reset() {
    setDiscussion([""]);
    setStrengths([""]);
    setImprovements([""]);
    setDeliveryConfirmed(false);
    setReason("");
    setLastSubmission(null);
  }

  function confirm() {
    const feedback = {
      discussion: cleanDiscussion,
      strengths: cleanStrengths,
      improvements: cleanImprovements,
    };
    const normalizedReason = adminMode ? reason.trim() : "";
    const payloadKey = JSON.stringify([
      requestScope ?? "",
      feedback,
      adminMode && deliveryConfirmed,
      normalizedReason,
    ]);
    const requestKey =
      lastSubmission?.payloadKey === payloadKey
        ? lastSubmission.requestKey
        : crypto.randomUUID();
    setLastSubmission({ payloadKey, requestKey });
    onConfirm(feedback, {
      deliveryConfirmed: adminMode ? deliveryConfirmed : true,
      reason: normalizedReason,
      requestKey,
    });
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
          <DialogTitle>
            {adminMode
              ? initialFeedback
                ? "Correct session report"
                : "Record session report"
              : "Complete session"}
          </DialogTitle>
          <DialogDescription className="text-sm md:text-base">
            {adminMode
              ? "Record the report for the assigned tutor. Confirm delivery and give an audit reason."
              : "Add your feedback from today&apos;s session."}
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
          {adminMode ? (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="admin-report-delivered"
                  checked={deliveryConfirmed}
                  onCheckedChange={(checked) =>
                    setDeliveryConfirmed(checked === true)
                  }
                  disabled={pending}
                />
                <label
                  htmlFor="admin-report-delivered"
                  className="text-sm leading-5 text-foreground"
                >
                  I confirm this session was delivered.
                </label>
              </div>
              <Field>
                <FieldLabel htmlFor="admin-report-reason">
                  Audit reason
                </FieldLabel>
                <Textarea
                  id="admin-report-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1200}
                  disabled={pending}
                  aria-describedby="admin-report-reason-description"
                />
                <FieldDescription id="admin-report-reason-description">
                  Required, up to 600 characters.
                </FieldDescription>
              </Field>
            </div>
          ) : null}
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
            onClick={() => confirm()}
            className="w-full sm:w-auto"
          >
            {adminMode
              ? initialFeedback
                ? "Save correction"
                : "Save report"
              : "Complete session"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
