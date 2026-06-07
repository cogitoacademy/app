import { createFileRoute } from "@tanstack/react-router";

import { LoginPage } from "@/components/login-page";
import { validateLoginSearch } from "./-login-search";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: validateLoginSearch,
});
