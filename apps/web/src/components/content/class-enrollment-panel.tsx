"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import type { CogitoUser } from "@cogito-app/auth";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Drawer,
  DrawerPopup,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
} from "@cogito-app/ui/components/selia/drawer";
import { Radio, RadioGroup } from "@cogito-app/ui/components/selia/radio";
import { Separator } from "@cogito-app/ui/components/selia/separator";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { IconCoins, IconWallet } from "@tabler/icons-react";
import { Tabs, TabsList, TabsItem } from "@cogito-app/ui/components/selia/tabs";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { CogitoMarks } from "@/components/cogito-marks";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";

import { ClassCancellationPanel } from "./class-cancellation-panel";

type Plan = "full" | "half" | "single" | "masterclass";

type ClassEnrollmentPanelProps = {
  classId: string;
  kind: "cohort" | "masterclass";
  competitionName: string;
  rates: {
    cohortFullRateMarks: number | null;
    cohortHalfRateMarks: number | null;
    cohortSingleRateMarks: number | null;
    masterclassRateMarks: number | null;
  };
  sessions: {
    id: string;
    sequenceNumber: number;
    titleEn: string;
    startAt: Date | string;
    mode: string;
    tutor: { name: string } | null;
  }[];
};

function formatDate(value: Date | string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(new Date(value))
    : "No second installment";
}

function planLabel(plan: Plan) {
  return {
    full: "Full cohort",
    half: "Half cohort",
    single: "Single session",
    masterclass: "Masterclass",
  }[plan];
}

export function ClassEnrollmentPanel({
  classId,
  kind,
  rates,
  competitionName,
  sessions,
}: ClassEnrollmentPanelProps) {
  const queryClient = useQueryClient();
  const { session: auth } = useRouteContext({ from: "/_app" });
  const sessionUser = auth.data?.user as CogitoUser | undefined;
  const isStudent =
    sessionUser?.role === "student" && sessionUser.emailVerified;
  const [plan, setPlan] = useState<Plan>(
    kind === "cohort" ? "full" : "masterclass",
  );
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [changedSessionQuote, setChangedSessionQuote] = useState<{
    enrollmentId: string;
    sessionId: string;
    quote: {
      scheduleChangeVersion: number;
      exitUntil: Date | string;
      refundableMarks: number;
      fundingState: "funded" | "unfunded";
      quoteVersion: string;
    };
  } | null>(null);
  const [clientNow, setClientNow] = useState(0);
  const [topUpContext, setTopUpContext] = useState<{
    enrollmentId: string;
    ordinal: 1 | 2;
    quote: {
      attemptId: string;
      requestedMarks: number;
      customAmountIdr: number;
      exactPackage: { label: string; priceIdr: number } | null;
      recommendedPackage: { label: string; priceIdr: number } | null;
    };
  } | null>(null);

  const enrollmentsQuery = useQuery({
    ...orpc.classes.getMyEnrollments.queryOptions({ input: { classId } }),
    enabled: isStudent,
  });
  const walletQuery = useQuery({
    ...orpc.wallet.get.queryOptions(),
    enabled: isStudent,
  });
  useEffect(() => {
    if (!changedSessionQuote) return;
    const refreshClock = () => setClientNow(Date.now());
    refreshClock();
    const timer = window.setInterval(refreshClock, 1000);
    return () => window.clearInterval(timer);
  }, [changedSessionQuote]);
  useEffect(() => {
    if (!isStudent) return;
    const refresh = () => {
      void queryClient.invalidateQueries({
        queryKey: orpc.wallet.get.queryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: orpc.classes.getMyEnrollments.key(),
      });
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [isStudent, queryClient]);
  const enrollmentsData = enrollmentsQuery.data;
  const eligible = enrollmentsData?.eligibleSessions ?? [];
  const openSessions = eligible.filter((session) => !session.alreadyEntitled);
  const availableMarks = walletQuery.data?.availableBalance ?? 0;
  const studentEnrollments = enrollmentsData?.enrollments ?? [];

  const activePlanEnrollments = studentEnrollments.filter(
    (enrollment) => enrollment.state === "active",
  );
  const defaultedHalf = activePlanEnrollments.some(
    (enrollment) =>
      enrollment.plan === "half" &&
      enrollment.installments.some(
        (installment) =>
          installment.ordinal === 2 && installment.state === "defaulted",
      ),
  );
  const activeSingles = activePlanEnrollments.some(
    (enrollment) => enrollment.plan === "single",
  );
  const activeNonSingle = activePlanEnrollments.some(
    (enrollment) => enrollment.plan !== "single" && enrollment.plan !== "half",
  );
  const activeHalf = activePlanEnrollments.some(
    (enrollment) => enrollment.plan === "half",
  );
  const pendingCheckout = studentEnrollments.some(
    (enrollment) => enrollment.state === "checkout_pending",
  );

  const allowedPlans: Plan[] =
    enrollmentsData?.classState === "postponed"
      ? []
      : pendingCheckout || activeNonSingle || (activeHalf && !defaultedHalf)
        ? []
        : defaultedHalf
          ? ["half"]
          : activeSingles
            ? ["single"]
            : kind === "cohort"
              ? ["full", "half", "single"]
              : ["masterclass"];
  const selectedPlan = allowedPlans.includes(plan)
    ? plan
    : (allowedPlans[0] ?? plan);

  const selectedSessions =
    selectedPlan === "single"
      ? openSessions.filter(
          (session) => session.sessionId === selectedSessionId,
        )
      : openSessions;
  const sessionCount = selectedSessions.length;
  const seatsAvailable = selectedSessions.every(
    (session) => session.seatsAvailable > 0,
  );
  const firstInstallmentMarks =
    selectedPlan === "single"
      ? (rates.cohortSingleRateMarks ?? 0)
      : selectedPlan === "masterclass"
        ? (rates.masterclassRateMarks ?? 0)
        : selectedPlan === "full"
          ? sessionCount * (rates.cohortFullRateMarks ?? 0)
          : Math.ceil(sessionCount / 2) * (rates.cohortHalfRateMarks ?? 0);
  const secondInstallmentMarks =
    selectedPlan === "half"
      ? Math.floor(sessionCount / 2) * (rates.cohortHalfRateMarks ?? 0)
      : 0;
  const quoteTotalMarks = firstInstallmentMarks + secondInstallmentMarks;
  const quoteReady =
    selectedSessions.length > 0 && seatsAvailable && firstInstallmentMarks > 0;

  const summarySessions = sessions
    .filter((session) =>
      selectedSessions.some((selected) => selected.sessionId === session.id),
    )
    .toSorted(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
  const modes = [...new Set(summarySessions.map((session) => session.mode))];
  const sessionRate =
    selectedPlan === "single"
      ? rates.cohortSingleRateMarks
      : selectedPlan === "masterclass"
        ? rates.masterclassRateMarks
        : selectedPlan === "half"
          ? rates.cohortHalfRateMarks
          : rates.cohortFullRateMarks;
  const summaryRows = [
    ...(kind === "masterclass" || selectedPlan === "single"
      ? [
          {
            label: "Tutor",
            value: summarySessions[0]?.tutor?.name ?? "To be announced",
          },
        ]
      : []),
    { label: "Competition", value: competitionName },
    {
      label: "Sessions",
      value: sessionCount
        ? `${sessionCount} session${sessionCount === 1 ? "" : "s"}`
        : "Choose a session",
    },
    {
      label: "Format",
      value:
        modes.length > 1
          ? "Online & in person"
          : modes[0]
            ? modes[0] === "online"
              ? "Online"
              : "In person"
            : "Not specified",
    },
    {
      label: "Schedule",
      value: summarySessions.length
        ? summarySessions.length === 1
          ? `${formatDate(summarySessions[0]!.startAt)} WIB`
          : `${formatDate(summarySessions[0]!.startAt)} – ${formatDate(summarySessions[summarySessions.length - 1]!.startAt)} WIB`
        : "Choose a session",
    },
  ];

  const refreshEnrollmentState = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpc.classes.getMyEnrollments.key(),
      }),
      queryClient.invalidateQueries({ queryKey: orpc.wallet.get.queryKey() }),
    ]);

  const createEnrollment = useMutation(
    orpc.classes.createEnrollment.mutationOptions({
      onSuccess: async () => {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(requestKeyStorageKey);
        }
        setTopUpContext(null);
        await refreshEnrollmentState();
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Enrollment could not be reserved",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  const completeCheckout = useMutation(
    orpc.classes.completeCheckout.mutationOptions({
      onSuccess: async (result) => {
        setTopUpContext(null);
        await refreshEnrollmentState();
        if (result.outcome === "insufficient") {
          toastManager.add({
            title: "More Marks are needed",
            description: `Top up ${result.shortfallMarks} Marks before checkout expires.`,
            type: "warning",
          });
        }
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Checkout could not be completed",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  const paySecondInstallment = useMutation(
    orpc.classes.paySecondInstallment.mutationOptions({
      onSuccess: async (result) => {
        setTopUpContext(null);
        await refreshEnrollmentState();
        if (result.outcome === "insufficient") {
          toastManager.add({
            title: "More Marks are needed",
            description: `Top up ${result.shortfallMarks} Marks before the due session.`,
            type: "warning",
          });
        }
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Installment could not be paid",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  const createTopUpQuote = useMutation(
    orpc.classes.createTopUpQuote.mutationOptions({
      onSuccess: (quote, input) =>
        setTopUpContext({
          enrollmentId: input.enrollmentId,
          ordinal: input.ordinal,
          quote,
        }),
      onError: (error: Error) =>
        toastManager.add({
          title: "Top-up quote could not be created",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  const purchaseTopUp = useMutation(
    orpc.classes.purchaseTopUp.mutationOptions({
      onSuccess: async (purchase) => {
        if (purchase.checkoutUrl) {
          window.open(purchase.checkoutUrl, "cogito-class-payment", "noopener");
          return;
        }
        toastManager.add({
          title: "Top-up status is being confirmed",
          description:
            "The quote and payment identity are saved. Return here after payment status updates to finish the class checkout.",
          type: "warning",
        });
        await refreshEnrollmentState();
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Top-up checkout could not be started",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  const quoteChangedCancellation = useMutation(
    orpc.classes.quoteChangedSessionCancellation.mutationOptions({
      onSuccess: (quote, input) =>
        setChangedSessionQuote({
          enrollmentId: input.enrollmentId,
          sessionId: input.sessionId,
          quote,
        }),
      onError: (error: Error) =>
        toastManager.add({
          title: "Schedule-change exit is unavailable",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );
  const confirmChangedCancellation = useMutation(
    orpc.classes.confirmChangedSessionCancellation.mutationOptions({
      onSuccess: async () => {
        setChangedSessionQuote(null);
        await refreshEnrollmentState();
        toastManager.add({
          title: "Session seat released",
          description:
            "The server has released the seat and returned eligible Marks.",
          type: "success",
        });
      },
      onError: (error: Error) => {
        const selected = changedSessionQuote;
        if (selected) {
          quoteChangedCancellation.mutate({
            enrollmentId: selected.enrollmentId,
            sessionId: selected.sessionId,
            scheduleChangeVersion: selected.quote.scheduleChangeVersion,
          });
        }
        toastManager.add({
          title: "Session seat could not be released",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );

  const requestKeyStorageKey = `cogito:class-enrollment:${classId}:${selectedPlan}:${selectedSessionId || "all"}`;

  function getEnrollmentRequestKey() {
    const existing = window.localStorage.getItem(requestKeyStorageKey);
    if (existing) return existing;
    const requestKey = crypto.randomUUID();
    window.localStorage.setItem(requestKeyStorageKey, requestKey);
    return requestKey;
  }

  function startTopUp(enrollmentId: string, ordinal: 1 | 2) {
    createTopUpQuote.mutate({
      enrollmentId,
      ordinal,
      requestKey: crypto.randomUUID(),
    });
  }

  if (sessionUser && !isStudent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {sessionUser.role === "student"
              ? "Verify your email to enroll"
              : "Student account required"}
          </CardTitle>
          <CardDescription>
            {sessionUser.role === "student"
              ? "You are signed in. Verify your email before reserving a class seat."
              : "You are signed in. Class enrollment is available to student accounts."}
          </CardDescription>
        </CardHeader>
        {sessionUser.role === "student" ? (
          <CardFooter>
            <Button
              nativeButton={false}
              render={
                <Link
                  to="/verify-email"
                  aria-label="Verify email"
                  search={{
                    email: sessionUser.email,
                    redirect: `/classes/${classId}`,
                  }}
                />
              }
            >
              Verify email
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    );
  }

  if (!sessionUser) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Enroll in this class</CardTitle>
          <CardDescription>
            Sign in with a student account to check seat availability and
            enroll.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            nativeButton={false}
            render={
              <Link to="/login" search={{ redirect: `/classes/${classId}` }}>
                Sign in to enroll
              </Link>
            }
          >
            Sign in to enroll
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (enrollmentsQuery.isPending || walletQuery.isPending) {
    return (
      <Card aria-busy="true">
        <CardHeader>
          <CardTitle>Loading enrollment options</CardTitle>
          <CardDescription>
            Checking your Marks and upcoming seats.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (enrollmentsQuery.isError || walletQuery.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Enrollment status unavailable</CardTitle>
          <CardDescription>
            Refresh this page to check your Marks and current class seats.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            variant="secondary"
            onClick={() => {
              void enrollmentsQuery.refetch();
              void walletQuery.refetch();
            }}
          >
            Refresh enrollment status
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Stack direction="column" spacing="lg">
      <Card>
        <CardHeader>
          <IconBox variant="warning-subtle">
            <IconCoins aria-hidden="true" />
          </IconBox>
          <CardTitle level={2}>Booking summary</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {enrollmentsData?.classState === "postponed" ? (
            <Text className="text-sm text-warning-foreground">
              This cohort was postponed once. Your penalty-free full withdrawal
              deadline is{" "}
              {enrollmentsData.freeExitUntil
                ? formatDate(enrollmentsData.freeExitUntil)
                : "not recorded"}{" "}
              WIB. The server shows the exact fee and return before you confirm.
            </Text>
          ) : null}
          {studentEnrollments.length > 0 ? (
            <Stack direction="column" spacing="md">
              {studentEnrollments.map((enrollment) => {
                const first = enrollment.installments.find(
                  (installment) => installment.ordinal === 1,
                );
                const second = enrollment.installments.find(
                  (installment) => installment.ordinal === 2,
                );
                return (
                  <section
                    key={enrollment.id}
                    className="space-y-3 border-b border-border pb-4 last:border-b-0 last:pb-0"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Heading level={3} size="sm">
                          {planLabel(enrollment.plan)}
                        </Heading>
                        <Badge
                          variant={
                            enrollment.state === "active"
                              ? "success"
                              : enrollment.state === "checkout_pending"
                                ? "warning"
                                : "secondary"
                          }
                        >
                          {enrollment.state.replaceAll("_", " ")}
                        </Badge>
                      </div>
                      <Text className="text-sm text-muted">
                        Enrollment total:{" "}
                        <CogitoMarks value={enrollment.totalMarks} /> ·{" "}
                        {enrollment.sessionCount} session
                        {enrollment.sessionCount === 1 ? "" : "s"}
                      </Text>
                    </div>
                    <div className="space-y-3">
                      <Text>
                        First payment:{" "}
                        <CogitoMarks value={enrollment.firstInstallmentMarks} />
                        {second ? (
                          <>
                            {" "}
                            · Second payment:{" "}
                            <CogitoMarks
                              value={enrollment.secondInstallmentMarks}
                            />
                          </>
                        ) : null}
                      </Text>
                      {second ? (
                        <Text className="text-sm text-muted">
                          Second installment is due before{" "}
                          {formatDate(second.dueAt)}.
                        </Text>
                      ) : null}
                      {enrollment.state === "checkout_pending" ? (
                        <Text className="text-sm text-muted">
                          This seat reservation expires{" "}
                          {formatDate(enrollment.checkoutExpiresAt)}.
                        </Text>
                      ) : null}
                      {enrollment.allocations.length > 0 ? (
                        <div className="space-y-2">
                          <Text className="text-sm text-muted">
                            {
                              enrollment.allocations.filter(
                                (allocation) => allocation.state !== "released",
                              ).length
                            }{" "}
                            reserved session seats. Paid Marks are held until
                            each session is completed. Unpaid seats are reserved
                            until the payment deadline.
                          </Text>
                          {enrollment.allocations
                            .filter(
                              (allocation) =>
                                allocation.state !== "released" &&
                                allocation.scheduleChangeVersion != null &&
                                allocation.scheduleChangeExitUntil != null,
                            )
                            .map((allocation) => {
                              const session = sessions.find(
                                (item) => item.id === allocation.sessionId,
                              );
                              const exitOpen =
                                new Date(
                                  allocation.scheduleChangeExitUntil!,
                                ).getTime() > Date.now();
                              return (
                                <div
                                  key={allocation.sessionId}
                                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                                >
                                  <div className="min-w-0">
                                    <Text className="font-medium">
                                      Schedule changed ·{" "}
                                      {session?.titleEn ?? "Class session"}
                                    </Text>
                                    <Text className="text-sm text-muted">
                                      Penalty-free review until{" "}
                                      {formatDate(
                                        allocation.scheduleChangeExitUntil!,
                                      )}{" "}
                                      WIB
                                    </Text>
                                  </div>
                                  {exitOpen ? (
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      disabled={
                                        quoteChangedCancellation.isPending ||
                                        confirmChangedCancellation.isPending
                                      }
                                      onClick={() =>
                                        quoteChangedCancellation.mutate({
                                          enrollmentId: enrollment.id,
                                          sessionId: allocation.sessionId,
                                          scheduleChangeVersion:
                                            allocation.scheduleChangeVersion!,
                                        })
                                      }
                                    >
                                      Review seat cancellation
                                    </Button>
                                  ) : (
                                    <Text className="text-sm text-muted">
                                      Exit window closed
                                    </Text>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      ) : null}
                    </div>
                    {enrollment.state === "checkout_pending" && first ? (
                      <div className="flex flex-wrap gap-2">
                        {availableMarks >= first.amountMarks ? (
                          <Button
                            progress={completeCheckout.isPending}
                            disabled={completeCheckout.isPending}
                            onClick={() =>
                              completeCheckout.mutate({
                                enrollmentId: enrollment.id,
                              })
                            }
                          >
                            Use <CogitoMarks value={first.amountMarks} /> to
                            reserve
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="secondary"
                              progress={createTopUpQuote.isPending}
                              disabled={createTopUpQuote.isPending}
                              onClick={() => startTopUp(enrollment.id, 1)}
                            >
                              Top up {first.amountMarks - availableMarks} Marks
                            </Button>
                            <Text className="self-center text-sm text-muted">
                              {Math.max(0, first.amountMarks - availableMarks)}{" "}
                              Marks short
                            </Text>
                          </>
                        )}
                      </div>
                    ) : null}
                    {changedSessionQuote?.enrollmentId === enrollment.id ? (
                      <section
                        className="space-y-3 rounded-md border border-border p-3"
                        aria-label="Schedule-change seat cancellation quote"
                      >
                        <Heading level={4} size="sm">
                          Cancel changed session seat?
                        </Heading>
                        <Text className="text-sm text-muted">
                          {sessions.find(
                            (item) => item.id === changedSessionQuote.sessionId,
                          )?.titleEn ?? "This session"}{" "}
                          · penalty-free until{" "}
                          {formatDate(changedSessionQuote.quote.exitUntil)} WIB.
                        </Text>
                        <Text>
                          {changedSessionQuote.quote.fundingState === "funded"
                            ? "Return"
                            : "Release"}{" "}
                          <CogitoMarks
                            value={changedSessionQuote.quote.refundableMarks}
                          />{" "}
                          to your available balance.
                        </Text>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setChangedSessionQuote(null)}
                          >
                            Keep this seat
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            progress={confirmChangedCancellation.isPending}
                            disabled={
                              quoteChangedCancellation.isPending ||
                              confirmChangedCancellation.isPending ||
                              new Date(
                                changedSessionQuote.quote.exitUntil,
                              ).getTime() <= clientNow
                            }
                            onClick={() =>
                              confirmChangedCancellation.mutate({
                                enrollmentId: changedSessionQuote.enrollmentId,
                                sessionId: changedSessionQuote.sessionId,
                                scheduleChangeVersion:
                                  changedSessionQuote.quote
                                    .scheduleChangeVersion,
                                requestKey: crypto.randomUUID(),
                                quoteVersion:
                                  changedSessionQuote.quote.quoteVersion,
                              })
                            }
                          >
                            Confirm seat cancellation
                          </Button>
                        </div>
                      </section>
                    ) : null}
                    {enrollment.state === "active" &&
                    second?.state === "pending" ? (
                      <div className="flex flex-wrap gap-2">
                        {availableMarks >= second.amountMarks ? (
                          <Button
                            progress={paySecondInstallment.isPending}
                            disabled={paySecondInstallment.isPending}
                            onClick={() =>
                              paySecondInstallment.mutate({
                                enrollmentId: enrollment.id,
                              })
                            }
                          >
                            Pay second installment ·{" "}
                            <CogitoMarks value={second.amountMarks} />
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="secondary"
                              progress={createTopUpQuote.isPending}
                              disabled={createTopUpQuote.isPending}
                              onClick={() => startTopUp(enrollment.id, 2)}
                            >
                              Top up {second.amountMarks - availableMarks} Marks
                            </Button>
                            <Text className="self-center text-sm text-muted">
                              {Math.max(0, second.amountMarks - availableMarks)}{" "}
                              Marks short
                            </Text>
                          </>
                        )}
                      </div>
                    ) : null}
                    {second?.state === "defaulted" ? (
                      <div>
                        <Text className="text-sm text-muted">
                          The deadline passed. Unpaid future session seats were
                          released; choose a new current half-plan quote to
                          rejoin future sessions.
                        </Text>
                      </div>
                    ) : null}
                    {enrollment.state === "active" ? (
                      <ClassCancellationPanel
                        enrollmentId={enrollment.id}
                        allocations={enrollment.allocations}
                        sessions={sessions}
                        classState={enrollmentsData?.classState ?? "published"}
                        freeExitUntil={enrollmentsData?.freeExitUntil ?? null}
                        onChanged={refreshEnrollmentState}
                      />
                    ) : null}
                  </section>
                );
              })}
            </Stack>
          ) : null}

          {allowedPlans.length > 0 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                {allowedPlans.length > 1 ? (
                  <Tabs
                    value={selectedPlan}
                    onValueChange={(value) => {
                      if (allowedPlans.includes(value as Plan))
                        setPlan(value as Plan);
                    }}
                    className="w-full min-w-0"
                  >
                    <TabsList aria-label="Enrollment plan">
                      {allowedPlans.map((item) => (
                        <TabsItem
                          key={item}
                          value={item}
                          className="min-w-0 px-2 text-sm"
                        >
                          {item === "full"
                            ? "Full"
                            : item === "half"
                              ? "Half"
                              : "Single session"}
                        </TabsItem>
                      ))}
                    </TabsList>
                  </Tabs>
                ) : (
                  <Text className="font-medium">
                    Plan: {planLabel(selectedPlan)}
                  </Text>
                )}
                {selectedPlan === "single" ? (
                  <RadioGroup
                    aria-label="Upcoming session"
                    value={selectedSessionId}
                    onValueChange={(value) =>
                      setSelectedSessionId(String(value))
                    }
                    className="w-full min-w-0"
                  >
                    {openSessions
                      .filter((session) => session.seatsAvailable > 0)
                      .map((session) => (
                        <label
                          key={session.sessionId}
                          htmlFor={`class-${classId}-session-${session.sessionId}`}
                          className="flex min-w-0 cursor-pointer items-start gap-3 rounded border border-border p-3 has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5"
                        >
                          <Radio
                            id={`class-${classId}-session-${session.sessionId}`}
                            value={session.sessionId}
                            className="mt-1"
                          />
                          <span className="flex min-w-0 flex-col gap-1 wrap-anywhere">
                            <span className="font-medium">
                              Session {session.sequenceNumber} ·{" "}
                              {sessions.find(
                                (item) => item.id === session.sessionId,
                              )?.titleEn ?? "Session"}
                            </span>
                            <span className="text-sm text-muted">
                              {formatDate(session.startAt)} WIB
                            </span>
                          </span>
                        </label>
                      ))}
                  </RadioGroup>
                ) : null}
              </div>

              {selectedPlan !== "single" &&
              selectedSessions.some(
                (session) => session.seatsAvailable === 0,
              ) ? (
                <Text className="text-sm text-warning-foreground">
                  At least one remaining session has no seat for this plan.
                  Choose a single open session instead.
                </Text>
              ) : null}

              <dl className="space-y-4 border-t border-border pt-4">
                {summaryRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-start justify-between gap-4"
                  >
                    <dt className="shrink-0 text-sm text-muted">{row.label}</dt>
                    <dd className="min-w-0 text-right font-medium wrap-anywhere">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <Separator />
              <dl className="space-y-4">
                {[
                  {
                    label: "Session price",
                    value:
                      sessionRate && sessionRate > 0 ? (
                        <CogitoMarks value={sessionRate} />
                      ) : (
                        "Unavailable"
                      ),
                  },
                  {
                    label: "Reserve now",
                    value: quoteReady ? (
                      <CogitoMarks value={firstInstallmentMarks} />
                    ) : (
                      "Pricing unavailable"
                    ),
                  },
                  ...(secondInstallmentMarks > 0
                    ? [
                        {
                          label: "Second payment",
                          value: <CogitoMarks value={secondInstallmentMarks} />,
                        },
                      ]
                    : []),
                  {
                    label: "Total",
                    value: quoteReady ? (
                      <CogitoMarks value={quoteTotalMarks} />
                    ) : (
                      "Pricing unavailable"
                    ),
                  },
                  {
                    label: "Available balance",
                    value: (
                      <span className="inline-flex items-center gap-1.5">
                        <IconWallet
                          className="size-4 text-muted"
                          aria-hidden="true"
                        />
                        <CogitoMarks value={availableMarks} />
                      </span>
                    ),
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-start justify-between gap-4"
                  >
                    <dt className="shrink-0 text-sm text-muted">{row.label}</dt>
                    <dd className="min-w-0 text-right font-medium">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {secondInstallmentMarks > 0 ? (
                <Text className="text-sm text-muted">
                  Second payment is due before the first session in the second
                  half.
                </Text>
              ) : null}
              <Text className="text-sm text-muted">
                Marks are reserved when you enroll and charged as sessions are
                completed. Cancellation rules apply.
              </Text>
              {quoteReady && availableMarks < firstInstallmentMarks ? (
                <Text className="text-sm text-muted">
                  {firstInstallmentMarks - availableMarks} Marks short. You can
                  use a quoted top-up after reserving.
                </Text>
              ) : null}
              {!quoteReady ? (
                <Text role="status" className="text-sm text-muted">
                  {openSessions.length === 0
                    ? "There are no unreserved upcoming sessions available."
                    : selectedPlan === "single" && !selectedSessionId
                      ? "Choose an upcoming session with an available seat."
                      : "No seat is available for the selected sessions."}
                </Text>
              ) : null}
            </div>
          ) : null}

          {topUpContext ? (
            <Drawer
              open
              onOpenChange={(open) => {
                if (!open) setTopUpContext(null);
              }}
            >
              <DrawerPopup>
                <DrawerHeader>
                  <DrawerTitle>
                    Top up {topUpContext.quote.requestedMarks} Marks?
                  </DrawerTitle>
                  <DrawerDescription>
                    Complete payment in the payment tab, then return here to
                    continue your class checkout.
                  </DrawerDescription>
                </DrawerHeader>
                <DrawerBody className="space-y-3">
                  {topUpContext.quote.exactPackage ? (
                    <Button
                      variant="secondary"
                      progress={purchaseTopUp.isPending}
                      disabled={purchaseTopUp.isPending}
                      onClick={() =>
                        purchaseTopUp.mutate({
                          attemptId: topUpContext.quote.attemptId,
                          choice: "package",
                        })
                      }
                    >
                      {topUpContext.quote.exactPackage.label} · Rp
                      {topUpContext.quote.exactPackage.priceIdr.toLocaleString(
                        "id-ID",
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      progress={purchaseTopUp.isPending}
                      disabled={purchaseTopUp.isPending}
                      onClick={() =>
                        purchaseTopUp.mutate({
                          attemptId: topUpContext.quote.attemptId,
                          choice: "custom",
                        })
                      }
                    >
                      Buy exact Marks · Rp
                      {topUpContext.quote.customAmountIdr.toLocaleString(
                        "id-ID",
                      )}
                    </Button>
                  )}
                  {topUpContext.quote.recommendedPackage ? (
                    <Button
                      variant="plain"
                      progress={purchaseTopUp.isPending}
                      disabled={purchaseTopUp.isPending}
                      onClick={() =>
                        purchaseTopUp.mutate({
                          attemptId: topUpContext.quote.attemptId,
                          choice: "recommended",
                        })
                      }
                    >
                      Recommended ·{" "}
                      {topUpContext.quote.recommendedPackage.label} · Rp
                      {topUpContext.quote.recommendedPackage.priceIdr.toLocaleString(
                        "id-ID",
                      )}
                    </Button>
                  ) : null}
                  <Text className="text-sm text-muted">
                    A completed top-up credits your wallet. If this class
                    checkout expires first, its seat reservation is released.
                  </Text>
                </DrawerBody>
                <DrawerFooter>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void refreshEnrollmentState();
                    }}
                  >
                    Check balance
                  </Button>
                  <Button
                    onClick={async () => {
                      await refreshEnrollmentState();
                      setTopUpContext(null);
                    }}
                  >
                    Continue class checkout
                  </Button>
                </DrawerFooter>
              </DrawerPopup>
            </Drawer>
          ) : null}
        </CardBody>
        {allowedPlans.length > 0 ? (
          <CardFooter>
            <Button
              className="w-full"
              progress={createEnrollment.isPending}
              disabled={!quoteReady || createEnrollment.isPending}
              onClick={() =>
                createEnrollment.mutate({
                  classId,
                  requestKey: getEnrollmentRequestKey(),
                  plan: selectedPlan,
                  ...(selectedPlan === "single"
                    ? { sessionId: selectedSessionId }
                    : {}),
                })
              }
            >
              {quoteReady
                ? "Reserve and confirm Marks"
                : selectedPlan === "single" && !selectedSessionId
                  ? "Choose a session"
                  : "Enrollment unavailable"}
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </Stack>
  );
}
