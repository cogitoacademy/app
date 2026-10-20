import { createFileRoute } from "@tanstack/react-router";
import { FaqReadOnlyPage } from "@/components/admin/faq-read-only-page";

export const Route = createFileRoute("/_app/faq")({
  head: () => ({
    meta: [{ title: "FAQ · Cogito Academy" }],
  }),
  component: FaqReadOnlyPage,
});
