"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { cn } from "@cogito-app/ui/lib/utils";

import { resolveProfileImageUrl } from "@/lib/profile-image-url";
import { uploadImage } from "@/lib/upload-image";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export function ImageUploadField({
  id,
  label,
  description,
  value,
  onChange,
  disabled = false,
  error: externalError,
  previewClassName,
}: {
  id: string;
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  previewClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const preview =
    value && value !== failedUrl ? resolveProfileImageUrl(value) : undefined;
  const shownError = externalError || error;

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setError(null);
    setUploading(true);

    try {
      const image = await uploadImage(file);
      onChange(image.url);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Image could not be uploaded.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={IMAGE_ACCEPT}
        disabled={disabled || uploading}
        className="sr-only"
        onChange={(event) => void handleFileChange(event)}
      />
      {preview ? (
        <img
          src={preview}
          alt=""
          className={cn(
            "rounded-md border border-border bg-item object-cover",
            previewClassName ?? "h-28 w-44",
          )}
          onError={() => setFailedUrl(value)}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={preview ? "secondary" : "primary"}
          size="sm"
          progress={uploading}
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {preview ? "Replace image" : "Upload image"}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="plain"
            size="sm"
            className="text-danger"
            disabled={disabled || uploading}
            onClick={() => {
              onChange("");
              setError(null);
            }}
          >
            Remove image
          </Button>
        ) : null}
      </div>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {shownError ? <FieldError>{shownError}</FieldError> : null}
    </Field>
  );
}
