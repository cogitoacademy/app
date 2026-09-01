"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
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
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { cn } from "@cogito-app/ui/lib/utils";
import { IconPencil } from "@tabler/icons-react";

import { getUserFacingError } from "@/lib/error-message";
import { resolveProfileImageUrl } from "@/lib/profile-image-url";
import { client } from "@/utils/orpc";

const PROFILE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const CROP_OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const DEFAULT_VIEWPORT_SIZE = 288;

type ProfileImageType = (typeof PROFILE_IMAGE_TYPES)[number];

type ImageDimensions = {
  width: number;
  height: number;
};

type Point = {
  x: number;
  y: number;
};

type DragState = Point & {
  pointerId: number;
  startX: number;
  startY: number;
};

function isProfileImageType(value: string): value is ProfileImageType {
  return PROFILE_IMAGE_TYPES.includes(value as ProfileImageType);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getImageLayout(
  dimensions: ImageDimensions,
  viewportSize: number,
  zoom: number,
) {
  const fitScale = Math.max(
    viewportSize / dimensions.width,
    viewportSize / dimensions.height,
  );
  const scale = fitScale * zoom;

  return {
    width: dimensions.width * scale,
    height: dimensions.height * scale,
  };
}

function clampOffset(
  offset: Point,
  dimensions: ImageDimensions,
  viewportSize: number,
  zoom: number,
): Point {
  const layout = getImageLayout(dimensions, viewportSize, zoom);

  return {
    x: clamp(
      offset.x,
      -(layout.width - viewportSize) / 2,
      (layout.width - viewportSize) / 2,
    ),
    y: clamp(
      offset.y,
      -(layout.height - viewportSize) / 2,
      (layout.height - viewportSize) / 2,
    ),
  };
}

function cropImageToBlob({
  image,
  dimensions,
  viewportSize,
  zoom,
  offset,
}: {
  image: HTMLImageElement;
  dimensions: ImageDimensions;
  viewportSize: number;
  zoom: number;
  offset: Point;
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CROP_OUTPUT_SIZE;
  canvas.height = CROP_OUTPUT_SIZE;

  const context = canvas.getContext("2d");
  if (!context) {
    return Promise.reject(new Error("Photo editor is not available."));
  }

  const layout = getImageLayout(dimensions, viewportSize, zoom);
  const outputScale = CROP_OUTPUT_SIZE / viewportSize;
  const imageLeft = (viewportSize - layout.width) / 2 + offset.x;
  const imageTop = (viewportSize - layout.height) / 2 + offset.y;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    imageLeft * outputScale,
    imageTop * outputScale,
    layout.width * outputScale,
    layout.height * outputScale,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("The cropped photo could not be prepared."));
        }
      },
      "image/jpeg",
      0.9,
    );
  });
}

async function uploadProfileImage(blob: Blob): Promise<string> {
  const signed = await client.upload.createUploadUrl({
    filename: "profile-image.jpg",
    contentType: "image/jpeg",
    contentLength: blob.size,
  });

  if (blob.size > signed.maxBytes) {
    throw new Error("Photo is larger than 5 MB after cropping.");
  }

  const uploadUrl =
    resolveProfileImageUrl(signed.uploadUrl) ?? signed.uploadUrl;
  const isLocalUpload = signed.uploadUrl.startsWith("/");
  const fields = signed.fields ?? {};
  let response: Response;

  if (Object.keys(fields).length > 0) {
    const body = new FormData();
    Object.entries(fields).forEach(([key, value]) => body.append(key, value));
    body.append("file", blob, "profile-image.jpg");
    response = await fetch(uploadUrl, {
      method: signed.method,
      body,
    });
  } else {
    // Local development storage accepts the raw request body. Include the
    // session cookie because the web app and API commonly use different ports.
    response = await fetch(uploadUrl, {
      method: signed.method,
      credentials: isLocalUpload ? "include" : "omit",
      headers: { "content-type": "image/jpeg" },
      body: blob,
    });
  }

  if (!response.ok) {
    throw new Error("Photo upload failed.");
  }

  return resolveProfileImageUrl(signed.publicUrl) ?? signed.publicUrl;
}

export function ProfileImagePicker({
  id,
  image,
  onImageChange,
  onUploadingChange,
  disabled = false,
  compactTrigger,
}: {
  id: string;
  image: string;
  onImageChange: (value: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
  compactTrigger?: ReactNode;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropViewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] =
    useState<ImageDimensions | null>(null);
  const [viewportSize, setViewportSize] = useState(DEFAULT_VIEWPORT_SIZE);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoReadyToSave, setPhotoReadyToSave] = useState(false);

  const dialogOpen = previewUrl !== null;

  useEffect(() => {
    if (!previewUrl) return;

    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    const element = cropViewportRef.current;
    if (!element) return;

    const updateViewportSize = () => {
      const nextSize = Math.round(element.getBoundingClientRect().width);
      if (nextSize > 0) {
        setViewportSize((current) =>
          current === nextSize ? current : nextSize,
        );
      }
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, [previewUrl]);

  useEffect(() => {
    if (!imageDimensions) return;

    setOffset((current) =>
      clampOffset(current, imageDimensions, viewportSize, zoom),
    );
  }, [imageDimensions, viewportSize, zoom]);

  function setUploadPending(nextValue: boolean) {
    setIsUploading(nextValue);
    onUploadingChange?.(nextValue);
  }

  function closeCropDialog() {
    if (isUploading) return;
    setPreviewUrl(null);
    setError(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";

    if (!file) return;

    if (!isProfileImageType(file.type)) {
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }

    if (file.size > MAX_PROFILE_IMAGE_BYTES) {
      setError("Photo must be 5 MB or smaller.");
      return;
    }

    setPhotoReadyToSave(false);
    setImageDimensions(null);
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleImageLoad(event: SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (!naturalWidth || !naturalHeight) {
      setError("This image could not be loaded. Choose another file.");
      return;
    }

    setImageDimensions({ width: naturalWidth, height: naturalHeight });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!imageDimensions || isUploading) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: offset.x,
      y: offset.y,
    };
    setIsDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !imageDimensions) {
      return;
    }

    setOffset(
      clampOffset(
        {
          x: drag.x + event.clientX - drag.startX,
          y: drag.y + event.clientY - drag.startY,
        },
        imageDimensions,
        viewportSize,
        zoom,
      ),
    );
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;

    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function handleUsePhoto() {
    if (!previewUrl || !imageDimensions || !imageRef.current) return;

    setError(null);
    setUploadPending(true);

    try {
      const croppedImage = await cropImageToBlob({
        image: imageRef.current,
        dimensions: imageDimensions,
        viewportSize,
        zoom,
        offset: clampOffset(offset, imageDimensions, viewportSize, zoom),
      });
      const publicUrl = await uploadProfileImage(croppedImage);

      onImageChange(publicUrl);
      setPhotoReadyToSave(true);
      setPreviewUrl(null);
      toastManager.add({
        title: "Profile photo ready",
        description: "Save your account details to apply the new photo.",
        type: "success",
      });
    } catch (uploadError) {
      const message = getUserFacingError(
        uploadError,
        "Photo could not be uploaded. Please try again.",
      );
      setError(message);
      toastManager.add({
        title: "Photo could not be uploaded",
        description: message,
        type: "error",
      });
    } finally {
      setUploadPending(false);
    }
  }

  return (
    <>
      <Field className={compactTrigger ? "w-fit" : undefined}>
        <FieldLabel
          htmlFor={id}
          className={compactTrigger ? "sr-only" : undefined}
        >
          Profile photo
        </FieldLabel>
        <Input
          ref={fileInputRef}
          id={id}
          name={id}
          type="file"
          accept={PROFILE_IMAGE_TYPES.join(",")}
          disabled={disabled || isUploading}
          aria-invalid={error ? true : undefined}
          className={compactTrigger ? "sr-only" : undefined}
          onChange={handleFileChange}
        />
        {compactTrigger ? (
          <Button
            type="button"
            variant="plain"
            className="group size-auto rounded-full p-0!"
            aria-label="Change profile photo"
            disabled={disabled || isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {compactTrigger}
            <span className="absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full border border-card-border bg-card text-foreground shadow transition-colors group-hover:bg-accent">
              <IconPencil className="size-3.5" aria-hidden="true" />
            </span>
          </Button>
        ) : null}
        {!compactTrigger ? (
          <FieldDescription>
            JPG, PNG, or WebP, maximum 5 MB. After choosing a photo, drag and
            zoom until the part you want sits inside the circle.
          </FieldDescription>
        ) : null}
        {photoReadyToSave ? (
          <Text className="text-sm text-success">
            Photo uploaded. Save account details to apply it.
          </Text>
        ) : null}
        {image && !disabled && !compactTrigger ? (
          <Button
            type="button"
            variant="plain"
            size="sm"
            className="w-fit text-danger"
            onClick={() => {
              onImageChange("");
              setPhotoReadyToSave(false);
            }}
            disabled={isUploading}
          >
            Remove photo
          </Button>
        ) : null}
        {error && !dialogOpen ? <FieldError>{error}</FieldError> : null}
      </Field>

      <Dialog
        open={dialogOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeCropDialog();
        }}
      >
        <DialogPopup className="sm:max-w-lg">
          <DialogHeader className="flex-col items-start gap-1.5">
            <DialogTitle>Adjust your profile photo</DialogTitle>
            <DialogDescription>
              Drag the image to choose what appears in your profile circle. You
              can also zoom in for a closer crop.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col items-center gap-5">
            <div
              ref={cropViewportRef}
              className={cn(
                "relative aspect-square w-full max-w-72 overflow-hidden rounded-lg bg-foreground/10 touch-none select-none",
                isDragging ? "cursor-grabbing" : "cursor-grab",
              )}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {previewUrl && imageDimensions ? (
                <img
                  ref={imageRef}
                  src={previewUrl}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                  style={(() => {
                    const layout = getImageLayout(
                      imageDimensions,
                      viewportSize,
                      zoom,
                    );
                    return {
                      width: `${layout.width}px`,
                      height: `${layout.height}px`,
                      transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                    };
                  })()}
                  onLoad={handleImageLoad}
                  onError={() =>
                    setError(
                      "This image could not be loaded. Choose another file.",
                    )
                  }
                  draggable={false}
                />
              ) : previewUrl ? (
                <img
                  ref={imageRef}
                  src={previewUrl}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 size-full object-contain"
                  onLoad={handleImageLoad}
                  onError={() =>
                    setError(
                      "This image could not be loaded. Choose another file.",
                    )
                  }
                  draggable={false}
                />
              ) : null}
              {imageDimensions ? (
                <>
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_49%,rgb(0_0_0_/_0.58)_50%,rgb(0_0_0_/_0.58)_100%)]" />
                  <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/90 shadow-[0_0_0_1px_rgb(0_0_0_/_0.3)]" />
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                  <Text className="text-muted">Preparing your photo...</Text>
                </div>
              )}
            </div>

            <div className="w-full max-w-72">
              <div className="flex items-center justify-between gap-3">
                <Text className="text-sm font-medium">Zoom</Text>
                <Text className="text-sm text-muted">
                  {Math.round(zoom * 100)}%
                </Text>
              </div>
              <Input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                aria-label="Zoom profile photo"
                disabled={!imageDimensions || isUploading}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
              <Text className="text-xs text-muted">
                The area inside the circle becomes your avatar.
              </Text>
            </div>
            {error ? (
              <Text className="w-full max-w-72 text-danger" role="alert">
                {error}
              </Text>
            ) : null}
          </DialogBody>
          <DialogFooter className="flex-col-reverse items-stretch sm:flex-row sm:items-center">
            <Button
              variant="secondary"
              type="button"
              onClick={closeCropDialog}
              disabled={isUploading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleUsePhoto()}
              progress={isUploading}
              disabled={!imageDimensions || isUploading}
              className="w-full sm:w-auto"
            >
              Use this photo
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
