import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  Card,
  CardBody,
  CardHeader,
  CardHeaderAction,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Text } from "@cogito-app/ui/components/selia/text";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@cogito-app/ui/components/selia/menu";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@cogito-app/ui/components/selia/table";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPopup,
  DrawerTitle,
} from "@cogito-app/ui/components/selia/drawer";
import {
  Pagination,
  PaginationButton,
  PaginationItem,
  PaginationList,
} from "@cogito-app/ui/components/selia/pagination";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import type { CogitoUser } from "@cogito-app/auth";
import { client, orpc } from "@/utils/orpc";
import { TutorInviteForm } from "@/components/admin/tutor-invite-form";
import { TutorReviewCard } from "@/components/admin/tutor-review-card";
import { useSubjectTaxonomy } from "@/components/tutor/subject-taxonomy";
import {
  IconCopy,
  IconChevronLeft,
  IconChevronRight,
  IconDots,
  IconInbox,
  IconRefresh,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { EmptyState } from "@/components/empty-state";
import { getUserFacingError } from "@/lib/error-message";

const INVITATIONS_PAGE_SIZE = 3;
const TUTOR_PROFILES_PAGE_SIZE = 5;

type TutorProfile = Awaited<
  ReturnType<typeof client.adminTutor.listTutorProfiles>
>[number];

const PROFILE_STATUS: Record<
  string,
  {
    label: string;
    variant: "secondary" | "warning" | "danger" | "info" | "success";
  }
> = {
  draft: { label: "Draft", variant: "secondary" },
  pending_review: { label: "Needs review", variant: "warning" },
  changes_requested: { label: "Changes requested", variant: "danger" },
  approved_unpublished: { label: "Approved", variant: "info" },
  published: { label: "Published", variant: "success" },
  suspended: { label: "Suspended", variant: "danger" },
};

const INVITE_STATUS_BADGES: Record<
  string,
  { variant: "secondary" | "warning" | "danger" | "info" | "success" }
> = {
  invited: { variant: "warning" },
  accepted: { variant: "success" },
  expired: { variant: "danger" },
  revoked: { variant: "danger" },
};

export const Route = createFileRoute("/_app/admin-tutors")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
});

function RouteComponent() {
  const [profileFilter, setProfileFilter] = useState("");
  const [inviteFilter, setInviteFilter] = useState("");
  const [profilePage, setProfilePage] = useState(0);
  const [invitePage, setInvitePage] = useState(0);
  const [selectedProfile, setSelectedProfile] = useState<TutorProfile | null>(
    null,
  );
  const [reviewFooterTarget, setReviewFooterTarget] =
    useState<HTMLElement | null>(null);
  const [latestInviteLinks, setLatestInviteLinks] = useState<
    Record<string, string>
  >({});
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

  const {
    data: profiles = [],
    isFetching: profilesFetching,
    refetch: refetchProfiles,
  } = useQuery({
    queryKey: ["adminTutorProfiles", profileFilter, profilePage],
    queryFn: () =>
      profileFilter
        ? client.adminTutor.listTutorProfiles({
            status: profileFilter as
              | "draft"
              | "pending_review"
              | "changes_requested"
              | "approved_unpublished"
              | "published"
              | "suspended",
            limit: TUTOR_PROFILES_PAGE_SIZE + 1,
            offset: profilePage * TUTOR_PROFILES_PAGE_SIZE,
          })
        : client.adminTutor.listTutorProfiles({
            limit: TUTOR_PROFILES_PAGE_SIZE + 1,
            offset: profilePage * TUTOR_PROFILES_PAGE_SIZE,
          }),
    placeholderData: keepPreviousData,
  });

  const {
    data: invites = [],
    isFetching: invitesFetching,
    refetch: refetchInvites,
  } = useQuery({
    queryKey: ["adminTutorInvites", inviteFilter, invitePage],
    queryFn: () =>
      inviteFilter
        ? client.adminTutor.listInvites({
            status: inviteFilter as
              | "invited"
              | "accepted"
              | "expired"
              | "revoked",
            limit: INVITATIONS_PAGE_SIZE + 1,
            offset: invitePage * INVITATIONS_PAGE_SIZE,
          })
        : client.adminTutor.listInvites({
            limit: INVITATIONS_PAGE_SIZE + 1,
            offset: invitePage * INVITATIONS_PAGE_SIZE,
          }),
    placeholderData: keepPreviousData,
  });

  const visibleProfiles = profiles.slice(0, TUTOR_PROFILES_PAGE_SIZE);
  const visibleInvites = invites.slice(0, INVITATIONS_PAGE_SIZE);

  const resendInvite = useMutation(
    orpc.adminTutor.resendInvite.mutationOptions({
      onSuccess: (data) => {
        void refetchInvites();
        const url = `${window.location.origin}/invite?token=${data.token}`;
        setLatestInviteLinks((current) => ({
          ...current,
          [data.id]: url,
        }));
        void navigator.clipboard.writeText(url);
        toastManager.add({
          title: "New invite link copied",
          description: "The previous invite link is no longer valid.",
          type: "success",
        });
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Invitation could not be renewed",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  const sendInviteAgain = useMutation(
    orpc.adminTutor.sendInviteAgain.mutationOptions({
      onSuccess: (data) => {
        void refetchInvites();
        const url = `${window.location.origin}/invite?token=${data.token}`;
        setLatestInviteLinks((current) => ({
          ...current,
          [data.id]: url,
        }));
        toastManager.add({
          title:
            data.emailDelivery === "sent"
              ? "Invitation sent again"
              : "Email was not delivered",
          description:
            data.emailDelivery === "sent"
              ? "A new link was emailed; the previous link is invalid."
              : "Use Generate & copy link for manual delivery.",
          type: data.emailDelivery === "sent" ? "success" : "warning",
        });
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Invitation could not be sent",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  const revokeInvite = useMutation(
    orpc.adminTutor.revokeInvite.mutationOptions({
      onSuccess: () => {
        void refetchInvites();
        toastManager.add({ title: "Invitation revoked", type: "success" });
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Invitation could not be revoked",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <TutorInviteForm />

      <Card id="admin-tutor-invites" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
          <CardHeaderAction>
            <Select
              value={inviteFilter}
              onValueChange={(v) => {
                setInviteFilter(v as string);
                setInvitePage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectPopup>
                <SelectList>
                  <SelectItem value="">All statuses</SelectItem>
                  <SelectItem value="invited">Invited</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectList>
              </SelectPopup>
            </Select>
          </CardHeaderAction>
        </CardHeader>
        <CardBody aria-busy={invitesFetching}>
          {invites.length === 0 ? (
            <EmptyState
              icon={<IconInbox />}
              title="No invitations found"
              description="New tutor invitations will appear here."
              tone="secondary"
              size="compact"
              className="rounded-lg"
            />
          ) : (
            <TableContainer className="w-[calc(100%+3rem)]!">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tutor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last updated</TableHead>
                    <TableHead className="w-16 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleInvites.map((invite) => {
                    const isInvited = invite.status === "invited";
                    const status = INVITE_STATUS_BADGES[invite.status];
                    const inviteUrl = latestInviteLinks[invite.id];
                    const actionPending =
                      resendInvite.isPending ||
                      sendInviteAgain.isPending ||
                      revokeInvite.isPending;

                    return (
                      <TableRow key={invite.id}>
                        <TableCell>
                          <Text className="font-medium">
                            {invite.displayName}
                          </Text>
                          <Text className="text-sm text-muted">
                            {invite.email}
                          </Text>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={status?.variant ?? "secondary"}
                            className="capitalize"
                          >
                            {invite.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Text className="text-sm text-muted">
                            {new Date(invite.updatedAt).toLocaleString()}
                          </Text>
                        </TableCell>
                        <TableCell className="text-right">
                          <Menu>
                            <MenuTrigger
                              render={
                                <Button
                                  variant="plain"
                                  size="sm"
                                  aria-label={`Actions for ${invite.displayName}`}
                                />
                              }
                            >
                              <IconDots />
                            </MenuTrigger>
                            <MenuPopup align="end" size="compact">
                              {isInvited && inviteUrl ? (
                                <MenuItem
                                  onClick={() => {
                                    void navigator.clipboard
                                      .writeText(inviteUrl)
                                      .then(() =>
                                        toastManager.add({
                                          title: "Invite link copied",
                                          type: "success",
                                        }),
                                      );
                                  }}
                                >
                                  <IconCopy /> Copy invite link
                                </MenuItem>
                              ) : null}
                              {isInvited ? (
                                <>
                                  <MenuItem
                                    disabled={actionPending}
                                    onClick={() =>
                                      resendInvite.mutate({
                                        inviteId: invite.id,
                                      })
                                    }
                                  >
                                    <IconRefresh /> Generate new link
                                  </MenuItem>
                                  <MenuItem
                                    disabled={actionPending}
                                    onClick={() =>
                                      sendInviteAgain.mutate({
                                        inviteId: invite.id,
                                      })
                                    }
                                  >
                                    <IconRefresh /> Send again
                                  </MenuItem>
                                  <MenuSeparator />
                                  <MenuItem
                                    className="text-danger"
                                    disabled={actionPending}
                                    onClick={() =>
                                      revokeInvite.mutate({
                                        inviteId: invite.id,
                                      })
                                    }
                                  >
                                    <IconTrash /> Revoke invitation
                                  </MenuItem>
                                </>
                              ) : (
                                <MenuItem disabled>
                                  No actions available
                                </MenuItem>
                              )}
                            </MenuPopup>
                          </Menu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {invites.length > 0 || invitePage > 0 ? (
            <PaginationControls
              targetId="admin-tutor-invites"
              label="invitations"
              pageSize={INVITATIONS_PAGE_SIZE}
              page={invitePage}
              hasNext={invites.length > INVITATIONS_PAGE_SIZE}
              isFetching={invitesFetching}
              onPrevious={() => setInvitePage((page) => Math.max(0, page - 1))}
              onNext={() => setInvitePage((page) => page + 1)}
            />
          ) : null}
        </CardBody>
      </Card>

      <Card id="admin-tutor-profiles" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Tutor Profiles</CardTitle>
          <CardHeaderAction>
            <Select
              value={profileFilter}
              onValueChange={(v) => {
                setProfileFilter(v as string);
                setProfilePage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectPopup>
                <SelectList>
                  <SelectItem value="">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                  <SelectItem value="changes_requested">
                    Changes Requested
                  </SelectItem>
                  <SelectItem value="approved_unpublished">
                    Approved (unpublished)
                  </SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectList>
              </SelectPopup>
            </Select>
          </CardHeaderAction>
        </CardHeader>
        <CardBody aria-busy={profilesFetching}>
          {profiles.length === 0 ? (
            <EmptyState
              icon={<IconInbox />}
              title="No tutor profiles found"
              description="Tutor profiles matching this status will appear here."
              tone="secondary"
              size="compact"
              className="rounded-lg"
            />
          ) : (
            <TableContainer className="w-[calc(100%+3rem)]!">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tutor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Modality</TableHead>
                    <TableHead>Last updated</TableHead>
                    <TableHead className="w-24 text-right">Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleProfiles.map((profile) => {
                    const status = PROFILE_STATUS[profile.onboardingStatus];

                    return (
                      <TableRow key={profile.id}>
                        <TableCell>
                          <Text className="font-medium">
                            {profile.displayName ??
                              profile.user?.name ??
                              "Tutor"}
                          </Text>
                          <Text className="text-sm text-muted">
                            {profile.user?.email ?? "No email"}
                          </Text>
                        </TableCell>
                        <TableCell>
                          <Badge variant={status?.variant ?? "secondary"}>
                            {status?.label ?? profile.onboardingStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Text className="text-sm capitalize text-muted">
                            {profile.modality ?? "Not set"}
                          </Text>
                        </TableCell>
                        <TableCell>
                          <Text className="text-sm text-muted">
                            {new Date(profile.updatedAt).toLocaleString()}
                          </Text>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setSelectedProfile(profile)}
                          >
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {profiles.length > 0 || profilePage > 0 ? (
            <PaginationControls
              targetId="admin-tutor-profiles"
              label="tutor profiles"
              pageSize={TUTOR_PROFILES_PAGE_SIZE}
              page={profilePage}
              hasNext={profiles.length > TUTOR_PROFILES_PAGE_SIZE}
              isFetching={profilesFetching}
              onPrevious={() => setProfilePage((page) => Math.max(0, page - 1))}
              onNext={() => setProfilePage((page) => page + 1)}
            />
          ) : null}
        </CardBody>
      </Card>

      <Drawer
        open={selectedProfile !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedProfile(null);
        }}
      >
        <DrawerPopup direction="right" className="w-full max-w-2xl">
          <DrawerHeader className="justify-between border-b border-drawer-border pb-4.5">
            <div className="min-w-0">
              <DrawerTitle className="truncate">
                {selectedProfile?.displayName ??
                  selectedProfile?.user?.name ??
                  "Tutor review"}
              </DrawerTitle>
              <DrawerDescription>
                Review profile details, proofs, photos, and publication status.
              </DrawerDescription>
            </div>
            <DrawerClose
              render={<Button variant="plain" size="sm" aria-label="Close" />}
            >
              <IconX />
            </DrawerClose>
          </DrawerHeader>
          <DrawerBody className="p-0! [&>[data-slot=card]]:rounded-none! [&>[data-slot=card]]:bg-transparent! [&>[data-slot=card]]:shadow-none! [&>[data-slot=card]]:ring-0!">
            {selectedProfile ? (
              <TutorReviewCard
                profile={{
                  ...selectedProfile,
                  expertise: selectedProfile.expertise ?? [],
                  bankAccountOwnership:
                    selectedProfile.bankAccountOwnership === "self" ||
                    selectedProfile.bankAccountOwnership === "trusted_person"
                      ? selectedProfile.bankAccountOwnership
                      : null,
                }}
                subjectLabels={subjectLabels}
                footerTarget={reviewFooterTarget}
                onAction={() => {
                  void refetchProfiles();
                  setSelectedProfile(null);
                }}
              />
            ) : null}
          </DrawerBody>
          <DrawerFooter
            ref={setReviewFooterTarget}
            className="flex-wrap gap-2"
          />
        </DrawerPopup>
      </Drawer>
    </div>
  );
}

function PaginationControls({
  targetId,
  label,
  pageSize,
  page,
  hasNext,
  isFetching,
  onPrevious,
  onNext,
}: {
  targetId: string;
  label: string;
  pageSize: number;
  page: number;
  hasNext: boolean;
  isFetching: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  function changePage(change: () => void) {
    change();
    requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      if (!target) return;

      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });
  }

  return (
    <Pagination className="mt-4 flex-col gap-3 border-t border-card-separator pt-4 sm:flex-row sm:items-center sm:justify-between">
      <Text className="text-sm text-muted">
        Page {page + 1} · Up to {pageSize} {label} per page
      </Text>
      <PaginationList>
        <PaginationItem>
          <PaginationButton
            type="button"
            aria-label="Previous page"
            aria-controls={targetId}
            disabled={page === 0 || isFetching}
            onClick={
              page === 0 || isFetching
                ? undefined
                : () => changePage(onPrevious)
            }
          >
            <IconChevronLeft /> Previous
          </PaginationButton>
        </PaginationItem>
        <PaginationItem>
          <PaginationButton active aria-label={`Page ${page + 1}`}>
            {page + 1}
          </PaginationButton>
        </PaginationItem>
        <PaginationItem>
          <PaginationButton
            type="button"
            aria-label="Next page"
            aria-controls={targetId}
            disabled={!hasNext || isFetching}
            onClick={
              !hasNext || isFetching ? undefined : () => changePage(onNext)
            }
          >
            Next <IconChevronRight />
          </PaginationButton>
        </PaginationItem>
      </PaginationList>
    </Pagination>
  );
}
