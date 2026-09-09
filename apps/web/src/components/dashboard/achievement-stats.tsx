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
    <Card>
      <CardBody className="grid grid-cols-3 p-0">
        <AchievementStat label="Total" value={total} variant="info" />
        <AchievementStat label="Approved" value={approved} variant="success" />
        <AchievementStat label="Pending" value={pending} variant="warning" />
      </CardBody>
    </Card>
  );
}

function AchievementStat({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "info" | "secondary" | "success" | "warning";
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 border-l border-border px-2 pt-2 pb-3 first:border-l-0 sm:flex-row sm:justify-between sm:px-4">
      <Text className="truncate font-medium">{label}</Text>
      <Badge variant={variant} pill className="shrink-0 tabular-nums">
        {value}
      </Badge>
    </div>
  );
}
