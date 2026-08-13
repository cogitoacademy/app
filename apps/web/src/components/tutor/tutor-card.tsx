"use client";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@cogito-app/ui/components/selia/avatar";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Text } from "@cogito-app/ui/components/selia/text";

const MODALITY_LABELS: Record<string, string> = {
  online: "Online",
  offline: "Offline",
  both: "Online & Offline",
};

const MODALITY_VARIANTS: Record<string, "info" | "success" | "warning"> = {
  online: "info",
  offline: "success",
  both: "warning",
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

type TutorCardProps = {
  tutor: {
    id: string;
    displayName: string | null;
    shortBio: string | null;
    expertise: string[];
    modality: string | null;
    publishedAt: Date | null;
    user: { name: string | null; image: string | null } | null;
  };
  onClick: () => void;
};

export function TutorCard({ tutor, onClick }: TutorCardProps) {
  const tutorName = tutor.displayName ?? tutor.user?.name ?? "Tutor";

  return (
    <Card
      className="cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card"
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <CardHeader className="grid-cols-[auto_1fr_auto]!">
        <Avatar size="md">
          <AvatarImage src={tutor.user?.image ?? undefined} alt={tutorName} />
          <AvatarFallback>{getInitials(tutorName)}</AvatarFallback>
        </Avatar>
        <CardTitle>{tutorName}</CardTitle>
        {tutor.modality && (
          <Badge
            variant={MODALITY_VARIANTS[tutor.modality] ?? "secondary"}
            size="sm"
          >
            {MODALITY_LABELS[tutor.modality] ?? tutor.modality}
          </Badge>
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-2">
        {tutor.shortBio && (
          <Text className="text-dimmed line-clamp-2">{tutor.shortBio}</Text>
        )}
        {tutor.expertise && tutor.expertise.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tutor.expertise.slice(0, 4).map((e) => (
              <Badge key={e} variant="secondary" size="sm">
                {e}
              </Badge>
            ))}
            {tutor.expertise.length > 4 && (
              <Badge variant="tertiary" size="sm">
                +{tutor.expertise.length - 4}
              </Badge>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
