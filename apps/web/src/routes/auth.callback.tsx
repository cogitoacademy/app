import { createFileRoute, redirect } from "@tanstack/react-router";

import type { CogitoUser } from "@cogito-app/auth";
import { authClient } from "@/lib/auth-client";
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
    const destination =
      role === "tutor"
        ? "/profile"
        : role === "admin"
          ? "/admin-tutors"
          : (search.redirect ?? "/dashboard");

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
