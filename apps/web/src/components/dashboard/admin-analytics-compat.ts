import type { DashboardAnalytics } from "@cogito-app/api/modules/admin/admin.service";

export function getBusinessSummary(data: DashboardAnalytics) {
  return (data as Partial<DashboardAnalytics>).businessSummary;
}
