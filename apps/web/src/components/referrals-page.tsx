"use client";

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

  const shareMessage =
    `Join Cogito Academy with my code ${data.code}. ` +
    `A valid code gives you ${data.settings.welcomeMarks} welcome Marks. ` +
    `I can earn ${data.settings.friendRewardMarks} Marks after your first completed paid session, up to my semester cap.`;

  return (
    <Stack direction="column" spacing="lg">
      <div>
        <Heading level={1}>My referrals</Heading>
        <Text className="mt-2 text-muted">
          Share your friend code and track rewards earned from completed paid
          sessions.
        </Text>
      </div>

      <Card>
        <CardHeader>
          <CardTitle level={2}>Your friend code</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Text className="font-mono text-xl font-semibold">{data.code}</Text>
          <Text className="text-muted">
            Your friend gets {data.settings.welcomeMarks} welcome Marks. You can
            earn {data.settings.friendRewardMarks} Marks after their first
            completed paid session, subject to your remaining semester cap.
          </Text>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                copyReferralText(data.code, "Referral code copied")
              }
            >
              Copy code
            </Button>
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

      <Card>
        <CardHeader>
          <CardTitle level={2}>This semester</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <div>
            <Text className="text-muted">Earned</Text>
            <Text className="mt-1 text-lg font-semibold">
              <CogitoMarks amount={data.semester.earnedMarks} />
            </Text>
          </div>
          <div>
            <Text className="text-muted">Remaining cap</Text>
            <Text className="mt-1 text-lg font-semibold">
              <CogitoMarks amount={data.semester.remainingMarks} />
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
    </Stack>
  );
}
