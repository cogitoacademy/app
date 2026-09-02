import { createFileRoute, redirect } from "@tanstack/react-router";

import type { CogitoUser } from "@cogito-app/auth";
import { authClient } from "@/lib/auth-client";
import {
  getPostLoginDestination,
  readTutorOnboardingStatus,
} from "@/lib/post-login-redirect";
import { client } from "@/utils/orpc";
import { validateLoginSearch } from "./-login-search";

export const Route = createFileRoute("/auth/callback")({
  validateSearch: validateLoginSearch,
  beforeLoad: async ({ search }) => {
    const session = await authClient.getSession({
      query: { disableCookieCache: true },
    });
    if (!session.data) {
      throw redirect({ to: "/login" });
    }

    const sessionUser = session.data.user as CogitoUser;
    const role = sessionUser.role;
    const tutorOnboardingStatus =
      role === "tutor" && !search.redirect
        ? await readTutorOnboardingStatus(() => client.tutor.getMyProfile())
        : undefined;
    const destination = getPostLoginDestination({
      role,
      tutorOnboardingStatus,
      redirectPath: search.redirect,
    });

    if (sessionUser.emailVerified !== true) {
      try {
        await authClient.emailOtp.sendVerificationOtp({
          email: sessionUser.email,
          type: "email-verification",
        });
      } catch {
        // The verification page includes a resend action if the automatic
        // request fails (for example, when the email provider is unavailable).
      }

      throw redirect({
        to: "/verify-email",
        search: {
          email: sessionUser.email,
          redirect: destination,
        },
      });
    }

    throw redirect({ to: destination });
  },
});
