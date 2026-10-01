"use client";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Text } from "@cogito-app/ui/components/selia/text";

type AchievementStatsProps = {
  total: number;
  approved: number;
  pending: number;
  actions?: React.ReactNode;
};

export function AchievementStats({
  total,
  approved,
  pending,
  actions,
}: AchievementStatsProps) {
  return (
    <Card className="min-w-0 flex-1">
      <CardBody className="flex flex-col p-0">
        <div className="grid min-w-0 grid-cols-3">
          <AchievementStat label="Total" value={total} variant="info" />
          <AchievementStat
            label="Approved"
            value={approved}
            variant="success"
          />
          <AchievementStat label="Pending" value={pending} variant="warning" />
        </div>
        {actions ? (
          <div className="flex items-center border-t border-border p-2.5 md:hidden">
            {actions}
          </div>
        ) : null}
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
    <div className="flex min-w-0 flex-col items-center gap-1.5 border-l border-border px-2 pt-2 pb-3 sm:pt-3 first:border-l-0 sm:flex-row sm:justify-between sm:px-4">
      <Text className="truncate font-medium">{label}</Text>
      <Badge variant={variant} pill className="shrink-0 tabular-nums">
        {value}
      </Badge>
    </div>
  );
}
