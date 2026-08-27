"use client";

import { type ReactNode, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@cogito-app/ui/components/selia/avatar";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardHeaderAction,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
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
import { Input } from "@cogito-app/ui/components/selia/input";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import {
  IconAlertTriangle,
  IconCalendarClock,
  IconCertificate,
  IconMail,
  IconSchool,
} from "@tabler/icons-react";

import { getUserFacingError } from "@/lib/error-message";
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
  pending_review: { label: "Needs review", variant: "warning" },
  changes_requested: { label: "Changes requested", variant: "danger" },
  approved_unpublished: { label: "Approved", variant: "info" },
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
    pendingProfileChanges: Record<string, unknown> | null;
    profileEditStatus: string;
    profileEditAdminNote: string | null;
    user?: { name: string; email: string } | null;
  };
  subjectLabels: ReadonlyMap<string, string>;
  onAction?: () => void;
}

function getInitials(name?: string | null) {
  return (name ?? "Tutor")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatPendingField(field: string) {
  if (field === "subjectIds") return "Subjects";
  return field.replace(/([A-Z])/g, " $1");
}

function PendingChangeValue({
  field,
  value,
  subjectLabels,
}: {
  field: string;
  value: unknown;
  subjectLabels: ReadonlyMap<string, string>;
}) {
  if (field === "subjectIds" && Array.isArray(value)) {
    return (
      <div
        className="flex min-w-0 flex-wrap gap-1.5"
        aria-label="Proposed subjects"
      >
        {value.map((subjectId) => {
          const id = String(subjectId);
          return (
            <Badge
              key={id}
              variant="secondary"
              className="h-auto min-h-5.5 max-w-full whitespace-normal break-words py-0.5"
            >
              {subjectLabels.get(id) ?? "Subject unavailable"}
            </Badge>
          );
        })}
      </div>
    );
  }

  const displayValue =
    value === null || value === undefined
      ? "—"
      : Array.isArray(value)
        ? value.map((entry) => String(entry)).join(", ")
        : typeof value === "object"
          ? (JSON.stringify(value) ?? "—")
          : String(value);

  return (
    <Text className="break-words text-sm font-medium">{displayValue}</Text>
  );
}

export function TutorReviewCard({
  profile,
  subjectLabels,
  onAction,
}: TutorReviewCardProps) {
  const queryClient = useQueryClient();
  const [noteAction, setNoteAction] = useState<
    "request_changes" | "request_edit_changes" | "suspend" | null
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
        toastManager.add({ title: "Tutor profile updated", type: "success" });
        onAction?.();
      },
      onError: (error: unknown) => {
        toastManager.add({
          title: "Tutor profile could not be updated",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );

  function handleAction(
    action:
      | "request_changes"
      | "approve_unpublished"
      | "publish"
      | "unpublish"
      | "suspend"
      | "approve_edits"
      | "request_edit_changes",
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
    if (noteAction && note) handleAction(noteAction, note);
  }

  const badge =
    profile.profileEditStatus === "pending_review"
      ? ({ label: "Edit review", variant: "warning" } as const)
      : (STATUS_BADGE[profile.onboardingStatus] ?? {
          label: profile.onboardingStatus,
          variant: "secondary" as const,
        });
  const floorPrices =
    profile.modality === "offline" ? FLOOR_OFFLINE : FLOOR_ONLINE;
  const priceEntries = Object.entries(profile.prices ?? {}).toSorted(
    ([a], [b]) => Number(a) - Number(b),
  );
  const reviewAction = reviewMutation.variables?.action;
  const isPending = reviewMutation.isPending;

  return (
    <>
      <Card className="flex h-full min-w-0 flex-col overflow-hidden">
        <CardHeader className="items-start">
          <Avatar>
            <AvatarFallback>
              {getInitials(profile.displayName ?? profile.user?.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <CardTitle className="truncate">
              {profile.displayName ?? profile.user?.name ?? "Unnamed tutor"}
            </CardTitle>
            {profile.user ? (
              <div className="mt-1 flex items-center gap-1.5 text-muted">
                <IconMail className="size-3.5 shrink-0" />
                <Text className="truncate text-sm">{profile.user.email}</Text>
              </div>
            ) : null}
          </div>
          <CardHeaderAction>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </CardHeaderAction>
        </CardHeader>

        <CardBody className="flex-1">
          <Stack direction="column" spacing="md" className="m-0!">
            <Text
              className={
                profile.shortBio
                  ? "leading-relaxed text-muted"
                  : "italic text-dimmed"
              }
            >
              {profile.shortBio ?? "No tutor introduction provided."}
            </Text>

            <div className="grid gap-3 sm:grid-cols-2">
              <ReviewDetail
                icon={<IconSchool />}
                label="Teaching mode"
                value={
                  profile.modality
                    ? `${profile.modality} sessions`
                    : "Not specified"
                }
                capitalize={Boolean(profile.modality)}
              />
              <ReviewDetail
                icon={<IconCalendarClock />}
                label="Availability"
                value={profile.availabilitySummary ?? "Not specified"}
              />
            </div>

            <section>
              <div className="mb-2 flex items-center gap-2">
                <IconCertificate className="size-4 text-muted" />
                <Text className="text-xs font-semibold uppercase tracking-wide text-dimmed">
                  Credentials
                </Text>
              </div>
              <Text
                className={
                  profile.credentialsSummary
                    ? "text-sm"
                    : "text-sm italic text-dimmed"
                }
              >
                {profile.credentialsSummary ?? "No credentials provided."}
              </Text>
            </section>

            <section>
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
                Expertise
              </Text>
              {profile.expertise?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.expertise.map((expertise) => (
                    <Badge key={expertise} variant="secondary">
                      {expertise}
                    </Badge>
                  ))}
                </div>
              ) : (
                <Text className="text-sm italic text-dimmed">
                  No subjects listed.
                </Text>
              )}
            </section>

            <section>
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-dimmed">
                Marks per student
              </Text>
              {priceEntries.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {priceEntries.map(([size, price]) => {
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
                              ? "mt-0.5 font-semibold text-danger"
                              : "mt-0.5 font-semibold"
                          }
                        >
                          {price} Marks
                        </Text>
                        <Text
                          className={
                            belowFloor
                              ? "mt-1 flex items-center gap-1 text-xs text-danger"
                              : "mt-1 text-xs text-dimmed"
                          }
                        >
                          {belowFloor ? (
                            <IconAlertTriangle className="size-3" />
                          ) : null}
                          Minimum {floor ?? "—"}
                        </Text>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Text className="text-sm italic text-dimmed">
                  No price list provided.
                </Text>
              )}
            </section>

            {profile.adminReviewNote ? (
              <div className="rounded-lg border border-warning-border bg-warning/10 p-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-warning">
                  Latest review note
                </Text>
                <Text className="mt-1 text-sm">{profile.adminReviewNote}</Text>
              </div>
            ) : null}
            {profile.pendingProfileChanges ? (
              <section className="rounded-lg border border-warning-border bg-warning/10 p-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-warning">
                  Proposed profile changes
                </Text>
                <Stack spacing="sm" className="mt-2">
                  {Object.entries(profile.pendingProfileChanges).map(
                    ([field, value]) => (
                      <div key={field} className="min-w-0">
                        <Text className="text-xs capitalize text-muted">
                          {formatPendingField(field)}
                        </Text>
                        <PendingChangeValue
                          field={field}
                          value={value}
                          subjectLabels={subjectLabels}
                        />
                      </div>
                    ),
                  )}
                </Stack>
                {profile.profileEditAdminNote ? (
                  <Text className="mt-2 text-sm">
                    {profile.profileEditAdminNote}
                  </Text>
                ) : null}
              </section>
            ) : null}
          </Stack>
        </CardBody>

        <CardFooter className="flex-wrap gap-2">
          {profile.onboardingStatus === "published" &&
          profile.profileEditStatus === "pending_review" ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setNoteAction("request_edit_changes")}
                disabled={isPending}
              >
                Request revision
              </Button>
              <Button
                size="sm"
                onClick={() => handleAction("approve_edits")}
                progress={isPending && reviewAction === "approve_edits"}
                disabled={isPending}
              >
                Approve changes
              </Button>
            </>
          ) : null}
          {profile.onboardingStatus === "pending_review" ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setNoteAction("request_changes")}
                disabled={isPending}
              >
                Request changes
              </Button>
              <Button
                size="sm"
                onClick={() => handleAction("approve_unpublished")}
                progress={isPending && reviewAction === "approve_unpublished"}
                disabled={isPending}
              >
                Approve profile
              </Button>
            </>
          ) : null}

          {profile.onboardingStatus === "approved_unpublished" ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setNoteAction("request_changes")}
                disabled={isPending}
              >
                Request changes
              </Button>
              <Button
                size="sm"
                onClick={() => handleAction("publish")}
                progress={isPending && reviewAction === "publish"}
                disabled={isPending}
              >
                Publish profile
              </Button>
            </>
          ) : null}

          {profile.onboardingStatus === "published" &&
          profile.profileEditStatus !== "pending_review" ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleAction("unpublish")}
                progress={isPending && reviewAction === "unpublish"}
                disabled={isPending}
              >
                Unpublish
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => setNoteAction("suspend")}
                disabled={isPending}
              >
                Suspend
              </Button>
            </>
          ) : null}
        </CardFooter>
      </Card>

      <Dialog
        open={noteAction !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) {
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
                : noteAction === "request_edit_changes"
                  ? "Request revisions?"
                  : "Request profile changes?"}
            </DialogTitle>
            <DialogDescription>
              {noteAction === "suspend"
                ? "Explain why this tutor is being removed from discovery."
                : "Give clear, actionable feedback before the tutor resubmits."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field>
              <FieldLabel htmlFor="tutor-review-note">Review note</FieldLabel>
              <FieldDescription>
                This note will be visible to the tutor.
              </FieldDescription>
              <Input
                id="tutor-review-note"
                value={adminNote}
                onChange={(event) => setAdminNote(event.target.value)}
                placeholder={
                  noteAction === "suspend"
                    ? "Reason for suspension"
                    : "What needs to be updated?"
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
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant={noteAction === "suspend" ? "danger" : "primary"}
              onClick={submitNoteAction}
              progress={isPending}
              disabled={!adminNote.trim() || isPending}
            >
              {noteAction === "suspend" ? "Suspend tutor" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}

function ReviewDetail({
  icon,
  label,
  value,
  capitalize = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="rounded-lg bg-accent p-3">
      <div className="flex items-center gap-1.5 text-muted">
        {icon}
        <Text className="text-xs">{label}</Text>
      </div>
      <Text
        className={
          capitalize
            ? "mt-1 text-sm font-medium capitalize"
            : "mt-1 text-sm font-medium"
        }
      >
        {value}
      </Text>
    </div>
  );
}
