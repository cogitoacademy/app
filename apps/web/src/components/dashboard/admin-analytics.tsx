"use client";

import type {
  DashboardAnalytics,
  DashboardAnalyticsPeriod,
} from "@cogito-app/api/modules/admin/admin.service";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardHeaderAction,
  CardInfoPreview,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Text } from "@cogito-app/ui/components/selia/text";
import { useQuery } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconChartAreaLine,
  IconChartBar,
  IconChartHistogram,
  IconInfoSquareRounded,
  IconRefresh,
  IconTargetArrow,
  IconUserPlus,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { orpc } from "@/utils/orpc";
import { InfoPreview } from "@/components/info-preview";

const PERIOD_OPTIONS: Array<{
  value: DashboardAnalyticsPeriod;
  label: string;
  description: string;
}> = [
  { value: "7d", label: "7 days", description: "A focused weekly pulse" },
  {
    value: "30d",
    label: "30 days",
    description: "The operating view for this month",
  },
  {
    value: "90d",
    label: "90 days",
    description: "A broader growth signal",
  },
];

const STATE_ORDER = [
  "awaiting_tutor_review",
  "awaiting_participant_confirmation",
  "awaiting_reconfirmation",
  "awaiting_admin_room_approval",
  "reschedule_proposed",
  "confirmed",
  "scheduled",
  "completed",
  "declined",
  "cancelled",
  "late_cancelled",
  "no_show",
  "expired",
] as const;

const STATE_LABELS: Record<string, string> = {
  awaiting_tutor_review: "Tutor review",
  awaiting_participant_confirmation: "Confirming",
  awaiting_reconfirmation: "Reconfirming",
  awaiting_admin_room_approval: "Room approval",
  reschedule_proposed: "Reschedule",
  confirmed: "Confirmed",
  scheduled: "Scheduled",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
  late_cancelled: "Late cancel",
  no_show: "No-show",
  expired: "Expired",
};

const STATE_COLORS: Record<string, string> = {
  awaiting_tutor_review: "var(--warning)",
  awaiting_participant_confirmation: "var(--warning)",
  awaiting_reconfirmation: "var(--warning)",
  awaiting_admin_room_approval: "var(--danger)",
  reschedule_proposed: "var(--info)",
  confirmed: "var(--primary)",
  scheduled: "var(--primary)",
  completed: "var(--success)",
  declined: "var(--muted)",
  cancelled: "var(--danger)",
  late_cancelled: "var(--danger)",
  no_show: "var(--danger)",
  expired: "var(--muted)",
};

const numberFormatter = new Intl.NumberFormat("id-ID");
const percentageFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 1,
});
const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--popover-border)",
  borderRadius: "var(--radius-sm)",
  boxShadow: "var(--popover-shadow)",
  color: "var(--popover-foreground)",
};

type ChartValue = number | string | ReadonlyArray<number | string> | undefined;
type ChartName = number | string | undefined;

function formatMarks(value: number) {
  return `${numberFormatter.format(value)} Marks`;
}

function formatDateTick(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatDateLabel(value: ReactNode) {
  return typeof value === "string"
    ? formatDateTick(value)
    : String(value ?? "");
}

function formatTooltipValue(value: ChartValue) {
  if (Array.isArray(value)) return value.join(", ");
  return numberFormatter.format(Number(value ?? 0));
}

function formatTooltipName(name: ChartName) {
  if (name === "completed") return "Completed";
  if (name === "bookings") return "New bookings";
  if (name === "students") return "Students";
  if (name === "tutors") return "Tutors";
  return String(name ?? "Value");
}

function chartTooltipFormatter(value: ChartValue, name: ChartName) {
  return [formatTooltipValue(value), formatTooltipName(name)];
}

export function AdminAnalytics() {
  const [period, setPeriod] = useState<DashboardAnalyticsPeriod>("30d");
  const analytics = useQuery(
    orpc.admin.getDashboardAnalytics.queryOptions({ input: { period } }),
  );
  const selectedPeriod = PERIOD_OPTIONS.find(
    (option) => option.value === period,
  );

  return (
    <section aria-labelledby="admin-analytics-heading">
      <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Heading
            id="admin-analytics-heading"
            level={2}
            size="md"
            className="mt-3"
          >
            Read the business at a glance
          </Heading>
          <Text className="mt-1 max-w-2xl text-muted">
            Demand, audience growth, and operational health based on real
            booking activity. All period metrics use WIB calendar days.
          </Text>
        </div>
        <div
          className="inline-flex w-fit max-w-full flex-wrap rounded-lg bg-accent p-1"
          role="group"
          aria-label="Analytics period"
        >
          {PERIOD_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={option.value === period ? "secondary" : "plain"}
              size="sm"
              aria-pressed={option.value === period}
              onClick={() => setPeriod(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {analytics.isPending ? (
        <AnalyticsSkeleton />
      ) : analytics.isError || !analytics.data ? (
        <AnalyticsError onRetry={() => analytics.refetch()} />
      ) : (
        <AnalyticsContent
          data={analytics.data}
          periodDescription={selectedPeriod?.description ?? "Selected period"}
        />
      )}
    </section>
  );
}

function AnalyticsContent({
  data,
  periodDescription,
}: {
  data: DashboardAnalytics;
  periodDescription: string;
}) {
  const stateData = STATE_ORDER.map((state) => {
    const row = data.stateBreakdown.find(
      (candidate) => candidate.state === state,
    );
    return { state, label: STATE_LABELS[state], count: row?.count ?? 0 };
  }).filter((row) => row.count > 0);
  const hasBookingTrend = data.summary.bookings > 0;
  const hasUserTrend = data.summary.newStudents + data.summary.newTutors > 0;
  const totalModalityBookings = data.modalityBreakdown.reduce(
    (total, row) => total + row.count,
    0,
  );
  const maxCategoryBookings = Math.max(
    1,
    ...data.categoryBreakdown.map((row) => row.bookings),
  );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsMetric
          icon={<IconChartBar />}
          label="Bookings"
          value={numberFormatter.format(data.summary.bookings)}
          helper={periodDescription}
          tone="primary-subtle"
        />
        <AnalyticsMetric
          icon={<IconTargetArrow />}
          label="Completion rate"
          value={`${percentageFormatter.format(data.summary.completionRate)}%`}
          helper={`${numberFormatter.format(data.summary.resolvedBookings)} resolved bookings`}
          tone="success-subtle"
        />
        <AnalyticsMetric
          icon={<IconChartHistogram />}
          label="Gross Marks volume"
          value={formatMarks(data.summary.grossMarks)}
          helper={`${formatMarks(data.summary.platformTakeMarks)} platform take`}
          tone="info-subtle"
        />
        <AnalyticsMetric
          icon={<IconUserPlus />}
          label="Active learners"
          value={numberFormatter.format(data.summary.activeLearners)}
          helper={`${numberFormatter.format(data.summary.newStudents)} new students · ${numberFormatter.format(data.summary.newTutors)} tutors`}
          tone="warning-subtle"
        />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <Card>
          <CardHeader>
            <IconBox variant="primary-subtle">
              <IconChartAreaLine />
            </IconBox>
            <CardTitle>
              Booking activity
              <CardInfoPreview>
                <InfoPreview
                  icon={<IconInfoSquareRounded />}
                  title="Booking activity"
                  description="New demand against completed sessions over the selected period."
                  label="About booking activity"
                />
              </CardInfoPreview>
            </CardTitle>
            <CardHeaderAction>
              <Badge variant="secondary" pill>
                WIB
              </Badge>
            </CardHeaderAction>
          </CardHeader>
          <CardBody>
            {hasBookingTrend ? (
              <div
                className="h-72 w-full"
                role="img"
                aria-label="Booking activity chart showing new and completed bookings"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.bookingTrend}
                    margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="bookingTrendFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="var(--primary)"
                          stopOpacity={0.24}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--primary)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="var(--border)"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateTick}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted)" }}
                      interval={Math.max(
                        0,
                        Math.ceil(data.bookingTrend.length / 7) - 1,
                      )}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted)" }}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: "var(--muted)" }}
                      cursor={{ stroke: "var(--border)" }}
                      labelFormatter={formatDateLabel}
                      formatter={chartTooltipFormatter}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: 12, color: "var(--muted)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="bookings"
                      stroke="var(--primary)"
                      fill="url(#bookingTrendFill)"
                      strokeWidth={2.5}
                      name="New bookings"
                    />
                    <Area
                      type="monotone"
                      dataKey="completed"
                      stroke="var(--success)"
                      fill="transparent"
                      strokeWidth={2}
                      name="Completed"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <ChartEmpty message="No booking activity in this period yet." />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current booking portfolio</CardTitle>
          </CardHeader>
          <CardBody>
            {stateData.length > 0 ? (
              <div
                className="h-72 w-full"
                role="img"
                aria-label="Current booking portfolio by state"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stateData}
                    layout="vertical"
                    margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid
                      stroke="var(--border)"
                      strokeDasharray="3 3"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted)" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={92}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted)" }}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: "var(--muted)" }}
                      cursor={{ fill: "var(--accent)" }}
                      formatter={chartTooltipFormatter}
                    />
                    <Bar dataKey="count" name="Bookings" radius={[0, 5, 5, 0]}>
                      {stateData.map((row) => (
                        <Cell
                          key={row.state}
                          fill={STATE_COLORS[row.state] ?? "var(--primary)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <ChartEmpty message="No booking portfolio data yet." />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,1fr)]">
        <Card>
          <CardHeader>
            <IconBox variant="info-subtle">
              <IconUserPlus />
            </IconBox>
            <CardTitle>Audience growth</CardTitle>
            <CardDescription>
              New student and tutor accounts created during the selected period.
            </CardDescription>
          </CardHeader>
          <CardBody>
            {hasUserTrend ? (
              <div
                className="h-64 w-full"
                role="img"
                aria-label="Audience growth chart showing new students and tutors"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.userTrend}
                    margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="var(--border)"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateTick}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted)" }}
                      interval={Math.max(
                        0,
                        Math.ceil(data.userTrend.length / 7) - 1,
                      )}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted)" }}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: "var(--muted)" }}
                      cursor={{ fill: "var(--accent)" }}
                      labelFormatter={formatDateLabel}
                      formatter={chartTooltipFormatter}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: 12, color: "var(--muted)" }}
                    />
                    <Bar
                      dataKey="students"
                      name="Students"
                      stackId="audience"
                      fill="var(--primary)"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="tutors"
                      name="Tutors"
                      stackId="audience"
                      fill="var(--cogito-orange)"
                      radius={[5, 5, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <ChartEmpty message="No new accounts in this period yet." />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <IconBox variant="warning-subtle">
              <IconChartHistogram />
            </IconBox>
            <CardTitle>Demand signals</CardTitle>
            <CardDescription>
              Format mix and the most requested specialization categories in the
              selected period.
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-6">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <Text className="text-sm font-medium">Session format</Text>
                <Text className="text-sm text-muted">
                  {numberFormatter.format(totalModalityBookings)} bookings
                </Text>
              </div>
              {totalModalityBookings > 0 ? (
                <div className="space-y-3">
                  {data.modalityBreakdown.map((row) => {
                    const percentage =
                      (row.count / totalModalityBookings) * 100;
                    const isOnline = row.modality === "online";
                    return (
                      <div key={row.modality}>
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <Text className="text-sm capitalize">
                            {row.modality}
                          </Text>
                          <Text className="text-sm text-muted">
                            {numberFormatter.format(row.count)} ·{" "}
                            {percentageFormatter.format(percentage)}%
                          </Text>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-accent">
                          <div
                            className={
                              isOnline
                                ? "h-full rounded-full bg-primary"
                                : "h-full rounded-full bg-cogito-orange"
                            }
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <ChartEmpty
                  message="No format data in this period yet."
                  compact
                />
              )}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <Text className="text-sm font-medium">Top categories</Text>
                <Badge variant="secondary" pill>
                  Top 5
                </Badge>
              </div>
              {data.categoryBreakdown.length > 0 ? (
                <div className="space-y-3">
                  {data.categoryBreakdown.map((row) => (
                    <div key={row.category}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <Text className="min-w-0 truncate text-sm">
                          {row.category}
                        </Text>
                        <Text className="shrink-0 text-sm text-muted">
                          {numberFormatter.format(row.bookings)} ·{" "}
                          {numberFormatter.format(row.completed)} done
                        </Text>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-accent">
                        <div
                          className="h-full rounded-full bg-warning"
                          style={{
                            width: `${(row.bookings / maxCategoryBookings) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ChartEmpty
                  message="No tagged categories in this period yet."
                  compact
                />
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <Text className="mt-3 text-xs text-dimmed">
        Platform take is shown in Marks from each booking&apos;s locked price
        snapshot. It is an operational signal, not a cash-revenue report.
      </Text>
    </>
  );
}

function AnalyticsMetric({
  icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
  tone: "primary-subtle" | "success-subtle" | "info-subtle" | "warning-subtle";
}) {
  return (
    <Card>
      <CardBody className="min-w-0 p-5">
        <div className="flex items-start justify-between gap-3">
          <IconBox variant={tone}>{icon}</IconBox>
          <Text className="text-right text-xs text-dimmed">
            Selected period
          </Text>
        </div>
        <Text className="mt-5 text-sm text-muted">{label}</Text>
        <Heading size="sm" className="mt-1 break-words text-2xl">
          {value}
        </Heading>
        <Text className="mt-2 text-xs text-dimmed">{helper}</Text>
      </CardBody>
    </Card>
  );
}

function ChartEmpty({
  message,
  compact = false,
}: {
  message: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex ${compact ? "min-h-12" : "h-72"} items-center justify-center rounded-lg border border-dashed border-border bg-accent/40 px-4 text-center`}
    >
      <Text className="text-sm text-muted">{message}</Text>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading business insights">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-xl bg-accent"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <div className="h-96 animate-pulse rounded-xl bg-accent" />
        <div className="h-96 animate-pulse rounded-xl bg-accent" />
      </div>
    </div>
  );
}

function AnalyticsError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <CardBody className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
        <IconBox variant="danger-subtle">
          <IconAlertTriangle />
        </IconBox>
        <div className="min-w-0 flex-1">
          <Heading size="sm">Business insights are unavailable</Heading>
          <Text className="mt-1 text-muted">
            The operational queues are still available below. Try again when the
            analytics read is ready.
          </Text>
        </div>
        <Button type="button" variant="outline" onClick={onRetry}>
          Try again <IconRefresh />
        </Button>
      </CardBody>
    </Card>
  );
}
