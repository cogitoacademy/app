"use client";

import Loader from "@/components/loader";

import { IconCopy, IconUsers } from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import {
  Table,
  TableContainer,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@cogito-app/ui/components/selia/table";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/components/empty-state";
import { InfoPreview } from "@/components/info-preview";
import { CogitoMarks } from "@/components/cogito-marks";
import { orpc } from "@/utils/orpc";

function formatSemesterEnd(value: Date | string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

async function copyReferralText(value: string, title: string) {
  try {
    await navigator.clipboard.writeText(value);
    toastManager.add({ title, type: "success", timeout: 2500 });
  } catch {
    toastManager.add({
      title: "Couldn't copy. Select and copy the text instead.",
      type: "error",
    });
  }
}

export function ReferralsPage() {
  const { data, isLoading, isError, refetch } = useQuery(
    orpc.referral.getMine.queryOptions(),
  );

  if (isLoading) {
    return <Loader />;
  }
  if (isError || !data) {
    return (
      <Stack direction="column" spacing="md">
        <Text>We couldn't load your referral details.</Text>
        <Button variant="secondary" onClick={() => refetch()}>
          Try again
        </Button>
      </Stack>
    );
  }

  const shareMessage = `Join me at Cogito Academy! Use my code ${data.code} when you sign up to get ${data.settings.welcomeMarks} welcome Marks.`;

  return (
    <Stack direction="column" spacing="lg">
      <div>
        <Heading level={1} size="md">
          My referrals
        </Heading>
        <Text className="max-w-full text-muted">
          Share your friend code and track rewards earned from completed paid
          sessions.
        </Text>
      </div>

      <Card>
        <CardBody className="grid gap-6 py-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="space-y-3">
            <Text className="text-sm font-medium text-muted">
              LEARN TOGETHER
            </Text>
            <Heading level={2} size="lg">
              Good things are better with friends.
            </Heading>
            <Text className="max-w-xl text-muted">
              Your friends get {data.settings.welcomeMarks} welcome Marks when
              they sign up with your code. You can earn rewards after their
              first completed paid session, within your semester cap.
            </Text>
          </div>
          <div className="flex min-w-0 flex-col items-start gap-3">
            <Text className="text-sm text-muted">Your friend code</Text>
            <div className="flex items-center gap-2">
              <Text className="font-mono text-3xl font-semibold tracking-wider">
                {data.code}
              </Text>
              <Button
                variant="plain"
                size="icon"
                aria-label="Copy referral code"
                onClick={() =>
                  copyReferralText(data.code, "Referral code copied")
                }
              >
                <IconCopy />
              </Button>
            </div>
            <Button
              onClick={() =>
                copyReferralText(shareMessage, "Invite message copied")
              }
            >
              Copy invite message
            </Button>
          </div>
        </CardBody>
      </Card>
      <section
        aria-label="Semester rewards"
        className="grid gap-5 border-b border-border pb-6 sm:grid-cols-3"
      >
        <div className="space-y-1">
          <Text className="text-muted">Earned this semester</Text>
          <Text className="text-2xl font-semibold">
            <CogitoMarks value={data.semester.earnedMarks} />
          </Text>
        </div>
        <div className="space-y-1">
          <Text className="text-muted">Remaining reward allowance</Text>
          <Text className="text-2xl font-semibold">
            <CogitoMarks value={data.semester.remainingMarks} />
          </Text>
        </div>
        <div className="space-y-1">
          <Text className="text-muted">Semester ends</Text>
          <Text className="text-lg font-medium">
            {formatSemesterEnd(data.semester.endsAt)}
          </Text>
        </div>
      </section>
      <section
        className="min-w-0 space-y-4"
        aria-labelledby="invited-friends-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Heading id="invited-friends-heading" level={2} size="sm">
            Invited friends
          </Heading>
          <Text className="text-sm text-muted">
            {data.friends.length} invited
          </Text>
        </div>
        {data.friends.length === 0 ? (
          <EmptyState
            icon={<IconUsers />}
            title="Your first study buddy starts here"
            description="Invite a friend with your code. Once they join, you can follow their progress and rewards here."
            tone="secondary"
            action={
              <Button
                variant="secondary"
                onClick={() =>
                  copyReferralText(shareMessage, "Invite message copied")
                }
              >
                <IconCopy />
                Copy invite message
              </Button>
            }
          />
        ) : (
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Signup date</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1.5">
                      Status
                      <InfoPreview
                        title="Referral statuses"
                        label="About referral statuses"
                        description="Track your invited friend's progress."
                      >
                        <dl className="space-y-3">
                          <div className="space-y-1">
                            <dt>
                              <Badge variant="secondary">Account created</Badge>
                            </dt>
                            <dd className="text-sm text-muted">
                              Your friend signed up with your code. No first
                              completed paid session has been recorded yet.
                            </dd>
                          </div>
                          <div className="space-y-1">
                            <dt>
                              <Badge variant="success">
                                First session completed
                              </Badge>
                            </dt>
                            <dd className="text-sm text-muted">
                              Their first completed paid session has been
                              recorded. Check Reward for the credited amount,
                              subject to your semester cap.
                            </dd>
                          </div>
                        </dl>
                      </InfoPreview>
                    </span>
                  </TableHead>
                  <TableHead>Reward</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.friends.map((friend) => (
                  <TableRow key={friend.id}>
                    <TableCell>{friend.name || "Friend"}</TableCell>
                    <TableCell>{formatSemesterEnd(friend.joinedAt)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={friend.completedAt ? "success" : "secondary"}
                      >
                        {friend.completedAt
                          ? "First session completed"
                          : "Account created"}
                      </Badge>
                      {friend.completedAt && (
                        <Text className="mt-1 text-muted">
                          {formatSemesterEnd(friend.completedAt)}
                        </Text>
                      )}
                    </TableCell>
                    <TableCell>
                      {friend.completedAt ? (
                        <CogitoMarks value={friend.creditedMarks ?? 0} />
                      ) : (
                        "Pending"
                      )}
                      {friend.completedAt && friend.creditedMarks === 0 && (
                        <Text className="mt-1 text-sm text-muted">
                          No Marks credited
                        </Text>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Text className="text-sm text-muted">
          Rewards are earned after your friend's first completed paid session,
          within your semester cap.
        </Text>
      </section>
    </Stack>
  );
}
