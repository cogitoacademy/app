"use client";

import { Badge } from "@cogito-app/ui/components/selia/badge";
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

type TutorCardProps = {
  tutor: {
    id: string;
    displayName: string | null;
    shortBio: string | null;
    expertise: string[] | null;
    modality: string | null;
    publishedAt: Date | null;
    user: { name: string | null; image: string | null } | null;
  };
  onClick: () => void;
};

export function TutorCard({ tutor, onClick }: TutorCardProps) {
  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-card"
      onClick={onClick}
    >
      <CardHeader>
        <CardTitle>{tutor.displayName ?? tutor.user?.name ?? "Tutor"}</CardTitle>
        {tutor.modality && (
          <Badge variant={MODALITY_VARIANTS[tutor.modality] ?? "secondary"} size="sm">
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
              <Badge key={e} variant="secondary" size="sm">{e}</Badge>
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