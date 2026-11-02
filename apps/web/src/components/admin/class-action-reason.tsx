"use client";

import { useState, type ReactElement, type ReactNode } from "react";
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
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";

export function ClassActionReason({
  label,
  reasonLabel,
  disabled,
  onConfirm,
  trigger,
  children,
  confirmDisabled,
  onOpen,
}: {
  label: string;
  reasonLabel: string;
  disabled?: boolean;
  onConfirm: (reason: string) => Promise<unknown>;
  trigger?: ReactElement;
  children?: ReactNode;
  confirmDisabled?: boolean;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setReason("");
          onOpen?.();
        }
      }}
    >
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
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>Provide a reason to continue.</DialogDescription>
          {children}
          <Field>
            <FieldLabel required>{reasonLabel}</FieldLabel>
            <Textarea
              aria-label={reasonLabel}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={4}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Back
          </Button>
          <Button
            disabled={disabled || confirmDisabled || reason.trim().length < 3}
            onClick={() => {
              void onConfirm(reason.trim())
                .then(() => setOpen(false))
                .catch(() => {});
            }}
          >
            Confirm {label.toLowerCase()}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
