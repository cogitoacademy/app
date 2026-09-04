"use client";

import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text } from "@cogito-app/ui/components/selia/text";

export type DashboardWelcomeCardProps = {
  name: string;
  viewerRole: "student" | "tutor";
  hasUpcomingLesson?: boolean;
  reviewCount?: number;
};

export function DashboardWelcomeCard({
  name,
  viewerRole,
  hasUpcomingLesson = false,
}: DashboardWelcomeCardProps) {
  const isStudent = viewerRole === "student";
  const firstName =
    name.trim().split(/\s+/)[0] || (isStudent ? "Student" : "Tutor");
  return (
    <Card className="relative min-h-40 overflow-hidden bg-primary/10">
      <LearningOrbitIllustration />
      <CardBody className="relative z-1 flex h-full flex-col items-start justify-between gap-8 p-6">
        <div>
          <Heading className="max-w-sm text-3xl">
            {isStudent ? (
              <>
                Hi, {firstName}! <span aria-hidden="true">👋</span>
              </>
            ) : (
              <>Welcome back, {firstName}</>
            )}
          </Heading>
          <Text className="mt-2 max-w-sm text-muted">
            {isStudent
              ? hasUpcomingLesson
                ? "Your next learning session is on the calendar. Keep the momentum going."
                : "Ready to turn your next learning goal into a session?"
              : "Start with student requests, then keep your next session and teaching availability on track."}
          </Text>
        </div>
      </CardBody>
    </Card>
  );
}

function LearningOrbitIllustration() {
  return (
    <svg
      viewBox="0 0 320 240"
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-12 -right-8 h-64 w-80 text-primary opacity-80"
    >
      <path
        d="M75 160c34-58 105-92 177-66"
        className="fill-none stroke-current opacity-25"
        strokeWidth="2"
        strokeDasharray="7 8"
      />
      <path
        d="M93 192c41-34 94-50 151-36"
        className="fill-none stroke-current opacity-20"
        strokeWidth="2"
      />
      <circle cx="250" cy="94" r="38" className="fill-current opacity-10" />
      <circle cx="250" cy="94" r="11" className="fill-current opacity-70" />
      <circle cx="86" cy="162" r="9" className="fill-current opacity-50" />
      <circle cx="220" cy="164" r="7" className="fill-current opacity-40" />
      <g className="fill-background stroke-current" strokeWidth="2">
        <path d="M128 100l35-15 35 15-35 15-35-15Z" />
        <path d="M139 108v19c16 10 33 10 49 0v-19" />
        <path d="M198 101v22" />
      </g>
      <path
        d="M145 170h64v14h-64zM152 157h64v13h-64z"
        className="fill-background stroke-current"
        strokeWidth="2"
      />
    </svg>
  );
}
