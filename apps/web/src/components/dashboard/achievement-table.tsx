"use client";

import { useEffect, useState } from "react";
import {
  IconCheck,
  IconEdit,
  IconExternalLink,
  IconEye,
  IconPhoto,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@cogito-app/ui/components/selia/avatar";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPopup,
  DrawerTitle,
} from "@cogito-app/ui/components/selia/drawer";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@cogito-app/ui/components/selia/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@cogito-app/ui/components/selia/table";
import { Text } from "@cogito-app/ui/components/selia/text";

export type StudentAchievementTableItem = {
  id: string;
  eventName: string;
  category: string;
  award: string;
  level: string;
  awardingDate: string | null;
  location: string | null;
  description: string | null;
  subjects?: string[] | null;
  evidenceUrl: string | null;
  documentationUrl?: string | null;
  status: string;
  adminNote: string | null;
  userId?: string | null;
  student?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
};

const STATUS_CONFIG: Record<
  string,
  { variant: "secondary" | "warning" | "success" | "danger"; label: string }
> = {
  pending: { variant: "warning", label: "Pending" },
  pending_review: { variant: "warning", label: "Pending" },
  approved: { variant: "success", label: "Approved" },
  rejected: { variant: "danger", label: "Rejected" },
  archived: { variant: "secondary", label: "Archived" },
};

export function formatAchievementDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatAchievementLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function AchievementTable({
  achievements,
  onEdit,
  onDelete,
}: {
  achievements: readonly StudentAchievementTableItem[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [selectedAchievement, setSelectedAchievement] =
    useState<StudentAchievementTableItem | null>(null);

  return (
    <>
      <Card className="w-full min-w-0 max-w-full overflow-hidden">
        <CardHeader>
          <CardTitle>Achievement list</CardTitle>
          <CardDescription>
            Scan your submissions and open any row for the full details.
          </CardDescription>
        </CardHeader>
        <CardBody className="min-w-0 max-w-full">
          <TableContainer className="w-[calc(100%+3rem)]! min-w-0">
            <Table
              aria-label="Student achievements"
              className="min-w-[48rem] text-sm"
            >
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-72">Achievement</TableHead>
                  <TableHead className="min-w-36">Status</TableHead>
                  <TableHead className="min-w-40">Awarded</TableHead>
                  <TableHead className="min-w-36 text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {achievements.map((achievement) => {
                  const status =
                    STATUS_CONFIG[achievement.status] ?? STATUS_CONFIG.pending;

                  return (
                    <TableRow key={achievement.id}>
                      <TableCell className="align-top">
                        <Text className="max-w-80 truncate font-medium">
                          {achievement.eventName}
                        </Text>
                        <Text className="mt-1 max-w-80 truncate text-sm text-muted">
                          {achievement.award}
                        </Text>
                      </TableCell>
                      <TableCell className="align-center">
                        <Badge
                          variant={status.variant}
                          className="whitespace-nowrap"
                        >
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-center">
                        <Text className="whitespace-nowrap font-medium">
                          {formatAchievementDate(achievement.awardingDate)}
                        </Text>
                      </TableCell>
                      <TableCell className="align-center text-right">
                        <Button
                          variant="tertiary"
                          size="sm"
                          onClick={() => setSelectedAchievement(achievement)}
                        >
                          <IconEye /> View details
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardBody>
      </Card>

      <AchievementDetailDrawer
        achievement={selectedAchievement}
        mode="student"
        open={selectedAchievement !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedAchievement(null);
        }}
        onEdit={(achievement) => {
          setSelectedAchievement(null);
          onEdit(achievement.id);
        }}
        onDelete={(achievement) => {
          setSelectedAchievement(null);
          onDelete(achievement.id);
        }}
      />
    </>
  );
}

export function AchievementDetailDrawer<T extends StudentAchievementTableItem>({
  achievement,
  mode,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onApprove,
  onReject,
  mutationPending = false,
}: {
  achievement: T | null;
  mode: "student" | "admin";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (achievement: T) => void;
  onDelete?: (achievement: T) => void;
  onApprove?: (id: string, eventName: string) => void;
  onReject?: (id: string, eventName: string) => void;
  mutationPending?: boolean;
}) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<{
    label: string;
    url: string;
  } | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 640px)");
    const updateViewport = () => setIsDesktop(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  const status = achievement
    ? (STATUS_CONFIG[achievement.status] ?? STATUS_CONFIG.pending)
    : STATUS_CONFIG.pending;
  const isPending =
    achievement?.status === "pending" ||
    achievement?.status === "pending_review";
  const studentName = achievement?.student?.name ?? "Cogito student";
  const hasAttachments = Boolean(
    achievement?.evidenceUrl || achievement?.documentationUrl,
  );

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      swipeDirection={isDesktop ? "right" : "down"}
    >
      <DrawerPopup
        direction={isDesktop ? "right" : "bottom"}
        className={isDesktop ? "w-full max-w-xl" : undefined}
      >
        <DrawerHeader className="justify-between border-b border-drawer-border pb-4.5">
          <div className="min-w-0">
            <DrawerTitle className="truncate">
              {achievement?.eventName ?? "Achievement details"}
            </DrawerTitle>
            <DrawerDescription>
              {mode === "admin"
                ? "Review the full submission and take the next action."
                : "Full submission details and available actions."}
            </DrawerDescription>
          </div>
          <DrawerClose
            render={<Button variant="plain" size="sm" aria-label="Close" />}
          >
            <IconX />
          </DrawerClose>
        </DrawerHeader>

        <DrawerBody>
          {achievement ? (
            <div className="space-y-5">
              {mode === "admin" ? (
                <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <Avatar size="sm">
                    <AvatarImage
                      src={achievement.student?.image ?? undefined}
                    />
                    <AvatarFallback>
                      {studentName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <Text className="font-medium">{studentName}</Text>
                    <Text className="truncate text-sm text-muted">
                      {achievement.student?.email ?? achievement.userId ?? "—"}
                    </Text>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Text className="text-xs font-medium uppercase tracking-wide text-muted">
                    Status
                  </Text>
                  <Badge
                    variant={status.variant}
                    className="mt-1 whitespace-nowrap"
                  >
                    {mode === "admin" && isPending
                      ? "Pending review"
                      : status.label}
                  </Badge>
                </div>
                <AchievementDetailField
                  label="Category"
                  value={formatAchievementLabel(achievement.category)}
                />
                <AchievementDetailField
                  label="Level"
                  value={formatAchievementLabel(achievement.level)}
                />
                <AchievementDetailField
                  label="Subjects"
                  value={achievement.subjects?.join(", ") || "No subjects"}
                />
                <AchievementDetailField
                  label="Award"
                  value={achievement.award}
                />
                <AchievementDetailField
                  label="Awarded"
                  value={formatAchievementDate(achievement.awardingDate)}
                />
                <AchievementDetailField
                  label="Location"
                  value={achievement.location ?? "No location"}
                />
              </div>

              <AchievementDetailField
                label="Description"
                value={achievement.description ?? "No description provided."}
              />

              <div className="space-y-2">
                <Text className="text-sm font-medium">Attachments</Text>
                <div className="flex flex-wrap gap-2">
                  {achievement.evidenceUrl ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPreviewAttachment({
                          label: "Verification evidence",
                          url: achievement.evidenceUrl!,
                        })
                      }
                    >
                      <IconPhoto /> View proof
                    </Button>
                  ) : null}
                  {achievement.documentationUrl ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPreviewAttachment({
                          label: "Public documentation",
                          url: achievement.documentationUrl!,
                        })
                      }
                    >
                      <IconPhoto /> View documentation
                    </Button>
                  ) : null}
                  {!hasAttachments ? (
                    <Text className="text-sm text-dimmed">No attachments</Text>
                  ) : null}
                </div>
              </div>

              {achievement.adminNote ? (
                <div className="rounded-lg border border-warning-border bg-warning/10 p-3">
                  <Text className="text-sm font-medium">Moderator note</Text>
                  <Text className="mt-1 whitespace-pre-wrap break-words text-sm text-muted">
                    {achievement.adminNote}
                  </Text>
                </div>
              ) : null}
            </div>
          ) : null}
        </DrawerBody>

        <DrawerFooter className="flex-wrap gap-2">
          <DrawerClose
            render={<Button variant="plain" aria-label="Close details" />}
          >
            Close
          </DrawerClose>
          {mode === "student" && isPending && onEdit ? (
            <Button
              variant="secondary"
              onClick={() => {
                if (!achievement) return;
                onOpenChange(false);
                onEdit(achievement);
              }}
            >
              <IconEdit /> Edit
            </Button>
          ) : null}
          {mode === "student" && isPending && onDelete ? (
            <Button
              variant="danger"
              onClick={() => {
                if (!achievement) return;
                onOpenChange(false);
                onDelete(achievement);
              }}
            >
              <IconTrash /> Delete
            </Button>
          ) : null}
          {mode === "admin" && isPending && onEdit ? (
            <Button
              variant="secondary"
              onClick={() => {
                if (!achievement) return;
                onOpenChange(false);
                onEdit(achievement);
              }}
              disabled={mutationPending}
            >
              <IconEdit /> Correct
            </Button>
          ) : null}
          {mode === "admin" && isPending && onReject && onApprove ? (
            <>
              <Button
                variant="danger"
                onClick={() => {
                  if (!achievement) return;
                  onOpenChange(false);
                  onReject(achievement.id, achievement.eventName);
                }}
                disabled={mutationPending}
              >
                <IconX /> Reject
              </Button>
              <Button
                onClick={() => {
                  if (!achievement) return;
                  onOpenChange(false);
                  onApprove(achievement.id, achievement.eventName);
                }}
                disabled={mutationPending}
              >
                <IconCheck /> Approve
              </Button>
            </>
          ) : null}
        </DrawerFooter>
      </DrawerPopup>

      <AttachmentImageViewer
        attachment={previewAttachment}
        achievementName={achievement?.eventName ?? "Achievement"}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPreviewAttachment(null);
        }}
      />
    </Drawer>
  );
}

function AttachmentImageViewer({
  attachment,
  achievementName,
  onOpenChange,
}: {
  attachment: { label: string; url: string } | null;
  achievementName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <Dialog
      open={attachment !== null}
      onOpenChange={(open) => {
        if (open) return;
        setImageFailed(false);
        onOpenChange(false);
      }}
    >
      <DialogPopup className="sm:max-w-4xl">
        <DialogHeader className="justify-between border-b border-dialog-border">
          <div className="min-w-0">
            <DialogTitle className="truncate">
              {attachment?.label ?? "Attachment"}
            </DialogTitle>
            <DialogDescription className="truncate">
              {achievementName}
            </DialogDescription>
          </div>
          <DialogClose
            render={<Button variant="plain" size="sm" aria-label="Close" />}
          >
            <IconX />
          </DialogClose>
        </DialogHeader>
        <DialogBody className="flex min-h-64 items-center justify-center bg-background/50 p-3 sm:min-h-96">
          {attachment && !imageFailed ? (
            <img
              key={attachment.url}
              src={attachment.url}
              alt={`${attachment.label} for ${achievementName}`}
              className="max-h-[65dvh] max-w-full rounded-lg object-contain"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="max-w-md space-y-2 text-center">
              <IconPhoto className="mx-auto size-8 text-dimmed" />
              <Text className="font-medium">Preview unavailable</Text>
              <Text className="text-sm text-muted">
                This attachment cannot be displayed as an image. Open the
                original file to view it.
              </Text>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose
            render={<Button variant="plain" aria-label="Close image preview" />}
          >
            Close
          </DialogClose>
          {attachment ? (
            <Button
              render={
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open original ${attachment.label.toLowerCase()}`}
                />
              }
              nativeButton={false}
            >
              <IconExternalLink /> Open original
            </Button>
          ) : null}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function AchievementDetailField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <Text className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </Text>
      <Text className="mt-1 break-words whitespace-pre-wrap">{value}</Text>
    </div>
  );
}
