import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import type { CogitoUser } from "@cogito-app/auth";
import { client } from "@/utils/orpc";
import { TutorInviteForm } from "@/components/admin/tutor-invite-form";
import { TutorReviewCard } from "@/components/admin/tutor-review-card";
import { IconCopy } from "@tabler/icons-react";

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

  const { data: invites = [] } = useQuery({
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
            <Text className="text-muted">No invitations found.</Text>
          ) : (
            <div className="flex flex-col gap-2">
              {invites.map(
                (invite: {
                  id: string;
                  displayName: string;
                  email: string;
                  status: string;
                  token?: string;
                }) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between border-b border-item-border pb-2"
                  >
                    <div className="flex flex-col">
                      <Text className="font-medium">{invite.displayName}</Text>
                      <Text className="text-sm text-muted">{invite.email}</Text>
                    </div>

                    <div className="flex items-center gap-2">
                      <Text className="text-sm">{invite.status}</Text>
                      {invite.status === "invited" && invite.token && (
                        <IconBox
                          size="sm"
                          variant="info"
                          onClick={() => {
                            const url = `${window.location.origin}/invite?token=${invite.token}`;
                            navigator.clipboard.writeText(url);
                            toastManager.add({
                              title: "Invite link copied!",
                              type: "success",
                            });
                          }}
                        >
                          <IconCopy />
                        </IconBox>
                      )}
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
            <Text className="text-muted">No tutor profiles found.</Text>
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
