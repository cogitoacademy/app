"use client";

import { useQuery } from "@tanstack/react-query";
import type { CogitoUser } from "@cogito-app/auth";
import {
  Card,
  CardBody,
  CardDescription,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";

import Loader from "@/components/loader";
import { orpc } from "@/utils/orpc";

import { OnboardingForm } from "./onboarding-form";

export function TutorProfilePage({
  accountUser,
}: {
  accountUser: Pick<CogitoUser, "name" | "email" | "image">;
}) {
  const {
    data: profile,
    isLoading,
    error,
  } = useQuery(orpc.tutor.getMyProfile.queryOptions());

  if (isLoading) {
    return (
      <div className="w-full shrink-0">
        <Loader />
      </div>
    );
  }
  if (error || !profile) {
    return (
      <div className="w-full shrink-0">
        <Card className="mx-auto w-full max-w-2xl">
          <CardBody className="flex flex-col items-center gap-2 text-center">
            <CardTitle>Tutor profile unavailable</CardTitle>
            <CardDescription>
              No tutor profile found. You may need to claim a tutor invitation
              first.
            </CardDescription>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full shrink-0">
      <OnboardingForm
        accountUser={accountUser}
        profile={{
          ...profile,
          expertise: profile.expertise ?? [],
          bankAccountOwnership:
            profile.bankAccountOwnership === "self" ||
            profile.bankAccountOwnership === "trusted_person"
              ? profile.bankAccountOwnership
              : null,
        }}
      />
    </div>
  );
}
