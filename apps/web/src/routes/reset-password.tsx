import { createFileRoute } from "@tanstack/react-router";

import { ResetPasswordForm } from "@/components/reset-password-form";

export type ResetPasswordSearch = {
  token?: string;
  error?: string;
};

export function validateResetPasswordSearch(
  search: Record<string, string>,
): ResetPasswordSearch {
  return {
    token: search.token ?? undefined,
    error: search.error ?? undefined,
  };
}

export const Route = createFileRoute("/reset-password")({
  component: RouteComponent,
  validateSearch: validateResetPasswordSearch,
});

function RouteComponent() {
  const { token, error } = Route.useSearch();
  return <ResetPasswordForm token={token} invalidLinkError={error} />;
}