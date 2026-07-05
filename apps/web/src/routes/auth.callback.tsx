import { createFileRoute, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/auth/callback")({
  beforeLoad: async () => {
    const session = await authClient.getSession({
      query: { disableCookieCache: true },
    });
    const role = (session.data?.user as { role?: string } | undefined)?.role;
    if (!session.data) {
      throw redirect({ to: "/login" });
    }
    if (role === "tutor") {
      throw redirect({ to: "/onboarding" });
    }
    if (role === "admin") {
      throw redirect({ to: "/admin-tutors" });
    }
    throw redirect({ to: "/dashboard" });
  },
});
