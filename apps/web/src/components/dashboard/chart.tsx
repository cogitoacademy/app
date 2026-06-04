import {
  Card,
  CardBody,
  CardHeader,
  CardHeaderAction,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { cn } from "@cogito-app/ui/lib/utils";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { data } from "./data";

export function Chart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales</CardTitle>
        <CardHeaderAction>
          <Select defaultValue="Last Week">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectList>
                <SelectItem value="Last Week">Last Week</SelectItem>
                <SelectItem value="Last Month">Last Month</SelectItem>
                <SelectItem value="Last Year">Last Year</SelectItem>
              </SelectList>
            </SelectPopup>
          </Select>
        </CardHeaderAction>
      </CardHeader>
      <CardBody>
        <div
          className={cn(
            "h-[200px] w-full md:h-[480px] [&_*]:outline-none",
            "[&_.recharts-cartesian-axis-tick-value]:fill-dimmed [&_.recharts-cartesian-axis-tick-value]:text-sm",
          )}
        >
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 8, right: 0, left: 20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSeries2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.07} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-separator)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} width={32} tickLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: "var(--radius)",
                  boxShadow: "0 3px 8px rgba(0,0,0,0.08)",
                  background: "var(--color-popover)",
                  border: "none",
                }}
                itemStyle={{
                  color: "var(--color-muted)",
                  fontSize: "var(--text-sm)",
                  display: "flex",
                }}
                labelStyle={{
                  color: "var(--color-foreground)",
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  marginBottom: 4,
                }}
                cursor={false}
              />
              <Area
                type="monotone"
                dataKey="orders"
                name="Orders"
                stroke="var(--color-primary)"
                fillOpacity={1}
                fill="url(#colorSeries2)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardBody>
    </Card>
  );
}
