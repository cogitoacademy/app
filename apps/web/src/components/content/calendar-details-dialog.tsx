"use client";

import { format } from "date-fns";
import { IconArrowRight, IconExternalLink } from "@tabler/icons-react";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@cogito-app/ui/components/selia/dialog";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text } from "@cogito-app/ui/components/selia/text";

import {
  formatCompetitionDates,
  getCategoryEventClass,
  getCategoryLabel,
  getEducationLevelLabel,
} from "./calendar-utils";
import type { CalendarCompetition } from "./calendar-types";

function formatScale(scale: string) {
  return scale.charAt(0).toUpperCase() + scale.slice(1).toLowerCase();
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm leading-relaxed">
      <span className="font-semibold">{label}:</span> {value}
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
          size="sm"
          className={getCategoryEventClass(category.coreCategory)}
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
    <div className="mt-1 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-lg bg-accent/30 p-4 sm:hidden">
        <div className="space-y-1">
          {educationLevels ? (
            <InfoLine label="Competition Level" value={educationLevels} />
          ) : null}
          {scale ? <InfoLine label="Scale" value={scale} /> : null}
          {event.organizer ? (
            <InfoLine label="Organizer" value={event.organizer} />
          ) : null}
          {event.location ? (
            <InfoLine label="Location" value={event.location} />
          ) : null}
          <InfoLine label="Competition Timeline" value={timeline} />
          {registrationDeadline ? (
            <InfoLine label="Close Registration" value={registrationDeadline} />
          ) : null}
        </div>
      </div>

      <div className="hidden rounded-lg bg-accent/30 p-4 sm:block">
        <div className="space-y-1">
          {educationLevels ? (
            <InfoLine label="Competition Level" value={educationLevels} />
          ) : null}
          {scale ? <InfoLine label="Scale" value={scale} /> : null}
          {event.organizer ? (
            <InfoLine label="Organizer" value={event.organizer} />
          ) : null}
        </div>
      </div>

      <div className="hidden rounded-lg bg-accent/30 p-4 sm:block">
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
    </div>
  );
}

export function CalendarDetailsDialog({
  event,
  open,
  onClose,
}: {
  event: CalendarCompetition | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!event) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogPopup className="max-w-2xl p-0">
        <DialogHeader className="items-start border-b border-dialog-border">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-2xl font-bold tracking-tight">
              {event.title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Competition details and information
            </DialogDescription>
            <div className="mt-3 sm:hidden">
              <CategoryBadges event={event} />
            </div>
          </div>
          <div className="hidden shrink-0 sm:block">
            <CategoryBadges event={event} />
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <InfoCards event={event} />

          {event.description ? (
            <div className="rounded-lg bg-accent/30 p-4">
              <Heading size="sm" className="text-sm">
                Description
              </Heading>
              <Text className="mt-1 whitespace-pre-line text-sm text-muted">
                {event.description}
              </Text>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <DialogClose className="order-last sm:order-first">Close</DialogClose>
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
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
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
