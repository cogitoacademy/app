"use client";

import { Link } from "@tanstack/react-router";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text } from "@cogito-app/ui/components/selia/text";
import { IconArrowLeft, IconGhost } from "@tabler/icons-react";

export function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <IconGhost className="size-16 text-muted" />
      <Heading size="lg">Page not found</Heading>
      <Text className="text-muted">
        This page does not exist or has been moved.
      </Text>
      <Button render={<Link to="/dashboard" aria-label="Back to dashboard" />}>
        <IconArrowLeft />
        Back to dashboard
      </Button>
    </div>
  );
}
