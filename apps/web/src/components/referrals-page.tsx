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
    <Stack
      direction="column"
      spacing="lg"
      className="w-full min-w-0 max-w-full"
    >
      <div>
        <Heading level={1} size="md">
          My referrals
        </Heading>
      </div>
      <section
        aria-label="Referral code"
        className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6"
      >
        <div className="space-y-1">
          <Text className="text-muted">Your referral code</Text>
          <div className="flex items-center gap-2">
            <Text className="font-mono text-3xl font-semibold tracking-wider">
              {data.code}
            </Text>
            <Button
              variant="plain"
              size="icon"
              aria-label="Copy referral code"
              title="Copy referral code"
              onClick={() =>
                copyReferralText(data.code, "Referral code copied")
              }
            >
              <IconCopy />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              copyReferralText(shareMessage, "Invite message copied")
            }
          >
            <IconCopy />
            Copy message
          </Button>
        </div>
      </section>
      <section aria-labelledby="referral-flow" className="space-y-4">
        <Heading id="referral-flow" level={2} size="sm">
          How referrals work
        </Heading>
        <ol className="grid gap-5 sm:grid-cols-3 sm:gap-0">
          {[
            [
              "Share your code",
              "Send your referral code or invite message to a friend.",
            ],
            [
              "Your friend joins",
              `They enter your code at signup and receive ${data.settings.welcomeMarks} welcome Marks.`,
            ],
            [
              "Earn your reward",
              `After their first completed paid session, you receive up to ${data.settings.friendRewardMarks} Marks, within your semester cap.`,
            ],
          ].map(([title, description], index) => (
            <li key={title} className="relative space-y-2 sm:pr-5">
              <div className="relative flex items-center pb-2">
                <span
                  className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground"
                  aria-label={`Step ${index + 1}`}
                >
                  {index + 1}
                </span>
                {index < 2 && (
                  <span
                    aria-hidden="true"
                    className="absolute left-8 hidden h-0.5 w-full bg-primary sm:block"
                  />
                )}
              </div>
              <Text className="font-semibold">{title}</Text>
              <Text className="text-muted">{description}</Text>
            </li>
          ))}
        </ol>
      </section>
      <section
        aria-label="Semester rewards"
        className="grid gap-5 border-b border-border pb-6 sm:grid-cols-3"
      >
        <div className="space-y-3 sm:col-span-3">
          <Heading level={2} size="sm">
            Semester progress
          </Heading>
          <progress
            className="h-3 w-full overflow-hidden rounded-full bg-accent accent-primary [&::-webkit-progress-bar]:bg-accent [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
            aria-label="Semester reward allowance used"
            value={Math.min(data.semester.earnedMarks, data.semester.capMarks)}
            max={data.semester.capMarks || 1}
          />
          <Text className="text-muted">
            {data.semester.earnedMarks} / {data.semester.capMarks} Marks earned
            ·{" "}
            {data.semester.capMarks === 0
              ? "Rewards unavailable this semester"
              : data.semester.remainingMarks === 0
                ? "Semester cap reached"
                : `${data.semester.remainingMarks} Marks available`}
          </Text>
        </div>
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
        className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-4"
        aria-labelledby="invited-friends-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Heading id="invited-friends-heading" level={2} size="sm">
            Referrals
          </Heading>
          <Text className="text-sm text-muted">
            {data.friends.length} invited
          </Text>
        </div>
        {data.friends.length === 0 ? (
          <EmptyState
            icon={<IconUsers />}
            title="No referrals yet"
            description="Friends who sign up with your code will appear here."
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
          <TableContainer
            className="max-w-full"
            tabIndex={0}
            role="region"
            aria-label="Referrals table"
          >
            <Table className="min-w-200 [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
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
                  <TableHead>Completed date</TableHead>
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
                    </TableCell>
                    <TableCell>
                      {friend.completedAt
                        ? formatSemesterEnd(friend.completedAt)
                        : "—"}
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
      </section>
    </Stack>
  );
}
