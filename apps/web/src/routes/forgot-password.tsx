import { createFileRoute } from "@tanstack/react-router";

import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordForm,
});