"use client";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardFooter,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text } from "@cogito-app/ui/components/selia/text";
import { IconEdit, IconTrash } from "@tabler/icons-react";

type AchievementCardProps = {
  achievement: {
    id: string;
    eventName: string;
    category: string;
    award: string;
    level: string;
    eventDate: string | null;
    location: string | null;
    description: string | null;
    imageUrl: string | null;
    status: "pending" | "approved" | "rejected";
    adminNote: string | null;
  };
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
};

const STATUS_CONFIG: Record<
  string,
  { variant: "warning" | "success" | "danger"; label: string }
> = {
  pending: { variant: "warning", label: "Pending" },
  approved: { variant: "success", label: "Approved" },
  rejected: { variant: "danger", label: "Rejected" },
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AchievementCard({
  achievement,
  onEdit,
  onDelete,
}: AchievementCardProps) {
  const statusConfig =
    STATUS_CONFIG[achievement.status] ?? STATUS_CONFIG.pending;
  const isPending = achievement.status === "pending";

  return (
    <Card className="flex flex-col">
      {achievement.imageUrl && (
        <div className="aspect-video w-full overflow-hidden rounded-t-[inherit] bg-accent">
          <img
            src={achievement.imageUrl}
            alt={achievement.eventName}
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <CardBody className="flex-1">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Badge variant="secondary">{achievement.category}</Badge>
          <Badge variant="tertiary">{achievement.level}</Badge>
          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        </div>
        <Heading size="sm" className="font-semibold">
          {achievement.eventName}
        </Heading>
        <Text className="mt-1 font-medium text-foreground">
          {achievement.award}
        </Text>
        {(achievement.eventDate || achievement.location) && (
          <Text className="mt-2 text-sm text-muted">
            {[formatDate(achievement.eventDate), achievement.location]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        )}
        {achievement.description && (
          <Text className="mt-2 text-sm text-dimmed line-clamp-2">
            {achievement.description}
          </Text>
        )}
      </CardBody>
      <CardFooter className="gap-2">
        {isPending && (
          <>
            <Button
              variant="plain"
              size="sm"
              onClick={() => onEdit(achievement.id)}
            >
              <IconEdit className="size-4" />
              Edit
            </Button>
            <Button
              variant="plain"
              size="sm"
              onClick={() => onDelete(achievement.id)}
            >
              <IconTrash className="size-4" />
              Delete
            </Button>
          </>
        )}
        {achievement.status === "rejected" && achievement.adminNote && (
          <Text className="text-sm italic text-danger">
            {achievement.adminNote}
          </Text>
        )}
      </CardFooter>
    </Card>
  );
}
