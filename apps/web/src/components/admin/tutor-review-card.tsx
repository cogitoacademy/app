"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardBody,
  CardHeader,
  CardHeaderAction,
  CardTitle,
  CardFooter,
} from "@cogito-app/ui/components/selia/card";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@cogito-app/ui/components/selia/dialog";
import { orpc } from "@/utils/orpc";

const FLOOR_ONLINE: Record<string, number> = {
  "1": 42,
  "2": 35,
  "3": 28,
  "4": 24,
  "5": 21,
  "6": 19,
};
const FLOOR_OFFLINE: Record<string, number> = {
  "1": 50,
  "2": 45,
  "3": 40,
  "4": 35,
  "5": 30,
  "6": 27,
};

const STATUS_BADGE: Record<
  string,
  {
    label: string;
    variant:
      | "primary"
      | "secondary"
      | "danger"
      | "warning"
      | "success"
      | "info";
  }
> = {
  draft: { label: "Draft", variant: "secondary" },
  pending_review: { label: "Pending Review", variant: "warning" },
  changes_requested: { label: "Changes Requested", variant: "danger" },
  approved_unpublished: { label: "Approved (unpublished)", variant: "info" },
  published: { label: "Published", variant: "success" },
  suspended: { label: "Suspended", variant: "danger" },
};

interface TutorReviewCardProps {
  profile: {
    id: string;
    displayName: string | null;
    shortBio: string | null;
    credentialsSummary: string | null;
    expertise: string[] | null;
    modality: string | null;
    prices: Record<string, number> | null;
    availabilitySummary: string | null;
    onboardingStatus: string;
    adminReviewNote: string | null;
    user?: {
      name: string;
      email: string;
    } | null;
  };
  onAction?: () => void;
}

export function TutorReviewCard({ profile, onAction }: TutorReviewCardProps) {
  const queryClient = useQueryClient();
  const [noteAction, setNoteAction] = useState<
    "request_changes" | "suspend" | null
  >(null);
  const [adminNote, setAdminNote] = useState("");
  const reviewMutation = useMutation(
    orpc.adminTutor.reviewTutorProfile.mutationOptions({
      onSuccess: () => {
        setNoteAction(null);
        setAdminNote("");
        void queryClient.invalidateQueries({
          queryKey: orpc.adminTutor.listTutorProfiles.key(),
        });
        onAction?.();
      },
      onError: (error: unknown) => {
        const message =
          error && typeof error === "object" && "message" in error
            ? String((error as { message?: string }).message)
            : "Failed to update profile";
        toastManager.add({ title: message, type: "error" });
      },
    }),
  );

  function handleAction(
    action:
      | "request_changes"
      | "approve_unpublished"
      | "publish"
      | "unpublish"
      | "suspend",
    note?: string,
  ) {
    reviewMutation.mutate({
      tutorProfileId: profile.id,
      action,
      adminNote: note,
    });
  }

  function submitNoteAction() {
    const note = adminNote.trim();
    if (!noteAction || !note) return;
    handleAction(noteAction, note);
  }

  const badge = STATUS_BADGE[profile.onboardingStatus] ?? {
    label: profile.onboardingStatus,
    variant: "secondary" as const,
  };

  const floorPrices =
    profile.modality === "offline" ? FLOOR_OFFLINE : FLOOR_ONLINE;

  return (
    <>
      <Card className="flex h-full min-w-0 flex-col overflow-hidden">
        <CardHeader className="items-start">
          <div className="min-w-0">
            <CardTitle className="truncate">
              {profile.displayName ?? "Unnamed Tutor"}
            </CardTitle>
            {profile.user && (
              <Text className="mt-1 truncate text-sm text-muted">
                {profile.user.email}
              </Text>
            )}
          </div>
          <CardHeaderAction>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </CardHeaderAction>
        </CardHeader>
        <CardBody className="flex-1">
          <Stack direction="column" spacing="md">
            {profile.shortBio ? (
              <Text className="leading-relaxed text-muted">
                {profile.shortBio}
              </Text>
            ) : (
              <Text className="text-sm italic text-dimmed">
                No bio provided.
              </Text>
            )}
            {profile.credentialsSummary && (
              <div>
                <Text className="text-xs font-semibold uppercase tracking-wide text-dimmed">
                  Credentials
                </Text>
                <Text className="mt-1 text-sm">
                  {profile.credentialsSummary}
                </Text>
              </div>
            )}
            {profile.expertise && profile.expertise.length > 0 && (
              <div>
                <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
                  Expertise
                </Text>
                <div className="flex flex-wrap gap-1.5">
                  {profile.expertise.map((e) => (
                    <Badge key={e} variant="secondary">
                      {e}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {profile.modality && (
              <div className="flex items-center justify-between rounded-lg bg-accent p-3">
                <Text className="text-sm text-muted">Teaching mode</Text>
                <Badge variant="info" className="capitalize">
                  {profile.modality}
                </Badge>
              </div>
            )}
            {profile.prices && (
              <div>
                <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
                  Marks per student
                </Text>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Object.entries(profile.prices).map(([size, price]) => {
                    const floor = floorPrices[size];
                    const belowFloor = floor !== undefined && price < floor;
                    return (
                      <div
                        key={size}
                        className="rounded-lg border border-item-border bg-item p-2.5"
                      >
                        <Text className="text-xs text-muted">
                          {size} {size === "1" ? "student" : "students"}
                        </Text>
                        <Text
                          className={
                            belowFloor
                              ? "font-semibold text-danger"
                              : "font-semibold"
                          }
                        >
                          {price} Marks
                        </Text>
                        <Text className="text-xs text-dimmed">
                          Floor {floor ?? "-"}
                        </Text>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {profile.availabilitySummary && (
              <div className="rounded-lg bg-accent p-3">
                <Text className="text-xs text-muted">Availability</Text>
                <Text className="mt-1 text-sm font-medium">
                  {profile.availabilitySummary}
                </Text>
              </div>
            )}
            {profile.adminReviewNote && (
              <div className="rounded-lg border border-warning-border bg-warning/10 p-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-warning">
                  Latest admin note
                </Text>
                <Text className="mt-1 text-sm">{profile.adminReviewNote}</Text>
              </div>
            )}

            {profile.onboardingStatus === "changes_requested" && (
              <Text className="text-sm text-muted italic">
                Awaiting tutor updates
              </Text>
            )}
          </Stack>
        </CardBody>
        <CardFooter className="flex-wrap gap-2">
          {profile.onboardingStatus === "pending_review" && (
            <Stack direction="row" spacing="sm" className="flex-wrap">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setNoteAction("request_changes")}
              >
                Request Changes
              </Button>
              <Button
                size="sm"
                onClick={() => handleAction("approve_unpublished")}
              >
                Approve (unpublished)
              </Button>
              <Button size="sm" onClick={() => handleAction("publish")}>
                Publish
              </Button>
            </Stack>
          )}

          {profile.onboardingStatus === "approved_unpublished" && (
            <Stack direction="row" spacing="sm" className="flex-wrap">
              <Button size="sm" onClick={() => handleAction("publish")}>
                Publish Now
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setNoteAction("request_changes")}
              >
                Request Changes
              </Button>
            </Stack>
          )}

          {profile.onboardingStatus === "published" && (
            <Stack direction="row" spacing="sm" className="flex-wrap">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleAction("unpublish")}
              >
                Unpublish
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => setNoteAction("suspend")}
              >
                Suspend
              </Button>
            </Stack>
          )}
        </CardFooter>
      </Card>

      <Dialog
        open={noteAction !== null}
        onOpenChange={(open) => {
          if (!open && !reviewMutation.isPending) {
            setNoteAction(null);
            setAdminNote("");
          }
        }}
      >
        <DialogPopup>
          <DialogHeader className="flex-col items-start gap-1.5">
            <DialogTitle>
              {noteAction === "suspend"
                ? "Suspend tutor?"
                : "Request profile changes?"}
            </DialogTitle>
            <DialogDescription>
              {noteAction === "suspend"
                ? "Explain why this tutor is being removed from discovery."
                : "Explain what the tutor must update before another review."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field>
              <FieldLabel>Admin note</FieldLabel>
              <Input
                value={adminNote}
                onChange={(event) => setAdminNote(event.target.value)}
                placeholder={
                  noteAction === "suspend"
                    ? "Reason for suspension"
                    : "Changes required"
                }
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setNoteAction(null);
                setAdminNote("");
              }}
              disabled={reviewMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant={noteAction === "suspend" ? "danger" : "primary"}
              onClick={submitNoteAction}
              progress={reviewMutation.isPending}
              disabled={!adminNote.trim() || reviewMutation.isPending}
            >
              {noteAction === "suspend" ? "Suspend tutor" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
