"use client";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Text } from "@cogito-app/ui/components/selia/text";

type AchievementStatsProps = {
  total: number;
  approved: number;
  pending: number;
};

export function AchievementStats({
  total,
  approved,
  pending,
}: AchievementStatsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <AchievementStat label="Total" value={total} variant="secondary" />
      <AchievementStat label="Approved" value={approved} variant="success" />
      <AchievementStat label="Pending" value={pending} variant="warning" />
    </div>
  );
}

function AchievementStat({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "secondary" | "success" | "warning";
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
