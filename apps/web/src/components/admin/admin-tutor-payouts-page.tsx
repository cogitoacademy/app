"use client";

import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@cogito-app/ui/components/selia/avatar";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardHeaderAction,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerFooter,
  DrawerHeader,
  DrawerPopup,
  DrawerTitle,
} from "@cogito-app/ui/components/selia/drawer";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@cogito-app/ui/components/selia/table";
import {
  IconCoins,
  IconInbox,
  IconRefresh,
  IconWallet,
  IconX,
} from "@tabler/icons-react";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { EmptyState } from "@/components/empty-state";
import { TablePagination } from "@/components/table-pagination";
import { getUserFacingError } from "@/lib/error-message";
import { resolveProfileImageUrl } from "@/lib/profile-image-url";
import { client, orpc } from "@/utils/orpc";

const PAYOUT_PAGE_SIZE = 10;
const NON_BCA_TRANSFER_FEE_IDR = 2_500;

type TutorProfile = Awaited<
  ReturnType<typeof client.adminTutor.listTutorProfiles>
>[number];

function getInitials(name?: string | null) {
  return (name ?? "Tutor")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatIdr(value: number) {
  return "Rp" + value.toLocaleString("id-ID");
}

function hasCompletePayoutDetails(profile: TutorProfile) {
  return Boolean(
    profile.bankName?.trim() &&
    profile.bankAccountNumber?.trim() &&
    profile.bankAccountHolderName?.trim() &&
    profile.bankAccountOpeningCity?.trim() &&
    profile.bankAccountOwnership &&
    profile.bankTransferDisclaimerAccepted,
  );
}

function getTransferFee(profile: TutorProfile, grossHonorarium: number) {
  const bankName = profile.bankName?.trim();
  const usesBca = bankName?.toUpperCase() === "BCA";

  return grossHonorarium > 0 && bankName && !usesBca
    ? NON_BCA_TRANSFER_FEE_IDR
    : 0;
}

function PayoutDetail({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <Text className="text-xs uppercase tracking-wide text-dimmed">
        {label}
      </Text>
      <Text
        className={
          valueClassName
            ? "mt-1 break-words font-medium " + valueClassName
            : "mt-1 break-words font-medium"
        }
      >
        {value}
      </Text>
    </div>
  );
}

export function AdminTutorPayoutsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [selectedProfile, setSelectedProfile] = useState<TutorProfile | null>(
    null,
  );
  const [confirmPaymentOpen, setConfirmPaymentOpen] = useState(false);

  const profilesQuery = useQuery({
    queryKey: ["adminTutorPayoutProfiles", page],
    queryFn: () =>
      client.adminTutor.listTutorProfiles({
        limit: PAYOUT_PAGE_SIZE + 1,
        offset: page * PAYOUT_PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });
  const profiles = profilesQuery.data ?? [];
  const visibleProfiles = profiles.slice(0, PAYOUT_PAGE_SIZE);
  const payoutQueries = useQueries({
    queries: visibleProfiles.map((profile) => ({
      ...orpc.admin.getPendingTutorPayouts.queryOptions({
        input: { tutorId: profile.user?.id ?? "" },
      }),
      enabled: Boolean(profile.user?.id),
    })),
  });

  const selectedPayoutQuery = useQuery({
    ...orpc.admin.getPendingTutorPayouts.queryOptions({
      input: { tutorId: selectedProfile?.user?.id ?? "" },
    }),
    enabled: Boolean(selectedProfile?.user?.id),
  });

  const markPayoutMutation = useMutation(
    orpc.admin.markTutorPayoutPaid.mutationOptions({
      onSuccess: () => {
        setConfirmPaymentOpen(false);
        setSelectedProfile(null);
        void queryClient.invalidateQueries({
          queryKey: orpc.admin.getPendingTutorPayouts.key(),
        });
        toastManager.add({
          title: "Tutor payout marked as paid",
          description: "The unpaid balance now starts after this transfer.",
          type: "success",
        });
      },
      onError: (error: unknown) => {
        toastManager.add({
          title: "Tutor payout could not be marked paid",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );

  const selectedGrossHonorarium = selectedPayoutQuery.data?.tutorPayoutIdr ?? 0;
  const selectedTransferFee = selectedProfile
    ? getTransferFee(selectedProfile, selectedGrossHonorarium)
    : 0;
  const selectedNetHonorarium = Math.max(
    0,
    selectedGrossHonorarium - selectedTransferFee,
  );
  const canMarkSelectedPayout = Boolean(
    selectedProfile?.user?.id &&
    !selectedPayoutQuery.isPending &&
    !selectedPayoutQuery.isError &&
    selectedPayoutQuery.data &&
    selectedGrossHonorarium > 0 &&
    selectedProfile &&
    hasCompletePayoutDetails(selectedProfile),
  );

  function refreshPayouts() {
    void profilesQuery.refetch();
    void queryClient.invalidateQueries({
      queryKey: orpc.admin.getPendingTutorPayouts.key(),
    });
  }

  function closePayoutDetails() {
    if (confirmPaymentOpen || markPayoutMutation.isPending) return;
    setSelectedProfile(null);
  }

  function markSelectedPayoutPaid() {
    const tutorId = selectedProfile?.user?.id;
    if (!tutorId || !canMarkSelectedPayout) return;
    markPayoutMutation.mutate({ tutorId });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Heading level={1} size="md">
            Tutor payouts
          </Heading>
          <Text className="mt-1 max-w-2xl text-muted">
            Review unpaid honorarium, verify destination accounts, and record
            completed transfers.
          </Text>
        </div>
        <Button
          size="sm"
          variant="secondary"
          progress={profilesQuery.isFetching}
          onClick={refreshPayouts}
        >
          <IconRefresh />
          Refresh
        </Button>
      </div>

      <Card>
        <CardBody className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-secondary-subtle p-2 text-secondary-foreground">
            <IconWallet className="size-4" />
          </div>
          <div>
            <Text className="font-medium">Operational payout workspace</Text>
            <Text className="mt-1 text-sm text-muted">
              Unpaid honorarium covers completed sessions since each
              tutor&apos;s last recorded payment. It does not reset
              automatically on a calendar week.
            </Text>
          </div>
        </CardBody>
      </Card>

      <Card id="admin-tutor-payouts" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Unpaid tutor honorarium</CardTitle>
          <CardHeaderAction>
            <Text className="text-sm text-muted">
              {PAYOUT_PAGE_SIZE} tutors per page
            </Text>
          </CardHeaderAction>
        </CardHeader>
        <CardBody aria-busy={profilesQuery.isFetching}>
          {profiles.length === 0 ? (
            <EmptyState
              icon={<IconInbox />}
              title={
                page === 0
                  ? "No tutor profiles found"
                  : "No tutor profiles on this page"
              }
              description={
                page === 0
                  ? "Tutor payout records will appear here once tutor profiles are available."
                  : "Go back to the previous page to continue browsing tutor payouts."
              }
              tone="secondary"
              className="rounded-lg"
            />
          ) : (
            <TableContainer className="w-[calc(100%+3rem)]!">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tutor</TableHead>
                    <TableHead>Unpaid amount</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>Payout account</TableHead>
                    <TableHead className="w-32 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleProfiles.map((profile, index) => {
                    const payoutQuery = payoutQueries[index];
                    const pendingHonorarium =
                      payoutQuery?.data?.tutorPayoutIdr ?? 0;
                    const hasAccountDetails = hasCompletePayoutDetails(profile);

                    return (
                      <TableRow key={profile.id}>
                        <TableCell>
                          <Text className="font-medium">
                            {profile.user?.name ?? "Tutor"}
                          </Text>
                          <Text className="text-sm text-muted">
                            {profile.user?.email ?? "No email"}
                          </Text>
                        </TableCell>
                        <TableCell>
                          {!profile.user?.id || payoutQuery?.isError ? (
                            <Text className="text-sm text-muted">
                              Not available
                            </Text>
                          ) : payoutQuery?.isPending ? (
                            <Text className="text-sm text-muted">
                              Checking…
                            </Text>
                          ) : pendingHonorarium > 0 ? (
                            <div>
                              <Badge variant="warning">Unpaid</Badge>
                              <Text className="mt-1 font-medium">
                                {formatIdr(pendingHonorarium)}
                              </Text>
                            </div>
                          ) : (
                            <Badge variant="success">Up to date</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {!profile.user?.id ||
                          payoutQuery?.isError ||
                          payoutQuery?.isPending ? (
                            <Text className="text-sm text-muted">—</Text>
                          ) : (
                            <Text className="text-sm text-muted">
                              {payoutQuery.data?.completedSessions ?? 0}{" "}
                              completed
                            </Text>
                          )}
                        </TableCell>
                        <TableCell>
                          {profile.bankName?.trim() &&
                          profile.bankAccountNumber?.trim() ? (
                            <div>
                              <Text className="font-medium">
                                {profile.bankName}
                              </Text>
                              <Text className="text-sm text-muted">
                                Ending in {profile.bankAccountNumber.slice(-4)}
                              </Text>
                              {!hasAccountDetails ? (
                                <Badge className="mt-1" variant="warning">
                                  Details incomplete
                                </Badge>
                              ) : null}
                            </div>
                          ) : (
                            <Badge variant="warning">Details incomplete</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!profile.user?.id}
                            aria-label={
                              "Open payout details for " +
                              (profile.user?.name ?? "tutor")
                            }
                            onClick={() => setSelectedProfile(profile)}
                          >
                            Open
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {profiles.length > 0 || page > 0 ? (
            <TablePagination
              targetId="admin-tutor-payouts"
              label="tutor payouts"
              pageSize={PAYOUT_PAGE_SIZE}
              page={page}
              itemCount={visibleProfiles.length}
              hasNext={profiles.length > PAYOUT_PAGE_SIZE}
              isFetching={profilesQuery.isFetching}
              onPrevious={() => setPage((current) => Math.max(0, current - 1))}
              onNext={() => setPage((current) => current + 1)}
            />
          ) : null}
        </CardBody>
      </Card>

      <Drawer
        open={selectedProfile !== null}
        onOpenChange={(open) => {
          if (!open) closePayoutDetails();
        }}
      >
        <DrawerPopup direction="right" className="w-full max-w-2xl">
          <DrawerHeader className="justify-between border-b border-drawer-border pb-4.5">
            <div className="min-w-0">
              <DrawerTitle className="truncate">
                {selectedProfile?.user?.name ?? "Tutor payout"}
              </DrawerTitle>
              <Text className="mt-1 text-sm text-muted">
                Verify the account, transfer the net amount, then record the
                payment.
              </Text>
            </div>
            <DrawerClose
              render={
                <Button
                  variant="plain"
                  size="sm"
                  aria-label="Close payout details"
                />
              }
            >
              <IconX />
            </DrawerClose>
          </DrawerHeader>
          <DrawerBody className="min-h-0 p-0!">
            {selectedProfile ? (
              <div className="space-y-4 p-6">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage
                      src={resolveProfileImageUrl(
                        selectedProfile.user?.image ?? null,
                      )}
                      alt="Tutor profile"
                    />
                    <AvatarFallback>
                      {getInitials(selectedProfile.user?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <Text className="truncate font-medium">
                      {selectedProfile.user?.name ?? "Tutor"}
                    </Text>
                    <Text className="truncate text-sm text-muted">
                      {selectedProfile.user?.email ?? "No email"}
                    </Text>
                  </div>
                </div>

                {selectedPayoutQuery.isPending ? (
                  <Text className="text-sm text-muted">
                    Loading payout details…
                  </Text>
                ) : selectedPayoutQuery.isError ? (
                  <Text className="text-sm text-danger">
                    Payout details could not be loaded. Refresh and try again.
                  </Text>
                ) : selectedPayoutQuery.data ? (
                  <>
                    <section className="rounded-lg border border-item-border bg-item p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <IconCoins className="size-4 text-muted" />
                          <Text className="text-xs font-semibold uppercase tracking-wide text-dimmed">
                            Payment summary
                          </Text>
                        </div>
                        {selectedGrossHonorarium > 0 ? (
                          <Badge variant="warning">Unpaid</Badge>
                        ) : (
                          <Badge variant="success">Up to date</Badge>
                        )}
                      </div>
                      <Text className="mt-2 text-sm text-muted">
                        {selectedPayoutQuery.data.completedSessions} completed
                        session(s)
                        {selectedPayoutQuery.data.lastPaidAt
                          ? " since " +
                            new Date(
                              selectedPayoutQuery.data.lastPaidAt,
                            ).toLocaleString()
                          : " with no previous recorded payment"}
                      </Text>
                      <div className="mt-4 grid gap-2 text-sm">
                        <div className="flex items-center justify-between gap-6">
                          <Text className="text-muted">Gross honorarium</Text>
                          <Text className="font-semibold">
                            {formatIdr(selectedGrossHonorarium)}
                          </Text>
                        </div>
                        <div className="flex items-center justify-between gap-6">
                          <Text className="text-muted">Transfer fee</Text>
                          <Text className="font-medium">
                            {selectedTransferFee > 0
                              ? "−" + formatIdr(selectedTransferFee)
                              : formatIdr(0)}
                          </Text>
                        </div>
                        <div className="flex items-center justify-between gap-6 border-t border-item-border pt-2">
                          <Text className="font-medium">Net to transfer</Text>
                          <Text className="font-semibold">
                            {formatIdr(selectedNetHonorarium)}
                          </Text>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-lg border border-item-border p-4">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-dimmed">
                        Destination account
                      </Text>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <PayoutDetail
                          label="Bank"
                          value={
                            selectedProfile.bankName?.trim() || "Not provided"
                          }
                        />
                        <PayoutDetail
                          label="Account number"
                          value={
                            selectedProfile.bankAccountNumber?.trim() ||
                            "Not provided"
                          }
                          valueClassName="font-mono"
                        />
                        <PayoutDetail
                          label="Account holder"
                          value={
                            selectedProfile.bankAccountHolderName?.trim() ||
                            "Not provided"
                          }
                        />
                        <PayoutDetail
                          label="Opened in"
                          value={
                            selectedProfile.bankAccountOpeningCity?.trim() ||
                            "Not provided"
                          }
                        />
                        <PayoutDetail
                          label="Ownership"
                          value={
                            selectedProfile.bankAccountOwnership === "self"
                              ? "Tutor's own account"
                              : selectedProfile.bankAccountOwnership ===
                                  "trusted_person"
                                ? "Trusted person's account"
                                : "Not provided"
                          }
                        />
                      </div>
                      <Text className="mt-4 text-sm text-muted">
                        Only conventional BCA (the exact bank name BCA) has no
                        transfer deduction. BCA Syariah, blu (BCA Digital), and
                        other banks deduct Rp2.500 once per payout.
                      </Text>
                      <Text className="mt-3 text-sm text-muted">
                        Review session feedback (discussion, strengths,
                        improvements) in booking detail as payout consideration
                        before marking paid.
                      </Text>
                      {!hasCompletePayoutDetails(selectedProfile) ? (
                        <Text className="mt-3 text-sm text-warning">
                          The tutor must complete and confirm all payout account
                          details before a transfer can be recorded.
                        </Text>
                      ) : null}
                    </section>
                  </>
                ) : null}
              </div>
            ) : null}
          </DrawerBody>
          <DrawerFooter className="flex-wrap gap-2">
            <DrawerClose
              render={
                <Button
                  variant="secondary"
                  disabled={markPayoutMutation.isPending}
                  aria-label="Close payout details"
                />
              }
            >
              Close
            </DrawerClose>
            <Button
              variant="primary"
              progress={markPayoutMutation.isPending}
              disabled={!canMarkSelectedPayout}
              onClick={() => setConfirmPaymentOpen(true)}
            >
              Mark as paid
            </Button>
          </DrawerFooter>
        </DrawerPopup>
      </Drawer>

      <ConfirmationDialog
        open={confirmPaymentOpen}
        onOpenChange={setConfirmPaymentOpen}
        title="Confirm tutor payout"
        description={
          "This records the current unpaid honorarium for " +
          (selectedProfile?.user?.name ?? "this tutor") +
          " as paid. Confirm that the net amount has already been transferred to the account shown."
        }
        confirmLabel="Mark as paid"
        pending={markPayoutMutation.isPending}
        onConfirm={markSelectedPayoutPaid}
      >
        <div className="rounded-lg border border-item-border bg-item p-3">
          <div className="flex items-center justify-between gap-4">
            <Text className="text-sm text-muted">Net to transfer</Text>
            <Text className="font-semibold">
              {formatIdr(selectedNetHonorarium)}
            </Text>
          </div>
          <Text className="mt-2 text-xs text-muted">
            This action advances the tutor&apos;s paid cutoff and cannot be
            undone from the payout workspace.
          </Text>
        </div>
      </ConfirmationDialog>
    </div>
  );
}
