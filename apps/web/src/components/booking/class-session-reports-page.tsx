"use client";

import { useState } from "react";
import { useSearch } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { StudentReportsWorkspace } from "./student-reports-workspace";
import { SessionReportingWorkspace } from "./session-reporting-workspace";
import { FilterTabBar } from "@/components/filter-tab-bar";
import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";

export function ClassSessionReportsPage() {
  const auth = authClient.useSession();
  const user = auth.data?.user as CogitoUser | undefined;
  const search = useSearch({ from: "/_app/class-reports" });
  const [workspace, setWorkspace] = useState(
    search.report ? "sessions" : (search.workspace ?? "reports"),
  );
  if (auth.isPending || !user) return <Loader />;
  if (user.role === "tutor")
    return <SessionReportingWorkspace initialReportId={search.report} />;
  return (
    <Stack
      direction="column"
      spacing="md"
      className="w-full min-w-0 flex-nowrap"
    >
      {user.role === "admin" ? (
        <>
          <div>
            <Heading level={1} size="md">
              Follow up on learning progress
            </Heading>
            <Text className="max-w-full text-muted">
              Review student feedback or record reports for delivered sessions.
            </Text>
          </div>
          <FilterTabBar
            tabs={[
              { value: "reports", label: "Student Reports" },
              { value: "sessions", label: "Session Reporting" },
            ]}
            activeTab={workspace}
            onChange={setWorkspace}
            label="Report workspace"
          />
        </>
      ) : null}
      {user.role === "admin" && workspace === "sessions" ? (
        <SessionReportingWorkspace
          showHeading={false}
          initialReportId={search.report}
        />
      ) : (
        <StudentReportsWorkspace
          key={user.id}
          isAdmin={user.role === "admin"}
          currentUserId={user.id}
          showHeading={user.role !== "admin"}
        />
      )}
    </Stack>
  );
}
