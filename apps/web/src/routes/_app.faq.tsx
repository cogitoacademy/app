import { createFileRoute } from "@tanstack/react-router";
import { useRole } from "@/hooks/use-role";
import { FaqPage as AdminFaqPage } from "@/components/admin/faq-page";
import { FaqReadOnlyPage } from "@/components/admin/faq-read-only-page";

export const Route = createFileRoute("/_app/faq")({
  head: () => ({
    meta: [{ title: "FAQ · Cogito Academy" }],
  }),
  component: FaqPage,
});

function FaqPage() {
  const { role, isLoading } = useRole();
  if (isLoading) return null;
  return role === "admin" ? <AdminFaqPage /> : <FaqReadOnlyPage />;
}
