import { useQuery } from "@tanstack/react-query";

import type { CogitoUser } from "@cogito-app/auth";

import { orpc } from "@/utils/orpc";

export function useRole() {
  const { data, isLoading } = useQuery(orpc.auth.me.queryOptions());
  const user = data?.user as CogitoUser | undefined;

  return {
    role: user?.role ?? "student",
    user,
    profile: data?.profile,
    tutorProfile: data?.tutorProfile ?? null,
    isLoading,
  };
}