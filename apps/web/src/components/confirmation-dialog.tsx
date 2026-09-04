"use client";

import type { ReactNode } from "react";
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

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmVariant = "primary",
  pending = false,
  confirmDisabled = false,
  children,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  pending?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && pending) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogPopup>
        <DialogHeader className="flex-col items-start gap-1.5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children ? <DialogBody>{children}</DialogBody> : null}
        <DialogFooter className="flex-col-reverse items-stretch sm:flex-row sm:items-center">
          <Button
            variant="secondary"
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending || confirmDisabled}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            variant={confirmVariant}
            type="button"
            onClick={onConfirm}
            progress={pending}
            disabled={pending}
            className="w-full sm:w-auto"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
