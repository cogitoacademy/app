"use client";

import { Button } from "@cogito-app/ui/components/selia/button";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Text } from "@cogito-app/ui/components/selia/text";
import { IconTrophy } from "@tabler/icons-react";

type AchievementEmptyStateProps = {
  onAdd: () => void;
};

export function AchievementEmptyState({ onAdd }: AchievementEmptyStateProps) {
  return (
    <Card>
      <CardBody className="flex flex-col items-center justify-center py-16 text-center">
        <IconBox size="lg" variant="primary" className="mb-4">
          <IconTrophy />
        </IconBox>
        <Heading size="sm" className="mb-2">
          No achievements yet
        </Heading>
        <Text className="mb-6 max-w-sm text-muted">
          Add your competition achievements and they&apos;ll be showcased on
          cogitoacademy.id for everyone to see.
        </Text>
        <Button onClick={onAdd}>Add Your First Achievement</Button>
      </CardBody>
    </Card>
  );
}