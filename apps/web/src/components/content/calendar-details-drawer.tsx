"use client";

import { format } from "date-fns";
import { IconArrowRight, IconExternalLink } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerPopup,
  DrawerTitle,
} from "@cogito-app/ui/components/selia/drawer";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text } from "@cogito-app/ui/components/selia/text";

import {
  formatCompetitionDates,
  getCategoryBadgeClass,
  getCategoryLabel,
  getEducationLevelLabel,
} from "./calendar-utils";
import type { CalendarCompetition } from "./calendar-types";

function formatScale(scale: string) {
  return scale.charAt(0).toUpperCase() + scale.slice(1).toLowerCase();
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm lg:text-base leading-relaxed">
      <Text className="font-semibold">{label}:</Text>
      <Text className="">{value}</Text>
    </p>
  );
}

function CategoryBadges({ event }: { event: CalendarCompetition }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {event.categories.map((category) => (
        <Badge
          key={`${event.id}-${category.coreCategory}`}
          variant="secondary"
          size="md"
          className={getCategoryBadgeClass(category.coreCategory)}
        >
          {getCategoryLabel(category.coreCategory)}
        </Badge>
      ))}
    </div>
  );
}

function InfoCards({ event }: { event: CalendarCompetition }) {
  const educationLevels = event.educationLevels
    .map(getEducationLevelLabel)
    .join(", ");
  const scale = event.scale ? formatScale(event.scale) : null;
  const timeline = formatCompetitionDates(event);
  const registrationDeadline = event.registrationDeadline
    ? format(event.registrationDeadline, "dd MMMM yyyy")
    : null;

  return (
    <div className="mt-1 grid grid-cols-2 gap-4">
      <div className="space-y-1">
        {educationLevels ? (
          <InfoLine label="Competition Level" value={educationLevels} />
        ) : null}
        {scale ? <InfoLine label="Scale" value={scale} /> : null}
        {event.organizer ? (
          <InfoLine label="Organizer" value={event.organizer} />
        ) : null}
      </div>

      <div className="space-y-1">
        {event.location ? (
          <InfoLine label="Location" value={event.location} />
        ) : null}
        <InfoLine label="Event Date" value={timeline} />
        {registrationDeadline ? (
          <InfoLine label="Close Registration" value={registrationDeadline} />
        ) : null}
      </div>
    </div>
  );
}

function EventLinks({ event }: { event: CalendarCompetition }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {event.socialMediaLink ? (
        <Button
          variant="outline"
          block
          nativeButton={false}
          render={
            <a
              href={event.socialMediaLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open social media post"
            />
          }
        >
          Social Media Post <IconExternalLink />
        </Button>
      ) : (
        <Button variant="outline" block disabled>
          Social Media Post
        </Button>
      )}
      {event.registrationLink ? (
        <Button
          variant="primary"
          block
          nativeButton={false}
          render={
            <a
              href={event.registrationLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open registration link"
            />
          }
        >
          Registration Link <IconArrowRight />
        </Button>
      ) : (
        <Button variant="primary" block disabled>
          Registration Link <IconArrowRight />
        </Button>
      )}
    </div>
  );
}

function EventDetailsContent({ event }: { event: CalendarCompetition }) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const revealTone =
    "transition-all duration-300 motion-reduce:transition-none";
  const revealState = entered
    ? "opacity-100 translate-y-0"
    : "pointer-events-none opacity-0 translate-y-2";

  return (
    <DrawerBody className="space-y-4">
      <div>
        <DrawerTitle className="text-2xl font-bold tracking-tight">
          {event.title}
        </DrawerTitle>
        <DrawerDescription className="sr-only">
          Competition details and information
        </DrawerDescription>
        <div className="mt-3">
          <CategoryBadges event={event} />
        </div>
      </div>

      <div
        className={`${revealTone} ${revealState}`}
        style={{ transitionDelay: "0ms" }}
      >
        <InfoCards event={event} />
      </div>

      {event.description ? (
        <div
          className={`rounded-lg bg-accent/30 ${revealTone} ${revealState}`}
          style={{ transitionDelay: "75ms" }}
        >
          <Heading size="sm" className="text-sm lg:text-base">
            Description
          </Heading>
          <Text className="mt-1 whitespace-pre-line">
            {event.description}
          </Text>
        </div>
      ) : null}

      <div
        className={`${revealTone} ${revealState}`}
        style={{ transitionDelay: "150ms" }}
      >
        <EventLinks event={event} />
      </div>
    </DrawerBody>
  );
}

export function CalendarDetailsDrawer({
  event,
  open,
  onClose,
}: {
  event: CalendarCompetition | null;
  open: boolean;
  onClose: () => void;
}) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [visibleEvent, setVisibleEvent] = useState<CalendarCompetition | null>(
    event,
  );
  if (event !== null && event !== visibleEvent) {
    setVisibleEvent(event);
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 640px)");
    const updateViewport = () => setIsDesktop(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  if (!visibleEvent) return null;

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      swipeDirection={isDesktop ? "right" : "down"}
    >
      <DrawerPopup
        direction={isDesktop ? "right" : "bottom"}
        className={isDesktop ? "w-full max-w-lg" : undefined}
      >
        <EventDetailsContent key={visibleEvent.id} event={visibleEvent} />

        <DrawerFooter>
          <DrawerClose>Close</DrawerClose>
        </DrawerFooter>
      </DrawerPopup>
    </Drawer>
  );
}
