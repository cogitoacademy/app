"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@cogito-app/ui/components/selia/card";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";

export function TutorInviteForm() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);

  const inspectMutation = useMutation(
    orpc.adminTutor.inspectInvitee.mutationOptions(),
  );

  function inspectEmail() {
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail && normalizedEmail.includes("@")) {
      inspectMutation.mutate({ email: normalizedEmail });
    }
  }

  const inviteeIsAdmin =
    inspectMutation.data?.exists === true &&
    inspectMutation.data.role === "admin";

  const createMutation = useMutation(
    orpc.adminTutor.createInvite.mutationOptions({
      onSuccess: (data) => {
        toastManager.add(
          data.emailDelivery === "sent"
            ? { title: `Invitation emailed to ${data.email}`, type: "success" }
            : {
                title: "Invitation created; send the link manually",
                description: "Resend did not confirm delivery.",
                type: "warning",
              },
        );
        if (data.token) {
          const url = `${window.location.origin}/invite?token=${data.token}`;
          setLatestInviteUrl(url);
          void navigator.clipboard.writeText(url).then(() =>
            toastManager.add({
              title: "Invite link copied to clipboard",
              type: "success",
            }),
          );
        }
        void queryClient.invalidateQueries({
          queryKey: orpc.adminTutor.listInvites.key(),
        });
        setEmail("");
        setDisplayName("");
        setInternalNotes("");
      },
      onError: (error: unknown) => {
        toastManager.add({
          title: "Invitation could not be created",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      email,
      displayName,
      internalNotes: internalNotes || undefined,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite Tutor</CardTitle>
      </CardHeader>
      <CardBody>
        <form
          id="tutor-invite-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <Field>
            <FieldLabel>Email Address *</FieldLabel>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                inspectMutation.reset();
              }}
              onBlur={inspectEmail}
              placeholder="tutor@example.com"
              required
            />
          </Field>
          {inspectMutation.isPending ? (
            <Text className="text-sm text-muted">Checking account…</Text>
          ) : inspectMutation.isError ? (
            <Text className="text-sm text-danger">
              Account status could not be checked. You can retry by leaving the
              email field again.
            </Text>
          ) : inspectMutation.data ? (
            <div className="rounded-lg border border-item-border bg-item p-3">
              {inspectMutation.data.exists ? (
                <div className="flex flex-col gap-2">
                  <Text className="font-medium">
                    Existing account: {inspectMutation.data.name}
                  </Text>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      Role: {inspectMutation.data.role}
                    </Badge>
                    {inspectMutation.data.hasGoogle ? (
                      <Badge variant="info">Google</Badge>
                    ) : null}
                    {inspectMutation.data.hasPassword ? (
                      <Badge variant="secondary">Email &amp; password</Badge>
                    ) : null}
                  </div>
                  {inviteeIsAdmin ? (
                    <Text className="text-sm text-danger">
                      This is an admin account and cannot be invited as a tutor.
                    </Text>
                  ) : (
                    <Text className="text-sm text-muted">
                      Ask this tutor to sign in using one of the methods shown
                      above and the same email address.
                    </Text>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <Text className="font-medium">No account yet</Text>
                  <Text className="text-sm text-muted">
                    The tutor must create an account with this email before
                    claiming the invitation.
                  </Text>
                </div>
              )}
            </div>
          ) : null}
          <Field>
            <FieldLabel>Recipient name *</FieldLabel>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Dr. Sarah Chen"
              required
            />
          </Field>
          <Field>
            <FieldLabel>Internal Notes (optional)</FieldLabel>
            <Input
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Recommended by… / Specialization: …"
            />
          </Field>
          {latestInviteUrl ? (
            <Field>
              <FieldLabel>Latest invite link</FieldLabel>
              <div className="flex gap-2">
                <Input value={latestInviteUrl} readOnly />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(latestInviteUrl);
                    toastManager.add({
                      title: "Invite link copied",
                      type: "success",
                    });
                  }}
                >
                  Copy link
                </Button>
              </div>
            </Field>
          ) : null}
        </form>
      </CardBody>
      <CardFooter>
        <Button
          type="submit"
          form="tutor-invite-form"
          block
          progress={createMutation.isPending}
          disabled={
            !email || !displayName || inviteeIsAdmin || createMutation.isPending
          }
        >
          Send Invitation
        </Button>
      </CardFooter>
    </Card>
  );
}
