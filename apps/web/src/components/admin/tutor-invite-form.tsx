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
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { orpc } from "@/utils/orpc";

export function TutorInviteForm() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const createMutation = useMutation(
    orpc.adminTutor.createInvite.mutationOptions({
      onSuccess: (data) => {
        toastManager.add({
          title: `Invitation sent to ${data.email}`,
          type: "success",
        });
        if (data.token) {
          const url = `${window.location.origin}/invite?token=${data.token}`;
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
        const message =
          error && typeof error === "object" && "message" in error
            ? String((error as { message?: string }).message)
            : "Failed to create invite";
        toastManager.add({ title: message, type: "error" });
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
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tutor@example.com"
              required
            />
          </Field>
          <Field>
            <FieldLabel>Display Name *</FieldLabel>
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
              placeholder="Recommended by... / Specialization: ..."
            />
          </Field>
        </form>
      </CardBody>
      <CardFooter>
        <Button
          type="submit"
          form="tutor-invite-form"
          block
          progress={createMutation.isPending}
          disabled={!email || !displayName || createMutation.isPending}
        >
          Send Invitation
        </Button>
      </CardFooter>
    </Card>
  );
}
