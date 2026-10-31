import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";
export const Route = createFileRoute("/_app/admin-content")({
  head: () => ({ meta: [{ title: "KB & calendar · Cogito Academy" }] }),
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    throw redirect({
      to: user?.role === "admin" ? "/knowledge-bank" : "/dashboard",
    });
  },
});
