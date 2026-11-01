import { createFileRoute } from "@tanstack/react-router";
import { useRole } from "@/hooks/use-role";
import { ActivitiesPage } from "@/components/admin/activities-page";
export const Route = createFileRoute("/_app/activities")({ component: Page });
function Page() {
  const { role, isLoading } = useRole();
  if (isLoading) return null;
  return role === "admin" ? <ActivitiesPage /> : <p>Admin access required.</p>;
}
