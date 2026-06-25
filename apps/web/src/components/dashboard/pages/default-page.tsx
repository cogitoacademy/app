import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Text } from "@cogito-app/ui/components/selia/text";

type DefaultPageProps = {
  title: string;
  description: string;
  emptyState: string;
};

export function DefaultPage({
  title,
  description,
  emptyState,
}: DefaultPageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardBody>
        <Text className="text-muted">{emptyState}</Text>
      </CardBody>
    </Card>
  );
}
