"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { IconCertificate, IconEye, IconInbox } from "@tabler/icons-react";
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
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Input } from "@cogito-app/ui/components/selia/input";
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
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { EmptyStateCard } from "@/components/empty-state";
import { TablePagination } from "@/components/table-pagination";
import {
  AchievementForm,
  type AchievementCategory,
} from "@/components/dashboard/achievement-form";
import {
  AchievementDetailDrawer,
  formatAchievementDate,
} from "@/components/dashboard/achievement-table";
import { getUserFacingError } from "@/lib/error-message";
import { client, orpc } from "@/utils/orpc";

type AdminAchievement = Awaited<
  ReturnType<typeof client.achievement.adminList>
>[number];
type StatusFilter = "all" | "pending" | "approved" | "rejected";

const MODERATION_PAGE_SIZE = 10;

const STATUS_CONFIG = {
  pending: { label: "Pending review", variant: "warning" },
  pending_review: { label: "Pending review", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "danger" },
  archived: { label: "Archived", variant: "secondary" },
} as const;

export function AchievementModerationPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(0);
  const [reviewTarget, setReviewTarget] = useState<{
    id: string;
    eventName: string;
    action: "approved" | "rejected";
  } | null>(null);
  const [editAchievement, setEditAchievement] =
    useState<AdminAchievement | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [rejectionNote, setRejectionNote] = useState("");
  const achievementsQuery = useQuery({
    ...orpc.achievement.adminList.queryOptions({
      input: {
        limit: MODERATION_PAGE_SIZE + 1,
        offset: page * MODERATION_PAGE_SIZE,
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      },
    }),
    placeholderData: keepPreviousData,
  });
  const statsQuery = useQuery(
    orpc.achievement.adminStats.queryOptions({ input: undefined }),
  );
  const review = useMutation(
    orpc.achievement.adminReview.mutationOptions({
      onSuccess: (achievement) => {
        setReviewTarget(null);
        setRejectionNote("");
        void queryClient.invalidateQueries({
          queryKey: orpc.achievement.adminList.key(),
        });
        void queryClient.invalidateQueries({
          queryKey: orpc.achievement.adminStats.key(),
        });
        toastManager.add({
          title:
            achievement.status === "approved"
              ? "Achievement approved"
              : "Achievement rejected",
          type: "success",
        });
      },
      onError: (error: Error) => {
        toastManager.add({
          title: "Achievement update could not be saved",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );

  if (achievementsQuery.isPending) return <ModerationSkeleton />;

  if (achievementsQuery.isError) {
    return (
      <Card>
        <CardBody className="flex min-h-72 flex-col items-center justify-center text-center">
          <IconBox variant="danger-subtle" size="lg" className="mb-4">
            <IconCertificate />
          </IconBox>
          <Heading size="sm">Moderation queue is unavailable</Heading>
          <Text className="mt-2 max-w-md text-muted">
            {getUserFacingError(
              achievementsQuery.error,
              "Achievements could not be loaded.",
            )}
          </Text>
          <Button
            variant="secondary"
            className="mt-5"
            onClick={() => void achievementsQuery.refetch()}
          >
            Try again
          </Button>
        </CardBody>
      </Card>
    );
  }

  const achievements = achievementsQuery.data ?? [];
  const visibleAchievements = achievements.slice(0, MODERATION_PAGE_SIZE);
  const pendingCount = statsQuery.data?.pending ?? 0;
  const approvedCount = statsQuery.data?.approved ?? 0;
  const rejectedCount = statsQuery.data?.rejected ?? 0;

  function submitReview() {
    if (!reviewTarget) return;
    const adminNote = rejectionNote.trim();
    if (reviewTarget.action === "rejected" && !adminNote) return;
    review.mutate({
      achievementId: reviewTarget.id,
      status: reviewTarget.action,
      adminNote: reviewTarget.action === "rejected" ? adminNote : undefined,
    });
  }

  return (
    <Stack
      direction="column"
      spacing="lg"
      className="w-full min-w-0 max-w-full"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Heading level={1} size="md">
            Achievement moderation
          </Heading>
          <Text className="text-muted">
            Review student evidence before achievements become public.
          </Text>
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as StatusFilter);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectPopup align="end">
            <SelectList>
              <SelectItem value="all">All submissions</SelectItem>
              <SelectItem value="pending">Pending review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectList>
          </SelectPopup>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <QueueStat label="Pending" value={pendingCount} variant="warning" />
        <QueueStat label="Approved" value={approvedCount} variant="success" />
        <QueueStat label="Rejected" value={rejectedCount} variant="danger" />
      </div>

      {visibleAchievements.length === 0 && page === 0 ? (
        <EmptyStateCard
          icon={<IconInbox />}
          title="No matching submissions"
          description={
            statusFilter === "pending"
              ? "The moderation queue is clear."
              : "Try another status filter."
          }
          tone={statusFilter === "pending" ? "success" : "secondary"}
        />
      ) : visibleAchievements.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyStateCard
              icon={<IconInbox />}
              title="No submissions on this page"
              description="Go back to the previous page to continue reviewing submissions."
              tone="secondary"
              size="compact"
            />
            <TablePagination
              label="submissions"
              pageSize={MODERATION_PAGE_SIZE}
              page={page}
              itemCount={0}
              hasNext={false}
              isFetching={achievementsQuery.isFetching}
              onPrevious={() => setPage((current) => Math.max(0, current - 1))}
              onNext={() => setPage((current) => current + 1)}
            />
          </CardBody>
        </Card>
      ) : (
        <ModerationTable
          achievements={visibleAchievements}
          mutationPending={review.isPending}
          onApprove={(id, eventName) =>
            setReviewTarget({ id, eventName, action: "approved" })
          }
          onReject={(id, eventName) =>
            setReviewTarget({ id, eventName, action: "rejected" })
          }
          onEdit={(item) => {
            setEditAchievement(item);
            setEditOpen(true);
          }}
          page={page}
          pageSize={MODERATION_PAGE_SIZE}
          hasNext={achievements.length > MODERATION_PAGE_SIZE}
          isFetching={achievementsQuery.isFetching}
          onPrevious={() => setPage((current) => Math.max(0, current - 1))}
          onNext={() => setPage((current) => current + 1)}
        />
      )}

      <Dialog
        open={reviewTarget !== null}
        onOpenChange={(open) => {
          if (!open && !review.isPending) {
            setReviewTarget(null);
            setRejectionNote("");
          }
        }}
      >
        <DialogPopup>
          <DialogHeader className="flex-col items-start gap-1.5">
            <DialogTitle>
              {reviewTarget?.action === "rejected"
                ? "Reject achievement?"
                : "Approve achievement?"}
            </DialogTitle>
            <DialogDescription>
              {reviewTarget?.action === "rejected"
                ? `Tell the student what needs to be corrected for “${reviewTarget.eventName}”.`
                : `“${reviewTarget?.eventName ?? "This achievement"}” will be approved for the student's portfolio.`}
            </DialogDescription>
          </DialogHeader>
          {reviewTarget?.action === "rejected" ? (
            <DialogBody>
              <Field>
                <FieldLabel>Moderator note</FieldLabel>
                <Input
                  value={rejectionNote}
                  onChange={(event) => setRejectionNote(event.target.value)}
                  placeholder="Explain what the student should correct"
                />
                <FieldDescription>
                  This note will be visible to the student.
                </FieldDescription>
              </Field>
            </DialogBody>
          ) : null}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setReviewTarget(null);
                setRejectionNote("");
              }}
              disabled={review.isPending}
            >
              Cancel
            </Button>
            <Button
              variant={
                reviewTarget?.action === "rejected" ? "danger" : "primary"
              }
              onClick={submitReview}
              progress={review.isPending}
              disabled={
                review.isPending ||
                (reviewTarget?.action === "rejected" && !rejectionNote.trim())
              }
            >
              {reviewTarget?.action === "rejected" ? "Reject" : "Approve"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      {editAchievement ? (
        <AchievementForm
          mode="edit"
          audience="admin"
          editId={editAchievement.id}
          expectedVersion={editAchievement.version}
          defaultValues={{
            eventName: editAchievement.eventName,
            category: editAchievement.category as AchievementCategory,
            award: editAchievement.award,
            level: editAchievement.level,
            awardingDate: editAchievement.awardingDate ?? "",
            location: editAchievement.location ?? "",
            description: editAchievement.description ?? "",
            subjects: editAchievement.subjects ?? [],
            evidenceUrl: editAchievement.evidenceUrl ?? "",
            documentationUrl: editAchievement.documentationUrl ?? "",
          }}
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) setEditAchievement(null);
          }}
        />
      ) : null}
    </Stack>
  );
}

function ModerationTable({
  achievements,
  mutationPending,
  onApprove,
  onReject,
  onEdit,
  page,
  pageSize,
  hasNext,
  isFetching,
  onPrevious,
  onNext,
}: {
  achievements: readonly AdminAchievement[];
  mutationPending: boolean;
  onApprove: (id: string, eventName: string) => void;
  onReject: (id: string, eventName: string) => void;
  onEdit: (achievement: AdminAchievement) => void;
  page: number;
  pageSize: number;
  hasNext: boolean;
  isFetching: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const [selectedAchievement, setSelectedAchievement] =
    useState<AdminAchievement | null>(null);

  return (
    <>
      <Card className="w-full min-w-0 max-w-full overflow-hidden">
        <CardHeader>
          <CardTitle>Submissions</CardTitle>
          <CardDescription>
            Open any submission for the full details and moderation actions.
          </CardDescription>
        </CardHeader>
        <CardBody aria-busy={mutationPending} className="min-w-0 max-w-full">
          <TableContainer className="w-[calc(100%+3rem)]! min-w-0">
            <Table
              aria-label="Achievement moderation submissions"
              className="min-w-[52rem] text-sm"
            >
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-64">Student</TableHead>
                  <TableHead className="min-w-72">Achievement</TableHead>
                  <TableHead className="min-w-40">Awarded</TableHead>
                  <TableHead className="min-w-36">Status</TableHead>
                  <TableHead className="min-w-36 text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {achievements.map((achievement) => {
                  const status =
                    STATUS_CONFIG[
                      achievement.status as keyof typeof STATUS_CONFIG
                    ] ?? STATUS_CONFIG.pending;
                  const studentName =
                    achievement.student?.name ?? "Cogito student";

                  return (
                    <TableRow key={achievement.id}>
                      <TableCell className="align-top">
                        <div className="flex min-w-48 items-center gap-3">
                          <Avatar size="sm">
                            <AvatarImage
                              src={achievement.student?.image ?? undefined}
                            />
                            <AvatarFallback>
                              {studentName.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <Text className="truncate font-medium">
                              {studentName}
                            </Text>
                            <Text className="truncate text-sm text-muted">
                              {achievement.student?.email ?? achievement.userId}
                            </Text>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="align-center">
                        <Text className="max-w-96 truncate font-medium">
                          {achievement.eventName} - {achievement.award}
                        </Text>
                      </TableCell>
                      <TableCell className="align-center">
                        <Text className="whitespace-nowrap font-medium">
                          {formatAchievementDate(achievement.awardingDate)}
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
          <TablePagination
            label="submissions"
            pageSize={pageSize}
            page={page}
            itemCount={achievements.length}
            hasNext={hasNext}
            isFetching={isFetching}
            onPrevious={onPrevious}
            onNext={onNext}
          />
        </CardBody>
      </Card>

      <AchievementDetailDrawer
        achievement={selectedAchievement}
        mode="admin"
        open={selectedAchievement !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedAchievement(null);
        }}
        mutationPending={mutationPending}
        onApprove={onApprove}
        onReject={onReject}
        onEdit={onEdit}
      />
    </>
  );
}

function QueueStat({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "warning" | "success" | "danger";
}) {
  return (
    <Card>
      <CardBody className="flex items-center justify-between gap-4 py-4">
        <Text className="font-medium">{label}</Text>
        <Badge variant={variant} pill>
          {value}
        </Badge>
      </CardBody>
    </Card>
  );
}

function ModerationSkeleton() {
  return (
    <div className="grid animate-pulse gap-4 xl:grid-cols-2">
      <Card className="min-h-96 bg-accent/40" />
      <Card className="min-h-96 bg-accent/40" />
    </div>
  );
}
