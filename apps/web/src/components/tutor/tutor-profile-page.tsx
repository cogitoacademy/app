"use client";

import { useQuery } from "@tanstack/react-query";
import type { CogitoUser } from "@cogito-app/auth";
import type { ReactNode } from "react";
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
      <TutorProfileScrollContainer>
        <Loader />
      </TutorProfileScrollContainer>
    );
  }
  if (error || !profile) {
    return (
      <TutorProfileScrollContainer>
        <Card className="mx-auto w-full max-w-2xl">
          <CardBody className="flex flex-col items-center gap-2 text-center">
            <CardTitle>Tutor profile unavailable</CardTitle>
            <CardDescription>
              No tutor profile found. You may need to claim a tutor invitation
              first.
            </CardDescription>
          </CardBody>
        </Card>
      </TutorProfileScrollContainer>
    );
  }

  return (
    <TutorProfileScrollContainer>
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
    </TutorProfileScrollContainer>
  );
}

function TutorProfileScrollContainer({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
      {children}
    </div>
  );
}
