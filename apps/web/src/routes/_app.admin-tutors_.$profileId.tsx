import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Spinner } from "@cogito-app/ui/components/selia/spinner";
import { Text } from "@cogito-app/ui/components/selia/text";
import type { CogitoUser } from "@cogito-app/auth";
import { IconArrowLeft, IconInbox } from "@tabler/icons-react";
import { client } from "@/utils/orpc";
import { TutorReviewCard } from "@/components/admin/tutor-review-card";
import { EmptyState } from "@/components/empty-state";
import { useSubjectTaxonomy } from "@/components/tutor/subject-taxonomy";

export const Route = createFileRoute("/_app/admin-tutors_/$profileId")({
  head: () => ({
    meta: [
      {
        title: "Review tutor · Cogito Academy",
      },
    ],
  }),
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
});

function RouteComponent() {
  const { profileId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: subjectCategories = [] } = useSubjectTaxonomy();
  const subjectLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const category of subjectCategories) {
      for (const subject of category.children) {
        labels.set(subject.id, `${category.name} · ${subject.name}`);
      }
    }
    return labels;
  }, [subjectCategories]);
  const subjectFieldSlugs = useMemo(() => {
    const slugs = new Map<string, string>();
    for (const category of subjectCategories) {
      for (const subject of category.children) {
        slugs.set(subject.id, category.slug);
      }
    }
    return slugs;
  }, [subjectCategories]);

  const {
    data: profiles = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["adminTutorProfile", profileId],
    queryFn: () =>
      client.adminTutor.listTutorProfiles({ limit: 100, offset: 0 }),
  });

  const profile = profiles.find((entry) => entry.id === profileId) ?? null;

  if (isPending) {
    return (
      <div
        className="flex items-center justify-center py-16"
        aria-busy="true"
        aria-label="Loading tutor profile"
      >
        <Spinner className="size-8" />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <BackButton />
        <EmptyState
          icon={<IconInbox />}
          title="Tutor profile not found"
          description="This profile may have been removed, or the link is incorrect."
          tone="secondary"
          className="rounded-lg"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 pb-24 lg:pb-0">
      <BackButton />
      <div>
        <Heading level={1} size="md">
          Review tutor profile
        </Heading>
        <Text className="mt-1 text-muted">
          Check details, proofs, photos, and publication status in one focused
          workspace.
        </Text>
      </div>
      <TutorReviewCard
        profile={{
          ...profile,
          bankAccountOwnership:
            profile.bankAccountOwnership === "self" ||
            profile.bankAccountOwnership === "trusted_person"
              ? profile.bankAccountOwnership
              : null,
        }}
        subjectLabels={subjectLabels}
        subjectFieldSlugs={subjectFieldSlugs}
        onAction={() => {
          void refetch();
          void queryClient.invalidateQueries({
            queryKey: ["adminTutorProfile", profileId],
          });
        }}
      />
    </div>
  );
}

function BackButton() {
  return (
    <Button
      variant="underline"
      size="sm"
      className="self-start"
      nativeButton={false}
      render={<Link to="/admin-tutors" aria-label="Back to tutor list" />}
    >
      <IconArrowLeft className="size-4" />
      Back to tutors
    </Button>
  );
}
