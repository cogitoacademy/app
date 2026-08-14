"use client";

import { IconTrophy } from "@tabler/icons-react";

import { EmptyStateCard } from "@/components/empty-state";

export function AchievementEmptyState() {
  return (
    <EmptyStateCard
      icon={<IconTrophy />}
      title="No achievements yet"
      description="Add your competition achievements and they'll be showcased on cogitoacademy.id for everyone to see."
      tone="primary"
    />
  );
}
