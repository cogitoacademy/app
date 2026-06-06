"use client";

import { cn } from "@cogito-app/ui/lib/utils";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Text } from "@cogito-app/ui/components/selia/text";
import { IconCheck, IconClock, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";

type BannerType = "pending" | "allApproved";

type AchievementBannerProps = {
  type: BannerType;
};

const BANNER_CONFIG: Record<
  BannerType,
  {
    icon: React.ReactNode;
    text: string;
    className: string;
    storageKey: string;
  }
> = {
  pending: {
    icon: <IconClock className="size-4" />,
    text: "Your achievements are being reviewed. We\u2019ll notify you once they\u2019re approved and live on cogitoacademy.id.",
    className: "border-warning-border bg-warning/10 text-warning",
    storageKey: "achievement-banner-pending-dismissed",
  },
  allApproved: {
    icon: <IconCheck className="size-4" />,
    text: "All your achievements are live on cogitoacademy.id. Keep adding more to build your portfolio!",
    className: "border-success-border bg-success/10 text-success",
    storageKey: "achievement-banner-approved-dismissed",
  },
};

export function AchievementBanner({ type }: AchievementBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const config = BANNER_CONFIG[type];

  useEffect(() => {
    const stored = localStorage.getItem(config.storageKey);
    if (stored === "true") {
      setDismissed(true);
    }
  }, [config.storageKey]);

  if (dismissed) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4",
        config.className,
      )}
    >
      <span className="shrink-0 mt-0.5">{config.icon}</span>
      <Text className="flex-1 text-sm">{config.text}</Text>
      <Button
        variant="plain"
        size="sm"
        className="shrink-0"
        onClick={() => {
          setDismissed(true);
          localStorage.setItem(config.storageKey, "true");
        }}
      >
        <IconX className="size-3.5" />
      </Button>
    </div>
  );
}