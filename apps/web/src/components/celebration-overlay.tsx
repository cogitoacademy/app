"use client";

import { Button } from "@cogito-app/ui/components/selia/button";
import {
  IconCalendarCheck,
  IconChalkboardTeacher,
  IconCheck,
  IconCoins,
  IconSparkles,
  IconTrophy,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import { CELEBRATION_EVENT, type CelebrationKind } from "@/lib/celebration";

const COPY: Record<
  CelebrationKind,
  { title: string; description: string; next: string }
> = {
  "booking-submitted": {
    title: "Booking request sent!",
    description: "Nice work — your tutor can now review the request.",
    next: "Next: wait for your tutor's reply",
  },
  "onboarding-submitted": {
    title: "Your profile is on its way!",
    description: "Nice work — the Cogito team will review it next.",
    next: "Next: we'll notify you when it's reviewed",
  },
  "achievement-submitted": {
    title: "Achievement submitted!",
    description:
      "Your milestone is queued for review and will appear once approved.",
    next: "Next: keep building your Cogito story",
  },
  "topup-confirmed": {
    title: "Marks added to your balance!",
    description: "Your wallet is ready for the next session.",
    next: "Next: find a session that moves you forward",
  },
};

const PARTICLES = Array.from({ length: 12 }, (_, index) => index);

export function CelebrationOverlay() {
  const [kind, setKind] = useState<CelebrationKind | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    function show(event: Event) {
      const nextKind = (event as CustomEvent<CelebrationKind>).detail;
      if (!(nextKind in COPY)) return;

      setKind(nextKind);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setKind(null), 4200);
    }

    window.addEventListener(CELEBRATION_EVENT, show);
    return () => {
      window.removeEventListener(CELEBRATION_EVENT, show);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!kind) return null;

  const copy = COPY[kind];
  const VisualIcon =
    kind === "booking-submitted"
      ? IconCalendarCheck
      : kind === "onboarding-submitted"
        ? IconChalkboardTeacher
        : kind === "achievement-submitted"
          ? IconTrophy
          : IconCoins;

  return (
    <aside
      className="celebration-stage fixed inset-0 z-[70] grid place-items-center p-4"
      aria-live="polite"
      aria-atomic="true"
    >
      <button
        type="button"
        className="celebration-scrim absolute inset-0 cursor-default"
        aria-label="Close success celebration"
        onClick={() => setKind(null)}
      />
      <div
        data-slot="celebration"
        className="celebration-card relative w-full max-w-lg overflow-hidden rounded-3xl border border-success-border bg-card p-6 shadow-popover sm:p-8"
      >
        <div className="celebration-confetti" aria-hidden="true">
          {PARTICLES.map((particle) => (
            <i
              key={particle}
              style={{ "--particle": particle } as React.CSSProperties}
            />
          ))}
        </div>
        <Button
          variant="plain"
          size="sm-icon"
          className="absolute right-3 top-3 z-10"
          aria-label="Dismiss celebration"
          onClick={() => setKind(null)}
        >
          <IconX aria-hidden="true" />
        </Button>
        <div className="celebration-visual" aria-hidden="true">
          <span className="celebration-ring celebration-ring-one" />
          <span className="celebration-ring celebration-ring-two" />
          <span className="celebration-orbit" />
          <div className="celebration-check grid size-20 place-items-center rounded-full bg-success text-success-foreground">
            <VisualIcon className="size-9" stroke={1.8} />
          </div>
          <span className="celebration-checkmark">
            <IconCheck className="size-4" stroke={3} />
          </span>
        </div>
        <div className="celebration-content relative text-center">
          <p className="celebration-eyebrow inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-success">
            <IconSparkles className="size-4" aria-hidden="true" />
            You did it
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {copy.title}
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted sm:text-base">
            {copy.description}
          </p>
          <div className="celebration-next mx-auto mt-5 flex w-fit items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-success" />
            {copy.next}
          </div>
        </div>
        <Button
          className="celebration-action relative mx-auto mt-7 flex min-w-36"
          onClick={() => setKind(null)}
        >
          Continue
        </Button>
      </div>
    </aside>
  );
}
