"use client";

import { IconCertificate, IconCheck, IconClock } from "@tabler/icons-react";

import { StatCard } from "./stat-card";

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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <StatCard
        icon={<IconCertificate />}
        title="Total Achievements"
        value={total}
        change={`${total} recorded`}
      />
      <StatCard
        icon={<IconCheck />}
        title="Approved"
        value={approved}
        change="Live on cogitoacademy.id"
      />
      <StatCard
        icon={<IconClock />}
        title="Pending Review"
        value={pending}
        change="Awaiting approval"
      />
    </div>
  );
}
