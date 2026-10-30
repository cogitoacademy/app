"use client";

import Loader from "@/components/loader";


import {
  IconSearch,
  IconUsers,
  IconChevronRight,
  IconX,
} from "@tabler/icons-react";
import { EmptyState } from "@/components/empty-state";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@cogito-app/ui/components/selia/table";
import { Text } from "@cogito-app/ui/components/selia/text";
import { FilterTabBar } from "@/components/filter-tab-bar";
import {
  Drawer,
  DrawerPopup,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerClose,
} from "@cogito-app/ui/components/selia/drawer";
import { orpc } from "@/utils/orpc";
import { KolCampaignsSection } from "./kol-campaigns-section";
import { referralUsageStatus } from "./referral-usage-status";

function date(value: string | Date | null) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(new Date(value)) + " WIB"
    : "—";
}

export function AdminReferralsPage() {
  const [view, setView] = useState<"activity" | "campaigns">("activity");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | "friend" | "kol" | "none">("all");
  const [page, setPage] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery(
    orpc.adminReferral.listUsage.queryOptions({
      input: { search, kind, page, limit: 25 },
    }),
  );
  const data = query.data;
  const selected = data?.items.find((row) => row.id === selectedId);
  return (
    <Stack direction="column" spacing="lg" className="min-w-0 flex-nowrap">
      <div>
        <Heading level={1} size="md">
          Referrals
        </Heading>
        <Text className="max-w-full text-muted">
          Track each referral from signup to its outcome: welcome credit after a
          first paid completion, or commission for KOL referrals.
        </Text>
      </div>
      <FilterTabBar
        label="Referral sections"
        tabs={[
          { value: "activity", label: "Activity" },
          { value: "campaigns", label: "KOL campaigns" },
        ]}
        activeTab={view}
        onChange={setView}
      />
      <div hidden={view !== "campaigns"} className="min-w-0">
        <KolCampaignsSection />
      </div>
      <div hidden={view !== "activity"} className="min-w-0 space-y-6">
        <aside className="space-y-4" aria-label="Referral summary">
          {data ? (
            <>
              <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
                {[
                  ["Saved choices", data.summary.signups],
                  ["Codes used", data.summary.codesUsed],
                  ["Welcome Marks credited", data.summary.welcomeMarks],
                  ["Friend Marks credited", data.summary.friendMarks],
                ].map(([label, value]) => (
                  <div key={label}>
                    <Text className="text-muted">{label}</Text>
                    <Text className="mt-2 text-xl font-semibold tabular-nums">
                      {value}
                    </Text>
                  </div>
                ))}
              </div>
              <Text className="text-sm text-muted">
                Totals cover all matching saved choices, including no-code
                choices. They do not count unsaved or pending signups.
              </Text>
            </>
          ) : (
            <Text className="text-muted">
              {query.isError ? "Summary unavailable." : "Loading summary…"}
            </Text>
          )}
        </aside>
        <section
          className="min-w-0 space-y-4"
          aria-labelledby="referral-activity-heading"
        >
          <Heading id="referral-activity-heading" level={2} size="sm">
            Referral activity
          </Heading>
          <div className="flex flex-col gap-4">
            <form
              className="flex flex-wrap gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(draft.trim());
                setPage(0);
                setSelectedId(null);
              }}
            >
              <Input
                className="min-w-0 flex-1 basis-64"
                aria-label="Search referral usage"
                placeholder="Code, student, referrer, or campaign"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={120}
              />
              <Select
                value={kind}
                onValueChange={(value) => {
                  if (
                    value === "all" ||
                    value === "friend" ||
                    value === "kol" ||
                    value === "none"
                  ) {
                    setKind(value);
                    setPage(0);
                    setSelectedId(null);
                  }
                }}
              >
                <SelectTrigger
                  aria-label="Referral type"
                  className="w-auto min-w-36"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  <SelectList>
                    <SelectItem value="all">All choices</SelectItem>
                    <SelectItem value="friend">Friend</SelectItem>
                    <SelectItem value="kol">KOL</SelectItem>
                    <SelectItem value="none">No code</SelectItem>
                  </SelectList>
                </SelectPopup>
              </Select>
              <Button type="submit">Search</Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void query.refetch()}
              >
                Refresh
              </Button>
            </form>
            {query.isPending ? (
              <Loader />
            ) : query.isError ? (
              <Card>
                <CardBody>
                  <Text role="alert">We couldn't load referral usage.</Text>
                  <Button
                    variant="secondary"
                    onClick={() => void query.refetch()}
                  >
                    Try again
                  </Button>
                </CardBody>
              </Card>
            ) : data ? (
              <>
                {data.items.length ? (
                  <TableContainer>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Referral source</TableHead>
                          <TableHead>Saved on</TableHead>
                          <TableHead>Outcome</TableHead>
                          <TableHead className="text-right whitespace-nowrap">
                            Welcome credit
                          </TableHead>
                          <TableHead>
                            <span className="sr-only">Open referral</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.items.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="py-2 align-middle whitespace-nowrap">
                              <span
                                className="font-medium"
                                title={row.studentEmail}
                              >
                                {row.studentName}
                              </span>
                            </TableCell>
                            <TableCell className="py-2 align-middle whitespace-nowrap">
                              <span
                                className="font-mono"
                                title={
                                  row.referrerName ??
                                  row.campaignName ??
                                  "Direct signup"
                                }
                              >
                                {row.code ?? "No code"}
                              </span>
                            </TableCell>
                            <TableCell className="py-2 align-middle whitespace-nowrap text-muted">
                              {date(row.decidedAt)}
                            </TableCell>
                            <TableCell className="py-2 align-middle whitespace-nowrap">
                              {referralUsageStatus(row)}
                            </TableCell>
                            <TableCell className="py-2 align-middle text-right whitespace-nowrap tabular-nums">
                              {row.welcomeCreditedMarks ?? 0} Marks
                            </TableCell>
                            <TableCell className="py-2 align-middle text-right">
                              <Button
                                variant="plain"
                                size="icon"
                                className="size-8"
                                aria-label={`View details for ${row.studentName}`}
                                aria-haspopup="dialog"
                                onClick={() => {
                                  setSelectedId(row.id);
                                  setDrawerOpen(true);
                                }}
                              >
                                <IconChevronRight />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <EmptyState
                    icon={
                      search || kind !== "all" ? <IconSearch /> : <IconUsers />
                    }
                    title={
                      search || kind !== "all"
                        ? "No matching referrals"
                        : "No referral activity yet"
                    }
                    description={
                      search || kind !== "all"
                        ? "No referral choices match these filters. Try a different name or code, or clear your filters."
                        : "Saved signup choices will appear here, along with the code used and any rewards credited."
                    }
                    tone="secondary"
                    action={
                      search || kind !== "all" ? (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setDraft("");
                            setSearch("");
                            setKind("all");
                            setPage(0);
                            setSelectedId(null);
                          }}
                        >
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Text className="text-sm text-muted">
                    Page {page + 1} · {data.summary.signups} matching choices
                  </Text>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      disabled={page === 0 || query.isFetching}
                      onClick={() => {
                        setPage(page - 1);
                        setSelectedId(null);
                      }}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={
                        (page + 1) * 25 >= data.summary.signups ||
                        query.isFetching
                      }
                      onClick={() => {
                        setPage(page + 1);
                        setSelectedId(null);
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </div>
                <Drawer
                  open={drawerOpen && Boolean(selected)}
                  onOpenChange={setDrawerOpen}
                >
                  <DrawerPopup className="sm:max-w-xl">
                    {selected ? (
                      <>
                        <DrawerHeader className="justify-between">
                          <DrawerTitle>Referral details</DrawerTitle>
                          <DrawerClose aria-label="Close usage details">
                            <IconX className="size-4" />
                          </DrawerClose>
                        </DrawerHeader>
                        <DrawerBody className="space-y-6">
                          <section
                            className="space-y-4 border-b border-border pb-6"
                            aria-label="Student and referral source"
                          >
                            <div className="space-y-1">
                              <Heading level={2} size="sm">
                                {selected.studentName}
                              </Heading>
                              <Text className="text-muted break-all">
                                {selected.studentEmail}
                              </Text>
                              <Badge
                                variant={
                                  selected.emailVerified ? "success" : "warning"
                                }
                              >
                                {selected.emailVerified
                                  ? "Email verified"
                                  : "Email unverified"}
                              </Badge>
                            </div>
                            <dl className="space-y-3">
                              {[
                                ["Referral code", selected.code ?? "No code"],
                                [
                                  "Source",
                                  selected.referrerName ??
                                    selected.campaignName ??
                                    "Direct signup",
                                ],
                                ["Referrer email", selected.referrerEmail],
                                ["Saved on", date(selected.decidedAt)],
                              ]
                                .filter(([, value]) => value != null)
                                .map(([label, value]) => (
                                  <div
                                    key={label}
                                    className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4"
                                  >
                                    <dt className="text-sm text-muted">
                                      {label}
                                    </dt>
                                    <dd className="break-words text-sm">
                                      {value}
                                    </dd>
                                  </div>
                                ))}
                            </dl>
                          </section>
                          <section
                            className="space-y-4 border-b border-border py-6"
                            aria-label="Referral outcome"
                          >
                            <Heading level={2} size="sm">
                              Rewards and outcome
                            </Heading>
                            <Text className="font-medium">
                              {referralUsageStatus(selected)}
                            </Text>
                            <dl className="space-y-3">
                              {[
                                [
                                  "Welcome credit",
                                  `${selected.welcomeCreditedMarks ?? 0} Marks`,
                                ],
                                ...(selected.kind === "friend"
                                  ? [
                                      [
                                        "Friend reward",
                                        selected.friendDecisionId
                                          ? `${selected.friendCreditedMarks ?? 0} / ${selected.friendRewardMarksSnapshot ?? 0} Marks`
                                          : "Awaiting paid completion",
                                      ],
                                      [
                                        "Completed on",
                                        date(selected.completedAt),
                                      ],
                                      [
                                        "Reward semester",
                                        selected.semesterKey ?? "Not assigned",
                                      ],
                                    ]
                                  : []),
                                ...(selected.kind === "kol"
                                  ? [
                                      [
                                        "Commission",
                                        selected.kolDecisionId
                                          ? new Intl.NumberFormat("id-ID", {
                                              style: "currency",
                                              currency: "IDR",
                                              maximumFractionDigits: 0,
                                            }).format(
                                              selected.commissionIdr ?? 0,
                                            )
                                          : "Awaiting eligible top-up",
                                      ],
                                      [
                                        "Payment status",
                                        selected.paymentStatus ??
                                          "Not available",
                                      ],
                                      [
                                        "Attribution ends",
                                        date(selected.attributionExpiresAt),
                                      ],
                                    ]
                                  : []),
                              ].map(([label, value]) => (
                                <div
                                  key={label}
                                  className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4"
                                >
                                  <dt className="text-sm text-muted">
                                    {label}
                                  </dt>
                                  <dd className="break-words text-sm font-medium">
                                    {value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </section>
                          <details>
                            <summary className="mb-4 cursor-pointer font-medium">
                              Technical details and saved terms
                            </summary>
                            <dl className="divide-y divide-border">
                              {[
                                ["Choice ID", selected.id],
                                ["Student ID", selected.studentId],
                                ["Settings version", selected.settingsVersion],
                                [
                                  "Welcome terms",
                                  `${selected.welcomeMarksSnapshot} Marks`,
                                ],
                                ["Welcome ledger", selected.welcomeLedgerId],
                                ["Friend decision", selected.friendDecisionId],
                                [
                                  "Friend reward ledger",
                                  selected.friendLedgerId,
                                ],
                                [
                                  "First eligible completion",
                                  selected.completionId
                                    ? `${selected.completionType} · ${selected.completionId}`
                                    : null,
                                ],
                                ["Completed at", date(selected.completedAt)],
                                ["Reward semester", selected.semesterKey],
                                [
                                  "Semester cap at decision",
                                  selected.semesterCapMarks === null
                                    ? null
                                    : `${selected.semesterCapMarks} Marks`,
                                ],
                                ["KOL decision", selected.kolDecisionId],
                                ["Payment ID", selected.paymentId],
                                ["Payment state", selected.paymentStatus],
                                [
                                  "Provider time state",
                                  selected.providerTimeState,
                                ],
                                ["Refund review", selected.refundState],
                                [
                                  "Attribution expires",
                                  date(selected.attributionExpiresAt),
                                ],
                              ]
                                .filter(
                                  ([, value]) => value != null && value !== "—",
                                )
                                .map(([label, value]) => (
                                  <div
                                    key={label}
                                    className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4 py-3"
                                  >
                                    <dt className="text-sm text-muted">
                                      {label}
                                    </dt>
                                    <dd className="break-all font-mono text-sm">
                                      {value ?? "—"}
                                    </dd>
                                  </div>
                                ))}
                            </dl>
                          </details>
                          {selected.kind === "kol" ? (
                            <Button
                              className="mt-5"
                              variant="secondary"
                              render={
                                <Link
                                  to="/admin-kol-commissions"
                                  aria-label="Open KOL reconciliation"
                                />
                              }
                              nativeButton={false}
                            >
                              Open KOL reconciliation
                            </Button>
                          ) : null}
                        </DrawerBody>
                      </>
                    ) : null}
                  </DrawerPopup>
                </Drawer>
              </>
            ) : null}
          </div>
        </section>
      </div>
    </Stack>
  );
}
