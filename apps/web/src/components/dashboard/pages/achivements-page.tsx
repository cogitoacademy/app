"use client";

import { IconFilterOff, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@cogito-app/ui/components/selia/button";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { EmptyStateCard } from "@/components/empty-state";
import { AchievementBanner } from "../achievement-banner";
import { AchievementEmptyState } from "../achievement-empty-state";
import { AchievementFilters } from "../achievement-filters";
import { AchievementForm, type AchievementCategory } from "../achievement-form";
import { AchievementStats } from "../achievement-stats";
import { AchievementTable } from "../achievement-table";
import { orpc } from "@/utils/orpc";

export function AchivementsPage() {
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);
  const [editAchievement, setEditAchievement] = useState<
    (typeof items)[number] | null
  >(null);
  const [editOpen, setEditOpen] = useState(false);

  const achievements = useQuery(orpc.achievement.list.queryOptions());

  const deleteMutation = useMutation(
    orpc.achievement.delete.mutationOptions({
      onSuccess: () => {
        void achievements.refetch();
        toastManager.add({ title: "Achievement deleted", type: "success" });
      },
    }),
  );

  const items = achievements.data ?? [];
  const filtered = items.filter((a) => {
    if (categoryFilter !== "All" && a.category !== categoryFilter) return false;
    if (statusFilter !== "All" && a.status !== statusFilter.toLowerCase())
      return false;
    return true;
  });

  const approved = items.filter((a) => a.status === "approved").length;
  const pending = items.filter((a) => a.status === "pending").length;

  const showPendingBanner = pending > 0 && approved < items.length;
  const showAllApprovedBanner =
    approved > 0 && approved === items.length && items.length > 0;

  return (
    <Stack
      direction="column"
      spacing="lg"
      className="w-full min-w-0 max-w-full"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Heading level={1} size="md">
            Achievements
          </Heading>
          <Text className="text-muted">
            Your competition achievements, showcased on cogitoacademy.id
          </Text>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <IconPlus className="size-4" />
          Add Achievement
        </Button>
      </div>

      <AchievementForm
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {items.length > 0 && (
        <AchievementStats
          total={items.length}
          approved={approved}
          pending={pending}
        />
      )}

      {showPendingBanner && <AchievementBanner type="pending" />}
      {showAllApprovedBanner && <AchievementBanner type="allApproved" />}

      {items.length > 0 && (
        <AchievementFilters
          category={categoryFilter}
          status={statusFilter}
          onCategoryChange={setCategoryFilter}
          onStatusChange={setStatusFilter}
        />
      )}

      {items.length === 0 ? (
        <AchievementEmptyState />
      ) : filtered.length === 0 ? (
        <EmptyStateCard
          icon={<IconFilterOff />}
          title="No matching achievements"
          description="Try another category or status filter."
          tone="secondary"
          size="compact"
        />
      ) : (
        <AchievementTable
          achievements={filtered}
          onDelete={(id) => {
            const found = items.find((item) => item.id === id);
            if (found) deleteMutation.mutate({ id, version: found.version });
          }}
          onEdit={(id) => {
            const found = items.find((item) => item.id === id);
            if (found) {
              setEditAchievement(found);
              setEditOpen(true);
            }
          }}
        />
      )}

      {editAchievement && (
        <AchievementForm
          mode="edit"
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
      )}
    </Stack>
  );
}
