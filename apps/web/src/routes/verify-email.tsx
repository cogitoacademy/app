import { createFileRoute } from "@tanstack/react-router";

import { VerifyEmailForm } from "@/components/verify-email-form";

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, string>) => {
    const email = search.email;
    const redirect = search.redirect;

    return {
      ...(email ? { email } : {}),
      ...(redirect && redirect.startsWith("/") && !redirect.startsWith("//")
        ? { redirect }
        : {}),
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();
  return (
    <VerifyEmailForm email={search.email} redirectPath={search.redirect} />
  );
}
