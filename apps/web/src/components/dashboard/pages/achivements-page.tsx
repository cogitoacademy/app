"use client";

import { IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@cogito-app/ui/components/selia/button";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { AchievementBanner } from "../achievement-banner";
import { AchievementCard } from "../achievement-card";
import { AchievementEmptyState } from "../achievement-empty-state";
import { AchievementFilters } from "../achievement-filters";
import { AchievementForm, type AchievementCategory } from "../achievement-form";
import { AchievementStats } from "../achievement-stats";
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
    <Stack direction="column" spacing="lg">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Heading size="md">Achievements</Heading>
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
        <Text className="py-8 text-center text-muted">
          No achievements match the selected filters.
        </Text>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((a) => (
            <AchievementCard
              key={a.id}
              achievement={{
                ...a,
                status: a.status as "pending" | "approved" | "rejected",
              }}
              onDelete={(id) =>
                deleteMutation.mutate({ id, version: a.version })
              }
              onEdit={(id) => {
                const found = items.find((item) => item.id === id);
                if (found) {
                  setEditAchievement(found);
                  setEditOpen(true);
                }
              }}
            />
          ))}
        </div>
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
            eventDate: editAchievement.eventDate ?? "",
            location: editAchievement.location ?? "",
            description: editAchievement.description ?? "",
            subjects: editAchievement.subjects ?? [],
            imageUrl: editAchievement.imageUrl ?? "",
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
