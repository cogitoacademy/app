"use client";

import { useEffect, useState } from "react";
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
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";

export function ManualMeetingLinkDialog({
  open,
  onOpenChange,
  onSubmit,
  pending = false,
  initialUrl,
  actor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (url: string) => void;
  pending?: boolean;
  initialUrl?: string | null;
  actor: "tutor" | "admin";
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUrl(initialUrl ?? "");
      setValidationError(null);
    }
  }, [initialUrl, open]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setValidationError("Paste the meeting link before saving.");
      return;
    }

    try {
      const parsed = new URL(trimmedUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setValidationError(
          "Use a web link that starts with http:// or https://.",
        );
        return;
      }
    } catch {
      setValidationError("Enter a complete meeting link, including https://.");
      return;
    }

    setValidationError(null);
    onSubmit(trimmedUrl);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
    >
      <DialogPopup className="sm:max-w-lg">
        <form className="contents" onSubmit={submit}>
          <DialogHeader className="flex-col items-start gap-1">
            <DialogTitle>
              {initialUrl ? "Replace meeting link" : "Add meeting link"}
            </DialogTitle>
            <DialogDescription>
              Automatic Google Meet setup may be unavailable. Paste the link
              students should use for this session.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field>
              <FieldLabel htmlFor="manual-meeting-link">
                Meeting link
              </FieldLabel>
              <Input
                id="manual-meeting-link"
                type="url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder="https://meet.google.com/..."
                autoComplete="url"
                aria-invalid={validationError ? true : undefined}
                disabled={pending}
              />
              {validationError ? (
                <FieldError>{validationError}</FieldError>
              ) : (
                <FieldDescription>
                  {actor === "tutor"
                    ? "Use the link you want the student to open at session time."
                    : "You can use Google Meet, Zoom, or another trusted meeting provider."}
                </FieldDescription>
              )}
            </Field>
          </DialogBody>
          <DialogFooter className="flex-col-reverse items-stretch sm:flex-row sm:items-center">
            <Button
              variant="secondary"
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              progress={pending}
              disabled={pending}
              className="w-full sm:w-auto"
            >
              Save meeting link
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
