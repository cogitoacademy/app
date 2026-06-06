import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Text } from "@cogito-app/ui/components/selia/text";

export function StatCard({
  icon,
  title,
  value,
  change,
  changeType,
}: {
  icon: React.ReactNode;
  title: string;
  value: React.ReactNode;
  change: string;
  changeType: "increase" | "decrease";
}) {
  return (
    <Card>
      <CardBody>
        <IconBox size="lg" variant="info-subtle" className="mb-4">
          {icon}
        </IconBox>
        <Heading size="sm" className="font-medium text-dimmed">
          {title}
        </Heading>
        <Text className="mt-2 text-4xl font-semibold">{value}</Text>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant={changeType === "increase" ? "success" : "danger"} className="mt-2">
            {change}
          </Badge>
          <Text className="mt-2 text-sm text-dimmed">
            {changeType === "increase" ? "Compared to last month" : "Compared to last week"}
          </Text>
        </div>
      </CardBody>
    </Card>
  );
}
