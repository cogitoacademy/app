"use client";

import { useId, useState, type ReactElement, type ReactNode } from "react";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@cogito-app/ui/components/selia/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";

/**
 * Run an action through a reason prompt. The trigger opens the dialog, and the
 * confirmation button submits the action with the entered reason.
 */
export function ActionReasonDialog({
  label,
  reasonLabel,
  description = "Provide a reason to continue.",
  confirmLabel,
  onConfirm,
  disabled = false,
  confirmDisabled = false,
  minLength = 3,
  maxLength = 500,
  trigger,
  children,
  onOpen,
}: {
  label: string;
  reasonLabel: string;
  description?: ReactNode;
  confirmLabel?: string;
  onConfirm: (reason: string) => Promise<unknown>;
  disabled?: boolean;
  confirmDisabled?: boolean;
  minLength?: number;
  maxLength?: number;
  trigger?: ReactElement;
  children?: ReactNode;
  onOpen?: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const trimmed = reason.trim();
  const valid = trimmed.length >= minLength && trimmed.length <= maxLength;
  const changeOpen = (next: boolean) => {
    if (!next && submitting) return;
    setOpen(next);
    if (next) {
      setReason("");
      setError(null);
      onOpen?.();
    }
  };
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              aria-label={label}
            />
          )
        }
      >
        {trigger
          ? (trigger as ReactElement<{ children?: ReactNode }>).props.children
          : label}
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader className="flex-col items-start gap-1.5">
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {children}
          <Field>
            <FieldLabel htmlFor={id} required>
              {reasonLabel}
            </FieldLabel>
            <Textarea
              id={id}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={submitting}
              required
              aria-required="true"
              minLength={minLength}
              maxLength={maxLength}
              rows={4}
              aria-describedby={`${id}-description`}
            />
            <FieldDescription id={`${id}-description`}>
              {minLength > 1
                ? `${minLength}–${maxLength} characters.`
                : `Maximum ${maxLength} characters.`}
            </FieldDescription>
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={submitting}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!valid || disabled || confirmDisabled || submitting}
            progress={submitting}
            onClick={() => {
              setSubmitting(true);
              setError(null);
              void onConfirm(trimmed)
                .then(() => {
                  setOpen(false);
                  setReason("");
                })
                .catch((failure: unknown) => {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "The action could not be completed.",
                  );
                })
                .finally(() => setSubmitting(false));
            }}
          >
            {confirmLabel ?? `Confirm ${label.toLowerCase()}`}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
