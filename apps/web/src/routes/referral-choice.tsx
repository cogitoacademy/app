import { createFileRoute, redirect } from "@tanstack/react-router";

import type { CogitoUser } from "@cogito-app/auth";
import { ReferralChoicePage } from "@/components/referral-choice-page";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/referral-choice")({
  beforeLoad: async () => {
    const session = await authClient.getSession({
      query: { disableCookieCache: true },
    });
    if (!session.data) throw redirect({ to: "/login" });
    const user = session.data.user as CogitoUser;
    if (user.role !== "student" || !user.referralChoicePending) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: ReferralChoicePage,
  head: () => ({
    meta: [{ title: "Referral choice · Cogito Academy" }],
  }),
});
