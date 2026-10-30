"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
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
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | "friend" | "kol" | "none">("all");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery(
    orpc.adminReferral.listUsage.queryOptions({
      input: { search, kind, page, limit: 25 },
    }),
  );
  const data = query.data;
  const selected = data?.items.find((row) => row.id === selectedId);
  return (
    <Stack direction="column" spacing="lg">
      <div>
        <Heading level={1} size="md">
          See how referrals turn into rewards
        </Heading>
        <Text className="max-w-full text-muted">
          Track each referral from signup to its outcome: welcome credit after a
          first paid completion, or commission for KOL referrals.
        </Text>
      </div>
      <KolCampaignsSection />
      <div className="grid items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4" aria-label="Referral summary">
          {data ? (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
                {[
                  ["Saved choices", data.summary.signups],
                  ["Codes used", data.summary.codesUsed],
                  ["Welcome Marks credited", data.summary.welcomeMarks],
                  ["Friend Marks credited", data.summary.friendMarks],
                ].map(([label, value]) => (
                  <Card key={label}>
                    <CardBody>
                      <Text className="text-muted">{label}</Text>
                      <Text className="mt-2 text-xl font-semibold tabular-nums">
                        {value}
                      </Text>
                    </CardBody>
                  </Card>
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
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle level={2}>Referral activity</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
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
                <SelectTrigger aria-label="Referral type">
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
              <Text role="status">Loading referral usage…</Text>
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
                          {[
                            "Code / owner",
                            "Student",
                            "Chosen at",
                            "Welcome",
                            "Outcome",
                            "Details",
                          ].map((label) => (
                            <TableHead key={label}>{label}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.items.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              <Stack direction="column" spacing="sm">
                                <div>
                                  <Badge variant="secondary">{row.kind}</Badge>{" "}
                                  <span className="font-mono">
                                    {row.code ?? "No code"}
                                  </span>
                                </div>
                                <Text>
                                  {row.referrerName ?? row.campaignName ?? "—"}
                                </Text>
                                {row.referrerEmail ? (
                                  <Text className="text-sm text-muted">
                                    {row.referrerEmail}
                                  </Text>
                                ) : null}
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Text>{row.studentName}</Text>
                              <Text className="text-sm text-muted">
                                {row.studentEmail}
                              </Text>
                              <Text className="text-sm text-muted">
                                {row.emailVerified
                                  ? "Email verified"
                                  : "Email unverified"}
                              </Text>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {date(row.decidedAt)}
                            </TableCell>
                            <TableCell>
                              {row.welcomeCreditedMarks ?? 0} Marks
                            </TableCell>
                            <TableCell>
                              <Text>{referralUsageStatus(row)}</Text>
                              {row.kind === "friend" && row.friendDecisionId ? (
                                <Text className="text-sm text-muted">
                                  {row.friendCreditedMarks ?? 0} /{" "}
                                  {row.friendRewardMarksSnapshot ?? 0} Marks
                                </Text>
                              ) : null}
                              {row.kind === "kol" && row.kolDecisionId ? (
                                <Text className="text-sm text-muted">
                                  {new Intl.NumberFormat("id-ID", {
                                    style: "currency",
                                    currency: "IDR",
                                    maximumFractionDigits: 0,
                                  }).format(row.commissionIdr ?? 0)}{" "}
                                  decision · settlement separate
                                </Text>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="plain"
                                size="sm"
                                aria-expanded={selectedId === row.id}
                                onClick={() =>
                                  setSelectedId(
                                    selectedId === row.id ? null : row.id,
                                  )
                                }
                              >
                                View details
                                <span className="sr-only">
                                  {" "}
                                  for {row.studentName}
                                </span>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Card>
                    <CardBody>
                      <Text>No referral choices match these filters.</Text>
                    </CardBody>
                  </Card>
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
                {selected ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        Usage details · {selected.studentName}
                      </CardTitle>
                    </CardHeader>
                    <CardBody>
                      <dl className="grid gap-4 sm:grid-cols-2">
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
                          ["Friend reward ledger", selected.friendLedgerId],
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
                          ["Provider time state", selected.providerTimeState],
                          ["Refund review", selected.refundState],
                          [
                            "Attribution expires",
                            date(selected.attributionExpiresAt),
                          ],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-sm text-muted">{label}</dt>
                            <dd className="mt-1 break-words text-sm">
                              {value ?? "—"}
                            </dd>
                          </div>
                        ))}
                      </dl>
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
                    </CardBody>
                  </Card>
                ) : null}
              </>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </Stack>
  );
}
