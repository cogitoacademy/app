"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  IconCalendarEvent,
  IconCertificate,
  IconCheck,
  IconInbox,
  IconMapPin,
  IconPhoto,
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
  CardFooter,
  CardHeader,
  CardHeaderAction,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { client, orpc } from "@/utils/orpc";

type AdminAchievement = Awaited<
  ReturnType<typeof client.achievement.adminList>
>[number];
type StatusFilter = "all" | "pending" | "approved" | "rejected";

const STATUS_CONFIG = {
  pending: { label: "Pending review", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "danger" },
} as const;

export function AchievementModerationPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const achievementsQuery = useQuery(
    orpc.achievement.adminList.queryOptions({
      input: { limit: 100, offset: 0 },
    }),
  );
  const review = useMutation(
    orpc.achievement.adminReview.mutationOptions({
      onSuccess: (achievement) => {
        void queryClient.invalidateQueries({
          queryKey: orpc.achievement.adminList.key(),
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
        toastManager.add({ title: error.message, type: "error" });
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
            {achievementsQuery.error instanceof Error
              ? achievementsQuery.error.message
              : "Achievements could not be loaded."}
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

  const achievements = achievementsQuery.data;
  const visibleAchievements =
    statusFilter === "all"
      ? achievements
      : achievements.filter((item) => item.status === statusFilter);
  const pendingCount = achievements.filter(
    (item) => item.status === "pending",
  ).length;
  const approvedCount = achievements.filter(
    (item) => item.status === "approved",
  ).length;
  const rejectedCount = achievements.filter(
    (item) => item.status === "rejected",
  ).length;

  function approveAchievement(achievementId: string) {
    const confirmed = window.confirm(
      "Approve this achievement and publish it to the student's portfolio?",
    );
    if (confirmed) {
      review.mutate({ achievementId, status: "approved" });
    }
  }

  function rejectAchievement(achievementId: string) {
    const adminNote = window.prompt(
      "Explain what the student needs to correct before resubmitting.",
    );
    if (adminNote === null) return;
    if (!adminNote.trim()) {
      toastManager.add({
        title: "A rejection note is required",
        type: "error",
      });
      return;
    }
    review.mutate({
      achievementId,
      status: "rejected",
      adminNote: adminNote.trim(),
    });
  }

  return (
    <Stack direction="column" spacing="lg">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Heading size="md">Achievement moderation</Heading>
          <Text className="text-muted">
            Review student evidence before achievements become public.
          </Text>
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilter)}
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

      {visibleAchievements.length === 0 ? (
        <Card>
          <CardBody className="flex min-h-64 flex-col items-center justify-center text-center">
            <IconBox variant="secondary-subtle" size="lg" className="mb-4">
              <IconInbox />
            </IconBox>
            <Heading size="sm">No matching submissions</Heading>
            <Text className="mt-2 text-muted">
              {statusFilter === "pending"
                ? "The moderation queue is clear."
                : "Try another status filter."}
            </Text>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleAchievements.map((achievement) => (
            <ModerationCard
              key={achievement.id}
              achievement={achievement}
              mutationPending={review.isPending}
              reviewingId={review.variables?.achievementId}
              reviewingStatus={review.variables?.status}
              onApprove={approveAchievement}
              onReject={rejectAchievement}
            />
          ))}
        </div>
      )}
    </Stack>
  );
}

function ModerationCard({
  achievement,
  mutationPending,
  reviewingId,
  reviewingStatus,
  onApprove,
  onReject,
}: {
  achievement: AdminAchievement;
  mutationPending: boolean;
  reviewingId?: string;
  reviewingStatus?: "approved" | "rejected";
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const status =
    STATUS_CONFIG[achievement.status as keyof typeof STATUS_CONFIG] ??
    STATUS_CONFIG.pending;
  const studentName = achievement.student?.name ?? "Cogito student";
  const isReviewing = mutationPending && reviewingId === achievement.id;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{achievement.eventName}</CardTitle>
        <CardDescription>{achievement.award}</CardDescription>
        <CardHeaderAction>
          <Badge variant={status.variant} pill>
            {status.label}
          </Badge>
        </CardHeaderAction>
      </CardHeader>
      <CardBody className="flex-1 space-y-5">
        <Item variant="plain" size="sm">
          <ItemMedia>
            <Avatar>
              <AvatarImage src={achievement.student?.image ?? undefined} />
              <AvatarFallback>
                {studentName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{studentName}</ItemTitle>
            <ItemDescription>
              {achievement.student?.email ?? achievement.userId}
            </ItemDescription>
          </ItemContent>
        </Item>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{achievement.category}</Badge>
          <Badge variant="tertiary">{achievement.level}</Badge>
          {achievement.subjects?.map((subject) => (
            <Badge key={subject} variant="info">
              {subject}
            </Badge>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {achievement.eventDate ? (
            <AchievementFact
              icon={<IconCalendarEvent />}
              label="Event date"
              value={new Intl.DateTimeFormat("en-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }).format(new Date(achievement.eventDate))}
            />
          ) : null}
          {achievement.location ? (
            <AchievementFact
              icon={<IconMapPin />}
              label="Location"
              value={achievement.location}
            />
          ) : null}
        </div>

        {achievement.description ? (
          <Text className="text-sm text-muted">{achievement.description}</Text>
        ) : null}

        {achievement.adminNote ? (
          <div className="rounded-lg bg-accent p-3">
            <Text className="text-sm font-medium">Moderator note</Text>
            <Text className="mt-1 text-sm text-muted">
              {achievement.adminNote}
            </Text>
          </div>
        ) : null}
      </CardBody>
      <CardFooter className="justify-between">
        {achievement.imageUrl ? (
          <Button
            variant="plain"
            size="sm"
            render={
              <a
                href={achievement.imageUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open evidence for ${achievement.eventName}`}
              />
            }
            nativeButton={false}
          >
            <IconPhoto /> View evidence
          </Button>
        ) : (
          <Text className="text-sm text-dimmed">No evidence attached</Text>
        )}
        {achievement.status === "pending" ? (
          <div className="flex gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={() => onReject(achievement.id)}
              progress={isReviewing && reviewingStatus === "rejected"}
              disabled={mutationPending}
            >
              <IconX /> Reject
            </Button>
            <Button
              size="sm"
              onClick={() => onApprove(achievement.id)}
              progress={isReviewing && reviewingStatus === "approved"}
              disabled={mutationPending}
            >
              <IconCheck /> Approve
            </Button>
          </div>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function AchievementFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <IconBox variant="secondary-subtle" size="sm">
        {icon}
      </IconBox>
      <div className="min-w-0">
        <Text className="text-sm text-muted">{label}</Text>
        <Text className="truncate font-medium">{value}</Text>
      </div>
    </div>
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
