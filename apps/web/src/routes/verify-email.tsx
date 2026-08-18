import { createFileRoute } from "@tanstack/react-router";

import { VerifyEmailForm } from "@/components/verify-email-form";

export const Route = createFileRoute("/verify-email")({
  component: VerifyEmailForm,
});
