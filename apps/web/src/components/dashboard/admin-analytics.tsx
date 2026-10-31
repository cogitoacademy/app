"use client";

import type {
  DashboardAnalytics,
  DashboardAnalyticsPeriod,
} from "@cogito-app/api/modules/admin/admin.service";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import { DatePicker } from "@cogito-app/ui/components/selia/date-picker";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import {
  Card,
  CardBody,
  CardHeader,
  CardHeaderAction,
  CardInfoPreview,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Text } from "@cogito-app/ui/components/selia/text";
import { Tabs, TabsItem, TabsList } from "@cogito-app/ui/components/selia/tabs";
import { useQuery } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconCalendarStats,
  IconCash,
  IconChartAreaLine,
  IconChartBar,
  IconChartHistogram,
  IconInfoSquareRounded,
  IconCoins,
  IconRefresh,
  IconTargetArrow,
  IconTrendingDown,
  IconUserOff,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useState } from "react";
import Loader from "@/components/loader";
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
const dateRangeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function formatIdr(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `Rp${numberFormatter.format(amount)}`
    : "Unavailable";
}

function toDateKey(value: Date) {
  return new Date(value.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

function shiftDateKey(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateRangeLabel(value: string) {
  return dateRangeFormatter.format(new Date(`${value}T00:00:00+07:00`));
}
const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--popover-border)",
  borderRadius: "var(--radius-sm)",
  boxShadow: "var(--popover-shadow)",
  color: "var(--popover-foreground)",
};

type ChartValue = number | string | ReadonlyArray<number | string> | undefined;
type ChartName = number | string | undefined;

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
  const today = toDateKey(new Date());
  const [selection, setSelection] = useState<
    { period: DashboardAnalyticsPeriod } | { dateFrom: string; dateTo: string }
  >({ period: "30d" });
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [draftFrom, setDraftFrom] = useState(() => shiftDateKey(today, -29));
  const [draftTo, setDraftTo] = useState(today);
  const analytics = useQuery(
    orpc.admin.getDashboardAnalytics.queryOptions({ input: selection }),
  );
  const selectedPeriod =
    "period" in selection
      ? PERIOD_OPTIONS.find((option) => option.value === selection.period)
      : undefined;
  const periodDescription =
    selectedPeriod?.description ??
    ("dateFrom" in selection
      ? `${formatDateRangeLabel(selection.dateFrom)} - ${formatDateRangeLabel(selection.dateTo)}`
      : "Selected period");
  const customRangeDays =
    Math.floor(
      (new Date(`${draftTo}T00:00:00Z`).getTime() -
        new Date(`${draftFrom}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1;
  const customRangeInvalid =
    !draftFrom || !draftTo || draftFrom > draftTo || customRangeDays > 366;

  function selectPreset(period: DashboardAnalyticsPeriod) {
    setSelection({ period });
    setShowCustomRange(false);
  }

  function applyCustomRange() {
    if (customRangeInvalid) return;
    setSelection({ dateFrom: draftFrom, dateTo: draftTo });
  }

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
        <Tabs
          value={"dateFrom" in selection ? "custom" : selection.period}
          onValueChange={(value) => {
            if (value === "custom") {
              setShowCustomRange(true);
              return;
            }
            selectPreset(value as DashboardAnalyticsPeriod);
          }}
          className="w-fit max-w-full whitespace-nowrap"
        >
          <TabsList
            aria-label="Analytics period"
            className="max-w-full flex-nowrap overflow-x-auto overscroll-x-contain scrollbar-hidden whitespace-nowrap"
          >
            {PERIOD_OPTIONS.map((option) => (
              <TabsItem key={option.value} value={option.value}>
                {option.label}
              </TabsItem>
            ))}
            <TabsItem value="custom">Custom</TabsItem>
          </TabsList>
        </Tabs>
      </div>

      {showCustomRange ? (
        <Card className="mb-4">
          <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            <Field>
              <FieldLabel htmlFor="admin-analytics-from">Start date</FieldLabel>
              <DatePicker
                id="admin-analytics-from"
                value={draftFrom}
                onChange={setDraftFrom}
                minDate={shiftDateKey(today, -365)}
                maxDate={draftTo || today}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-analytics-to">End date</FieldLabel>
              <DatePicker
                id="admin-analytics-to"
                value={draftTo}
                onChange={setDraftTo}
                minDate={draftFrom}
                maxDate={today}
              />
            </Field>
            <Button
              type="button"
              className="w-full lg:w-auto"
              disabled={customRangeInvalid}
              onClick={applyCustomRange}
            >
              Apply range
            </Button>
            {customRangeDays > 366 ? (
              <Text className="sm:col-span-2 lg:col-span-3 text-sm text-danger">
                Custom range cannot exceed 366 days.
              </Text>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {analytics.isPending ? (
        <Loader />
      ) : analytics.isError || !analytics.data ? (
        <AnalyticsError onRetry={() => analytics.refetch()} />
      ) : (
        <AnalyticsContent
          data={analytics.data}
          periodDescription={periodDescription}
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
  const businessSummary = data.businessSummary;
  const operations = data.operationsSummary;
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
      <div className="grid gap-4 sm:grid-cols-3">
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
          icon={<IconUserPlus />}
          label="Active booking proposers"
          value={numberFormatter.format(data.summary.activeLearners)}
          helper={`${numberFormatter.format(data.summary.newStudents)} new students · ${numberFormatter.format(data.summary.newTutors)} tutors · proposer-based`}
          tone="warning-subtle"
        />
      </div>

      {businessSummary ? (
        <>
          <AnalyticsSection
            title="Accounts & activity"
            description="Account growth and rolling 30-day session activity."
          >
            <AnalyticsMetric
              icon={<IconUsers />}
              label="Total accounts"
              value={numberFormatter.format(businessSummary.totalAccounts)}
              helper={`${numberFormatter.format(businessSummary.totalStudents)} students · ${numberFormatter.format(businessSummary.totalTutors)} tutors`}
              tone="primary-subtle"
              scope="Current"
            />
            <AnalyticsMetric
              icon={<IconUserPlus />}
              label="New signups"
              value={numberFormatter.format(businessSummary.signups)}
              helper={periodDescription}
              tone="info-subtle"
            />
            <AnalyticsMetric
              icon={<IconCalendarStats />}
              label="Monthly active users"
              value={numberFormatter.format(businessSummary.monthlyActiveUsers)}
              helper="Unique accounts with session activity"
              tone="success-subtle"
              scope="Rolling 30 days"
            />
            <AnalyticsMetric
              icon={<IconUserOff />}
              label="Inactive users"
              value={numberFormatter.format(businessSummary.inactiveUsers)}
              helper="Accounts older than 30 days with no recent session"
              tone="warning-subtle"
              scope="Rolling 30 days"
            />
          </AnalyticsSection>

          <AnalyticsSection
            title="Wallets & top-up receipts"
            description="Wallet health and successful top-up receipts, separate from service delivery."
          >
            <AnalyticsMetric
              icon={<IconCoins />}
              label="Students holding Marks"
              value={`${percentageFormatter.format(businessSummary.studentsWithMarksRate)}%`}
              helper={`${numberFormatter.format(businessSummary.studentsWithMarks)} with Marks · ${numberFormatter.format(businessSummary.studentsWithoutMarks)} without`}
              tone="primary-subtle"
              scope="Current"
            />
            <AnalyticsMetric
              icon={<IconTrendingDown />}
              label="User churn"
              value={`${percentageFormatter.format(businessSummary.churnRate)}%`}
              helper={`${numberFormatter.format(businessSummary.churnedUsers)} previously active users became inactive`}
              tone="warning-subtle"
              scope="Rolling 30 days"
            />
            <AnalyticsMetric
              icon={<IconTargetArrow />}
              label="Paid conversion"
              value={`${percentageFormatter.format(businessSummary.paidConversionRate)}%`}
              helper={`${numberFormatter.format(businessSummary.payingStudents)} students have completed a top-up`}
              tone="success-subtle"
              scope="Lifetime"
            />
            <AnalyticsMetric
              icon={<IconCash />}
              label="Top-up receipts"
              value={formatIdr(businessSummary.netReceiptsIdr)}
              helper={`Gross ${formatIdr(businessSummary.grossReceiptsIdr)} · refunds ${formatIdr(businessSummary.refundedIdr)}`}
              tone="info-subtle"
            />
          </AnalyticsSection>
        </>
      ) : null}

      {operations.unavailablePaymentDates > 0 ? (
        <Text role="status" className="mt-4 text-sm text-muted">
          Some successful payments have no success date; period receipts exclude
          them.
        </Text>
      ) : null}
      {operations.unavailablePrivateRates > 0 ? (
        <Text role="status" className="mt-4 text-sm text-muted">
          Some upcoming rates are unavailable; totals exclude those seats.
        </Text>
      ) : null}
      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-3">
        <BusinessFacts
          title="Service delivered"
          description="Selected period · by session delivery date. Marks measure settled service, not IDR revenue."
          rows={[
            {
              label: "Private service delivered",
              value: `${numberFormatter.format(operations.delivered.privateMarks)} Marks`,
              detail: `${numberFormatter.format(operations.delivered.privateSessions)} sessions`,
            },
            {
              label: "Academy service delivered",
              value: `${numberFormatter.format(operations.delivered.academyMarks)} Marks`,
              detail: `${numberFormatter.format(operations.delivered.academySeatSessions)} student seat-sessions`,
            },
          ]}
        />
        <BusinessFacts
          title="Upcoming commitments"
          description={`As of ${new Date(operations.asOf).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" })} WIB · confirmed future sessions; independent of the period filter.`}
          rows={[
            {
              label: "Upcoming private sessions",
              value: `${numberFormatter.format(operations.upcoming.privateSeatSessions)} seat-sessions`,
              detail: `${numberFormatter.format(operations.upcoming.privateFundedMarks)} funded Marks · ${numberFormatter.format(operations.upcoming.privateUnfundedMarks)} unfunded Marks`,
            },
            {
              label: "Upcoming Academy seats",
              value: `${numberFormatter.format(operations.upcoming.academySeatSessions)} seat-sessions`,
              detail: `${numberFormatter.format(operations.upcoming.academyFundedMarks)} funded Marks · ${numberFormatter.format(operations.upcoming.academyUnfundedMarks)} unfunded Marks`,
            },
          ]}
        />
        <BusinessFacts
          title="Tutor fees"
          description="Earned in the selected period. Payment status is current; paid fees include allocated gross honorarium before tax and transfer deductions."
          rows={[
            {
              label: "Tutor fees earned",
              value: formatIdr(operations.tutorFees.earnedIdr),
            },
            {
              label: "Tutor fees paid",
              value: formatIdr(operations.tutorFees.paidIdr),
            },
            {
              label: "Tutor fees unpaid",
              value: formatIdr(operations.tutorFees.unpaidIdr),
            },
          ]}
        />
      </div>

      <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <Card className="h-full">
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

        <Card className="h-full">
          <CardHeader>
            <CardTitle>Current booking portfolio</CardTitle>
            <CardHeaderAction>
              <Badge variant="secondary" pill>
                All time
              </Badge>
            </CardHeaderAction>
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

      <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,1fr)] lg:[&>[data-slot=card]]:flex lg:[&>[data-slot=card]]:flex-col lg:[&>[data-slot=card-body]]:flex-1">
        <Card className="h-full">
          <CardHeader>
            <IconBox variant="info-subtle">
              <IconUserPlus />
            </IconBox>
            <CardTitle>
              Audience growth
              <CardInfoPreview>
                <InfoPreview
                  title="Audience growth"
                  description="New student and tutor accounts created during the selected period."
                />
              </CardInfoPreview>
            </CardTitle>
          </CardHeader>
          <CardBody className="flex flex-1 flex-col justify-center">
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

        <Card className="h-full">
          <CardHeader>
            <IconBox variant="warning-subtle">
              <IconChartHistogram />
            </IconBox>
            <CardTitle>
              Demand signals
              <CardInfoPreview>
                <InfoPreview
                  title="Demand signals"
                  description="Format mix and the most requested specialization categories in the selected period."
                />
              </CardInfoPreview>
            </CardTitle>
          </CardHeader>
          <CardBody className="flex flex-1 flex-col justify-center space-y-6">
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
        Booking demand charts use request creation dates. Service delivery uses
        session dates; top-up receipts use successful payment and refund dates.
        Marks, top-up receipts and tutor costs are separate measures and do not
        represent profit.
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
  scope = "Selected period",
}: {
  icon: React.ReactNode;
  label: string;
  value: ReactNode;
  helper: ReactNode;
  tone: "primary-subtle" | "success-subtle" | "info-subtle" | "warning-subtle";
  scope?: string;
}) {
  return (
    <Card className="h-full">
      <CardBody className="flex h-full min-w-0 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <IconBox variant={tone}>{icon}</IconBox>
          <Text className="text-right text-xs text-dimmed">{scope}</Text>
        </div>
        <Text className="mt-5 text-sm text-muted">{label}</Text>
        <Heading size="sm" className="mt-1 break-words text-2xl">
          {value}
        </Heading>
        <div className="mt-2 text-xs text-dimmed">{helper}</div>
      </CardBody>
    </Card>
  );
}

function AnalyticsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      className="mt-6"
      aria-labelledby={`analytics-${title.toLowerCase().replaceAll(" ", "-")}`}
    >
      <Heading
        id={`analytics-${title.toLowerCase().replaceAll(" ", "-")}`}
        level={3}
        size="sm"
      >
        {title}
      </Heading>
      <Text className="mt-1 text-sm text-muted">{description}</Text>
      <div className="mt-3 grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {children}
      </div>
    </section>
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

function BusinessFacts({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: Array<{ label: string; value: string; detail?: string }>;
}) {
  return (
    <section className="min-w-0" aria-label={title}>
      <Heading size="sm">{title}</Heading>
      <Text className="mt-1 text-sm text-muted">{description}</Text>
      <dl className="mt-3 divide-y divide-border">
        {rows.map((row) => (
          <div key={row.label} className="py-3">
            <dt className="text-sm text-muted">{row.label}</dt>
            <dd className="mt-1 break-words text-xl font-semibold">
              {row.value}
            </dd>
            {row.detail ? (
              <dd className="mt-1 text-xs text-dimmed">{row.detail}</dd>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
