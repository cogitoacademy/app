import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";

import type { CogitoUser } from "@cogito-app/auth";

import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { Layout } from "@/components/dashboard/layout";
import { authClient } from "@/lib/auth-client";

const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/admin": "Admin workspace",
  "/balance": "Balance",
  "/bookings": "Bookings",
  "/classes": "Classes",
  "/class-reports": "Session reports",
  "/achievements": "Achievements",
  "/referrals": "My referrals",
  "/admin-referrals": "Referral usage",
  "/tutors": "Tutors",
  "/profile": "Profile",
  "/availability": "Availability",
  "/notifications": "Notifications",
  "/admin-tutors": "Manage Tutors",
  "/admin-tutor-payouts": "Tutor Payouts",
  "/admin-kol-commissions": "KOL commissions",
  "/admin-achievements": "Achievement Moderation",
  "/admin-operations": "Operations",
  "/admin-economy": "Economy Settings",
  "/admin-classes": "Class studio",
  "/admin-competitions": "Competition types",
  "/faq": "FAQ",
  "/admin-knowledge-bank": "Knowledge Bank Access",
  "/calendar": "Competition Calendar",
  "/knowledge-bank": "Knowledge Bank",
  "/guide": "How Cogito Works",
};

export const Route = createFileRoute("/_app")({
  component: RouteComponent,
  beforeLoad: async () => {
    // Role is a custom user field, so authorize from the database-backed
    // session response instead of a potentially stale cookie-cache snapshot.
    const session = await authClient.getSession({
      query: { disableCookieCache: true },
    });
    if (!session.data) {
      throw redirect({
        to: "/login",
      });
    }
    const sessionUser = session.data.user as CogitoUser;
    if (sessionUser.role === "student" && sessionUser.referralChoicePending) {
      redirect({ to: "/referral-choice", throw: true });
    }
    return { session };
  },
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Route guards normally prevent this state, but auth failures can resolve
  // during a navigation while the shell is still mounted. Keep the shell from
  // dereferencing an absent auth result and let the route recover at login.
  if (!session?.data?.user) {
    return null;
  }

  const role = (session.data.user as CogitoUser).role;
  const isTutorProfile = pathname === "/profile" && role === "tutor";
  const title = isTutorProfile
    ? "Tutor Profile"
    : pathname.startsWith("/classes/")
      ? "Class details"
      : pathname.startsWith("/bookings/")
        ? "Booking Details"
        : pathname.startsWith("/tutors/")
          ? "Book a Session"
          : (routeTitles[pathname] ?? "Dashboard");

  return (
    <Layout
      contentScrollMode="page"
      title={title}
      sidebar={
        <AppSidebar
          userEmail={session.data.user.email}
          userImage={session.data.user.image}
          userName={session.data.user.name}
          role={role}
        />
      }
      role={role}
      sessionExpiresAt={session.data.session.expiresAt}
    >
      <Outlet />
    </Layout>
  );
}
