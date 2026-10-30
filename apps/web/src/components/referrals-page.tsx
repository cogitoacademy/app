"use client";

import { IconCopy } from "@tabler/icons-react";
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
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { useQuery } from "@tanstack/react-query";

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
    return <Text>Loading referral details…</Text>;
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

      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle level={2}>Your friend code</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <div className="flex min-w-0 items-center gap-1">
                <Text className="whitespace-nowrap font-mono text-xl font-semibold">
                  {data.code}
                </Text>
                <Button
                  variant="plain"
                  size="icon"
                  className="shrink-0"
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
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle level={2}>This semester</CardTitle>
            </CardHeader>
            <CardBody className="grid gap-6 sm:grid-cols-3 lg:grid-cols-1">
              <div>
                <Text className="text-muted">Earned</Text>
                <Text className="mt-1 text-lg font-semibold">
                  <CogitoMarks value={data.semester.earnedMarks} />
                </Text>
              </div>
              <div>
                <Text className="text-muted">Remaining cap</Text>
                <Text className="mt-1 text-lg font-semibold">
                  <CogitoMarks value={data.semester.remainingMarks} />
                </Text>
              </div>
              <div>
                <Text className="text-muted">Semester ends</Text>
                <Text className="mt-1 text-lg font-semibold">
                  {formatSemesterEnd(data.semester.endsAt)}
                </Text>
              </div>
            </CardBody>
          </Card>
        </div>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle level={2}>Invited friends</CardTitle>
          </CardHeader>
          <CardBody>
            {data.friends.length === 0 ? (
              <Text className="text-muted">
                No invited friends yet. Share your code to invite someone.
              </Text>
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
                                  <Badge variant="secondary">
                                    Account created
                                  </Badge>
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
                                  recorded. Check Reward for the credited
                                  amount, subject to your semester cap.
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
                        <TableCell>
                          {formatSemesterEnd(friend.joinedAt)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              friend.completedAt ? "success" : "secondary"
                            }
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
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardBody>
          <CardBody>
            <Text className="text-muted">
              Rewards are earned after your friend's first completed paid
              session, within your semester cap.
            </Text>
          </CardBody>
        </Card>
      </div>
    </Stack>
  );
}
