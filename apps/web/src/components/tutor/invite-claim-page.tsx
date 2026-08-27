"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { client } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";
import { getUserFacingError } from "@/lib/error-message";

export function InviteClaimPage({ token }: { token: string }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{
    email: string;
    displayName: string;
  } | null>(null);

  async function handleVerify() {
    if (!token) {
      toastManager.add({
        title: "Invitation link is incomplete",
        description: "Ask the administrator to send a new invitation link.",
        type: "error",
      });
      return;
    }
    setLoading(true);
    try {
      const result = await client.invite.verify({ token });
      setInviteInfo({ email: result.email, displayName: result.displayName });
      setVerified(true);
    } catch {
      toastManager.add({
        title: "Invite not found or expired",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void handleVerify();
    // The token is the only input that should restart verification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleClaim() {
    setLoading(true);
    try {
      const session = await authClient.getSession();
      if (!session.data) {
        // Not logged in — redirect to login, come back here after
        toastManager.add({
          title: "Please sign up or sign in to claim this invitation.",
          type: "info",
        });
        navigate({
          to: "/login",
          search: { redirect: `/invite?token=${token}` },
        });
        return;
      }

      const userEmail = session.data.user.email;
      if (
        inviteInfo &&
        userEmail.toLowerCase() !== inviteInfo.email.toLowerCase()
      ) {
        toastManager.add({
          title: `This invite is for ${inviteInfo.email}. Please sign in with that email.`,
          type: "error",
        });
        await authClient.signOut();
        navigate({
          to: "/login",
          search: { redirect: `/invite?token=${token}` },
        });
        return;
      }

      await client.invite.claim({ token });
      await authClient.getSession({ query: { disableCookieCache: true } });
      toastManager.add({
        title: "Tutor access activated",
        description: "Complete your tutor profile to continue.",
        type: "success",
      });
      window.location.assign("/onboarding");
    } catch (error: unknown) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String((error as { message?: string }).message)
          : "Failed to claim invite";
      if (
        message.includes("UNAUTHORIZED") ||
        message.includes("Unauthorized") ||
        message.includes("401")
      ) {
        toastManager.add({
          title: "Please sign up or sign in to claim this invitation.",
          type: "info",
        });
        navigate({
          to: "/login",
          search: { redirect: `/invite?token=${token}` },
        });
      } else if (message.includes("different email")) {
        toastManager.add({
          title: `This invite is for ${inviteInfo?.email}. Please sign in with that email.`,
          type: "error",
        });
        await authClient.signOut();
        navigate({
          to: "/login",
          search: { redirect: `/invite?token=${token}` },
        });
      } else {
        toastManager.add({
          title: "Invitation could not be claimed",
          description: getUserFacingError(
            error,
            "Please try again or ask the administrator to send a new invitation link.",
          ),
          type: "error",
        });
      }
    } finally {
      setLoading(false);
    }
  }

  if (!verified) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader align="center">
            <CardTitle>Tutor Invitation</CardTitle>
            <CardDescription>
              Verify your invitation to become a tutor on Cogito
            </CardDescription>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <Text className="text-center text-muted">
              {loading
                ? "Checking your invitation..."
                : "This invitation could not be verified."}
            </Text>
            {!loading ? (
              <Button block variant="secondary" onClick={handleVerify}>
                Try again
              </Button>
            ) : null}
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader align="center">
          <CardTitle>Welcome, {inviteInfo?.displayName}!</CardTitle>
          <CardDescription>
            You've been invited to join Cogito as a tutor. This invitation was
            sent to <strong>{inviteInfo?.email}</strong>.
          </CardDescription>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Text>
            By claiming this invitation, you'll gain tutor access and can set up
            your tutor profile. You must be logged in with the email address{" "}
            <strong>{inviteInfo?.email}</strong> to claim this invite.
          </Text>
          <Button
            block
            progress={loading}
            disabled={loading}
            onClick={handleClaim}
          >
            Claim Invitation
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
