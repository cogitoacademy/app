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
    const role = (session.data?.user as CogitoUser | undefined)?.role;
    if (!session.data) {
      throw redirect({ to: "/login" });
    }
    if (role === "tutor") {
      throw redirect({ to: "/onboarding" });
    }
    if (role === "admin") {
      throw redirect({ to: "/admin-tutors" });
    }
    if (search.redirect) {
      throw redirect({ to: search.redirect });
    }
    throw redirect({ to: "/dashboard" });
  },
});
