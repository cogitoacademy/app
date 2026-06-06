"use client";

import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Text } from "@cogito-app/ui/components/selia/text";
import { IconTrophy } from "@tabler/icons-react";

export function AchievementEmptyState() {
  return (
    <Card>
      <CardBody className="flex flex-col items-center justify-center py-16 text-center">
        <IconBox size="lg" variant="primary" className="mb-4">
          <IconTrophy />
        </IconBox>
        <Heading size="sm" className="mb-2">
          No achievements yet
        </Heading>
        <Text className="max-w-sm text-muted">
          Add your competition achievements and they&apos;ll be showcased on
          cogitoacademy.id for everyone to see.
        </Text>
      </CardBody>
    </Card>
  );
}
