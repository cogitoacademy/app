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
    icon: <IconClock className="size-4 text-warning" />,
    text: "Your achievements are being reviewed. We\u2019ll notify you once they\u2019re approved and live on cogitoacademy.id.",
    className:
      "border-warning-border bg-linear-to-r from-warning/10 to-warning/5",
    storageKey: "achievement-banner-pending-dismissed",
  },
  allApproved: {
    icon: <IconCheck className="size-4 text-success" />,
    text: "All your achievements are live on cogitoacademy.id. Keep adding more to build your portfolio!",
    className:
      "border-success-border bg-linear-to-r from-success/10 to-success/5",
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
      role="status"
      className={cn(
        "flex min-h-13 items-center gap-3 rounded-xl border px-4 py-3",
        config.className,
      )}
    >
      <span className="flex size-6 shrink-0 items-center justify-center">
        {config.icon}
      </span>
      <Text className="flex-1 text-sm leading-relaxed">{config.text}</Text>
      <Button
        variant="plain"
        size="xs-icon"
        className="-mr-1 shrink-0"
        aria-label="Dismiss achievement status"
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
