"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { CogitoMarks } from "@/components/cogito-marks";
import { getUserFacingError } from "@/lib/error-message";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

import { ClassCancellationPanel } from "./class-cancellation-panel";

type Plan = "full" | "half" | "single" | "masterclass";

type ClassEnrollmentPanelProps = {
  classId: string;
  kind: "cohort" | "masterclass";
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
  sessions,
}: ClassEnrollmentPanelProps) {
  const queryClient = useQueryClient();
  const auth = authClient.useSession();
  const sessionUser = auth.data?.user as CogitoUser | undefined;
  const isStudent =
    sessionUser?.role === "student" && sessionUser.emailVerified;
  const [plan, setPlan] = useState<Plan>(
    kind === "cohort" ? "full" : "masterclass",
  );
  const [selectedSessionId, setSelectedSessionId] = useState("");
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
          window.location.assign(purchase.checkoutUrl);
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

  if (auth.isPending) {
    return (
      <Card aria-busy="true">
        <CardHeader>
          <CardTitle>Checking your account</CardTitle>
          <CardDescription>Loading student enrollment access.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!isStudent) {
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
            render={<Link to="/login">Sign in to enroll</Link>}
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
          <CardTitle>Your class enrollment</CardTitle>
          <CardDescription>
            Upcoming sessions, seats, and Marks are checked again by the server
            when you reserve.
          </CardDescription>
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
                  <Card key={enrollment.id}>
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle>{planLabel(enrollment.plan)}</CardTitle>
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
                      <CardDescription>
                        Snapshot total:{" "}
                        <CogitoMarks value={enrollment.totalMarks} /> ·{" "}
                        {enrollment.sessionCount} session
                        {enrollment.sessionCount === 1 ? "" : "s"}
                      </CardDescription>
                    </CardHeader>
                    <CardBody className="space-y-3">
                      <Text>
                        First installment:{" "}
                        <CogitoMarks value={enrollment.firstInstallmentMarks} />
                        {second ? (
                          <>
                            {" "}
                            · Second:{" "}
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
                        <Text className="text-sm text-muted">
                          {
                            enrollment.allocations.filter(
                              (allocation) => allocation.state !== "released",
                            ).length
                          }{" "}
                          reserved session seats · funded per-session Marks stay
                          held for later reports; unpaid half sessions remain
                          reserved until their payment deadline.
                        </Text>
                      ) : null}
                    </CardBody>
                    {enrollment.state === "checkout_pending" && first ? (
                      <CardFooter className="flex flex-wrap gap-2">
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
                      </CardFooter>
                    ) : null}
                    {enrollment.state === "active" &&
                    second?.state === "pending" ? (
                      <CardFooter className="flex flex-wrap gap-2">
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
                      </CardFooter>
                    ) : null}
                    {second?.state === "defaulted" ? (
                      <CardFooter>
                        <Text className="text-sm text-muted">
                          The deadline passed. Unpaid future session seats were
                          released; choose a new current half-plan quote to
                          rejoin future sessions.
                        </Text>
                      </CardFooter>
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
                  </Card>
                );
              })}
            </Stack>
          ) : (
            <Text className="text-sm text-muted">
              You do not have an enrollment in this class yet.
            </Text>
          )}

          {allowedPlans.length > 0 ? (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="flex flex-wrap items-end gap-4">
                {allowedPlans.length > 1 ? (
                  <Field className="min-w-56">
                    <FieldLabel htmlFor={`class-plan-${classId}`}>
                      Plan
                    </FieldLabel>
                    <Select
                      value={selectedPlan}
                      onValueChange={(value) => setPlan(String(value) as Plan)}
                      items={allowedPlans.map((item) => ({
                        value: item,
                        label: planLabel(item),
                      }))}
                    >
                      <SelectTrigger id={`class-plan-${classId}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectList>
                          {allowedPlans.map((item) => (
                            <SelectItem key={item} value={item}>
                              {planLabel(item)}
                            </SelectItem>
                          ))}
                        </SelectList>
                      </SelectPopup>
                    </Select>
                  </Field>
                ) : (
                  <Text className="font-medium">
                    Plan: {planLabel(selectedPlan)}
                  </Text>
                )}
                {selectedPlan === "single" ? (
                  <Field className="min-w-64 flex-1">
                    <FieldLabel htmlFor={`class-session-${classId}`}>
                      Upcoming session
                    </FieldLabel>
                    <Select
                      value={selectedSessionId}
                      onValueChange={(value) =>
                        setSelectedSessionId(String(value ?? ""))
                      }
                      items={openSessions
                        .filter((session) => session.seatsAvailable > 0)
                        .map((session) => ({
                          value: session.sessionId,
                          label: `Session ${session.sequenceNumber} · ${sessions.find((item) => item.id === session.sessionId)?.titleEn ?? "Session"} · ${formatDate(session.startAt)}`,
                        }))}
                    >
                      <SelectTrigger id={`class-session-${classId}`}>
                        <SelectValue placeholder="Choose a session" />
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectList>
                          {openSessions
                            .filter((session) => session.seatsAvailable > 0)
                            .map((session) => (
                              <SelectItem
                                key={session.sessionId}
                                value={session.sessionId}
                              >
                                Session {session.sequenceNumber} ·{" "}
                                {sessions.find(
                                  (item) => item.id === session.sessionId,
                                )?.titleEn ?? "Session"}{" "}
                                · {formatDate(session.startAt)}
                              </SelectItem>
                            ))}
                        </SelectList>
                      </SelectPopup>
                    </Select>
                  </Field>
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

              {quoteReady ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Current Marks summary</CardTitle>
                    <CardDescription>
                      Preview from the published class rates. The server saves
                      the exact rate snapshot when you reserve.
                    </CardDescription>
                  </CardHeader>
                  <CardBody className="space-y-2">
                    <Text>
                      First payment now:{" "}
                      <CogitoMarks value={firstInstallmentMarks} />
                    </Text>
                    {secondInstallmentMarks > 0 ? (
                      <Text>
                        Second payment:{" "}
                        <CogitoMarks value={secondInstallmentMarks} /> before
                        the first session in the second half.
                      </Text>
                    ) : null}
                    <Text className="font-semibold">
                      Total: <CogitoMarks value={quoteTotalMarks} /> across{" "}
                      {sessionCount} upcoming session
                      {sessionCount === 1 ? "" : "s"}.
                    </Text>
                    <Text className="text-sm text-muted">
                      Wallet available: <CogitoMarks value={availableMarks} />
                      {availableMarks < firstInstallmentMarks
                        ? ` · ${firstInstallmentMarks - availableMarks} Marks short. You can use a quoted top-up after reserving.`
                        : ""}
                    </Text>
                  </CardBody>
                  <CardFooter>
                    <Button
                      progress={createEnrollment.isPending}
                      disabled={createEnrollment.isPending}
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
                      Reserve and confirm Marks
                    </Button>
                  </CardFooter>
                </Card>
              ) : (
                <Text className="text-sm text-muted">
                  {openSessions.length === 0
                    ? "There are no unreserved upcoming sessions available."
                    : selectedPlan === "single" && !selectedSessionId
                      ? "Choose an upcoming session with an available seat."
                      : "No seat is available for the selected sessions."}
                </Text>
              )}
            </div>
          ) : null}

          {topUpContext ? (
            <Card>
              <CardHeader>
                <CardTitle>Top up the quoted shortfall</CardTitle>
                <CardDescription>
                  Immutable quote for {topUpContext.quote.requestedMarks} Marks
                  linked to installment {topUpContext.ordinal}.
                </CardDescription>
              </CardHeader>
              <CardBody className="space-y-3">
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
                    {topUpContext.quote.customAmountIdr.toLocaleString("id-ID")}
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
                    Recommended · {topUpContext.quote.recommendedPackage.label}{" "}
                    · Rp
                    {topUpContext.quote.recommendedPackage.priceIdr.toLocaleString(
                      "id-ID",
                    )}
                  </Button>
                ) : null}
                <Text className="text-sm text-muted">
                  A completed top-up credits your wallet. If this class checkout
                  expires first, its seat reservation is released.
                </Text>
              </CardBody>
            </Card>
          ) : null}
        </CardBody>
      </Card>
    </Stack>
  );
}
