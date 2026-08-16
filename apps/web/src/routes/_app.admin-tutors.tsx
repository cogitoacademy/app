import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Input } from "@cogito-app/ui/components/selia/input";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import type { CogitoUser } from "@cogito-app/auth";
import { client, orpc } from "@/utils/orpc";
import { TutorInviteForm } from "@/components/admin/tutor-invite-form";
import { TutorReviewCard } from "@/components/admin/tutor-review-card";
import {
  IconCopy,
  IconInbox,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { EmptyState } from "@/components/empty-state";

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
  const [latestInviteLinks, setLatestInviteLinks] = useState<
    Record<string, string>
  >({});

  const { data: profiles = [], refetch: refetchProfiles } = useQuery({
    queryKey: ["adminTutorProfiles", profileFilter],
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
          })
        : client.adminTutor.listTutorProfiles(),
  });

  const { data: invites = [], refetch: refetchInvites } = useQuery({
    queryKey: ["adminTutorInvites", inviteFilter],
    queryFn: () =>
      inviteFilter
        ? client.adminTutor.listInvites({
            status: inviteFilter as
              | "invited"
              | "accepted"
              | "expired"
              | "revoked",
          })
        : client.adminTutor.listInvites(),
  });

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
          description: error.message,
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
          description: error.message,
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
          description: error.message,
          type: "error",
        }),
    }),
  );

  return (
    <div className="p-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Manage Tutors</h1>

      <TutorInviteForm />

      <Card>
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
          <CardHeaderAction>
            <Select
              value={inviteFilter}
              onValueChange={(v) => setInviteFilter(v as string)}
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
        <CardBody>
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
            <div className="flex flex-col gap-2">
              {invites.map(
                (invite: {
                  id: string;
                  displayName: string;
                  email: string;
                  status: string;
                  token?: string;
                  updatedAt: Date;
                }) => (
                  <div
                    key={invite.id}
                    className="flex flex-col gap-3 rounded-lg border border-item-border bg-item p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col">
                      <Text className="font-medium">{invite.displayName}</Text>
                      <Text className="text-sm text-muted">{invite.email}</Text>
                      <Text className="text-xs text-dimmed">
                        Last updated{" "}
                        {new Date(invite.updatedAt).toLocaleString()}
                      </Text>
                      {latestInviteLinks[invite.id] ? (
                        <div className="mt-2 flex max-w-xl gap-2">
                          <Input
                            value={latestInviteLinks[invite.id]}
                            readOnly
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              void navigator.clipboard.writeText(
                                latestInviteLinks[invite.id]!,
                              );
                            }}
                          >
                            <IconCopy /> Copy
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="capitalize">
                        {invite.status}
                      </Badge>
                      {invite.status === "invited" && invite.token && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const url = `${window.location.origin}/invite?token=${invite.token}`;
                            void navigator.clipboard.writeText(url).then(() =>
                              toastManager.add({
                                title: "Invite link copied",
                                type: "success",
                              }),
                            );
                          }}
                        >
                          <IconCopy /> Copy link
                        </Button>
                      )}
                      {invite.status === "invited" ? (
                        <>
                          <Button
                            size="sm"
                            variant="plain"
                            onClick={() =>
                              resendInvite.mutate({ inviteId: invite.id })
                            }
                            progress={
                              resendInvite.isPending &&
                              resendInvite.variables?.inviteId === invite.id
                            }
                            disabled={
                              resendInvite.isPending ||
                              sendInviteAgain.isPending ||
                              revokeInvite.isPending
                            }
                          >
                            <IconRefresh /> Generate &amp; copy link
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              sendInviteAgain.mutate({ inviteId: invite.id })
                            }
                            progress={
                              sendInviteAgain.isPending &&
                              sendInviteAgain.variables?.inviteId === invite.id
                            }
                            disabled={
                              resendInvite.isPending ||
                              sendInviteAgain.isPending ||
                              revokeInvite.isPending
                            }
                          >
                            Send again
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              revokeInvite.mutate({ inviteId: invite.id })
                            }
                            progress={
                              revokeInvite.isPending &&
                              revokeInvite.variables?.inviteId === invite.id
                            }
                            disabled={
                              resendInvite.isPending || revokeInvite.isPending
                            }
                          >
                            <IconTrash /> Revoke
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tutor Profiles</CardTitle>
          <CardHeaderAction>
            <Select
              value={profileFilter}
              onValueChange={(v) => setProfileFilter(v as string)}
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
        <CardBody>
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
            <div className="grid items-stretch gap-4 lg:grid-cols-2">
              {profiles.map(
                (
                  profile: Awaited<
                    ReturnType<typeof client.adminTutor.listTutorProfiles>
                  >[number],
                ) => (
                  <TutorReviewCard
                    key={profile.id}
                    profile={{
                      ...profile,
                      expertise: profile.expertise ?? [],
                    }}
                    onAction={() => refetchProfiles()}
                  />
                ),
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
