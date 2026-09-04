"use client";

import { IconFilterOff, IconPlus } from "@tabler/icons-react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@cogito-app/ui/components/selia/button";
import { Card } from "@cogito-app/ui/components/selia/card";
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
import { TablePagination } from "@/components/table-pagination";

const ACHIEVEMENTS_PAGE_SIZE = 10;

export function AchivementsPage() {
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);
  const [editAchievement, setEditAchievement] = useState<
    (typeof items)[number] | null
  >(null);
  const [editOpen, setEditOpen] = useState(false);
  const [page, setPage] = useState(0);

  const category =
    categoryFilter === "All"
      ? undefined
      : (categoryFilter.toLowerCase() as AchievementCategory);
  const status =
    statusFilter === "All"
      ? undefined
      : (statusFilter.toLowerCase() as "pending" | "approved" | "rejected");
  const achievements = useQuery({
    ...orpc.achievement.list.queryOptions({
      input: {
        category,
        status,
        limit: ACHIEVEMENTS_PAGE_SIZE + 1,
        offset: page * ACHIEVEMENTS_PAGE_SIZE,
      },
    }),
    placeholderData: keepPreviousData,
  });
  const achievementStats = useQuery(
    orpc.achievement.stats.queryOptions({ input: undefined }),
  );

  const deleteMutation = useMutation(
    orpc.achievement.delete.mutationOptions({
      onSuccess: () => {
        void Promise.all([achievements.refetch(), achievementStats.refetch()]);
        toastManager.add({ title: "Achievement deleted", type: "success" });
      },
    }),
  );

  const items = achievements.data ?? [];
  const visibleItems = items.slice(0, ACHIEVEMENTS_PAGE_SIZE);
  const total = achievementStats.data?.total ?? items.length;
  const approved = achievementStats.data?.approved ?? 0;
  const pending = achievementStats.data?.pending ?? 0;

  const showPendingBanner = pending > 0 && approved < total;
  const showAllApprovedBanner = approved > 0 && approved === total && total > 0;

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
        onSuccess={() => void achievementStats.refetch()}
      />

      {total > 0 && (
        <AchievementStats total={total} approved={approved} pending={pending} />
      )}

      {showPendingBanner && <AchievementBanner type="pending" />}
      {showAllApprovedBanner && <AchievementBanner type="allApproved" />}

      {total > 0 && (
        <AchievementFilters
          category={categoryFilter}
          status={statusFilter}
          onCategoryChange={(value) => {
            setCategoryFilter(value);
            setPage(0);
          }}
          onStatusChange={(value) => {
            setStatusFilter(value);
            setPage(0);
          }}
        />
      )}

      {achievements.isPending || achievementStats.isPending ? (
        <Card className="min-h-72 animate-pulse bg-accent/40" />
      ) : total === 0 && page === 0 ? (
        <AchievementEmptyState />
      ) : visibleItems.length === 0 ? (
        <Card>
          <div className="p-4">
            <EmptyStateCard
              icon={<IconFilterOff />}
              title={
                page === 0
                  ? "No matching achievements"
                  : "No achievements on this page"
              }
              description={
                page === 0
                  ? "Try another category or status filter."
                  : "Go back to the previous page to continue browsing achievements."
              }
              tone="secondary"
              size="compact"
            />
            {page > 0 ? (
              <TablePagination
                label="achievements"
                pageSize={ACHIEVEMENTS_PAGE_SIZE}
                page={page}
                itemCount={0}
                hasNext={false}
                isFetching={achievements.isFetching}
                onPrevious={() =>
                  setPage((current) => Math.max(0, current - 1))
                }
                onNext={() => setPage((current) => current + 1)}
              />
            ) : null}
          </div>
        </Card>
      ) : (
        <AchievementTable
          achievements={visibleItems}
          page={page}
          pageSize={ACHIEVEMENTS_PAGE_SIZE}
          hasNext={items.length > ACHIEVEMENTS_PAGE_SIZE}
          isFetching={achievements.isFetching}
          onPrevious={() => setPage((current) => Math.max(0, current - 1))}
          onNext={() => setPage((current) => current + 1)}
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
          onSuccess={() => void achievementStats.refetch()}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) setEditAchievement(null);
          }}
        />
      )}
    </Stack>
  );
}
