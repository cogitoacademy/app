"use client";

import { wibCalendarDate } from "./calendar-utils";
import { isValid } from "date-fns";
import { IconCalendarEvent, IconRefresh } from "@tabler/icons-react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@cogito-app/ui/components/selia/button";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";

import { EmptyStateCard } from "@/components/empty-state";
import Loader from "@/components/loader";
import { orpc } from "@/utils/orpc";

import {
  CompetitionCalendar,
  type CalendarCompetition,
} from "./competition-calendar";

export function CompetitionCalendarPage({
  onManage,
}: { onManage?: () => void } = {}) {
  const competitions = useQuery(orpc.content.listCompetitions.queryOptions());
  const events = useMemo<CalendarCompetition[]>(
    () =>
      (competitions.data ?? []).flatMap((competition) => {
        const start = wibCalendarDate(competition.startDate);
        const end = wibCalendarDate(competition.endDate);
        if (!isValid(start) || !isValid(end)) return [];

        return [
          {
            id: competition.id,
            title: competition.title,
            description: competition.description,
            start,
            end,
            endInstant: competition.endDate,
            location: competition.location,
            categories: competition.categories,
            educationLevels: competition.educationLevels,
            scale: competition.scale,
            organizer: competition.organizer,
            registrationDeadline: competition.registrationDeadline
              ? wibCalendarDate(competition.registrationDeadline)
              : null,
            registrationLink: competition.registrationLink,
            socialMediaLink: competition.socialMediaLink,
          },
        ];
      }),
    [competitions.data],
  );

  if (competitions.isPending) return <Loader />;

  if (competitions.isError) {
    return (
      <EmptyStateCard
        icon={<IconRefresh />}
        title="Calendar unavailable"
        description="We could not load the competition calendar. Please try again."
        action={
          <Button onClick={() => void competitions.refetch()}>
            Try again <IconRefresh />
          </Button>
        }
      />
    );
  }

  return (
    <Stack direction="column" spacing="lg" className="min-h-0 flex-nowrap">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading level={1} size="md">
            Your Gateway to the World Stage
          </Heading>
          <Text className="max-w-full text-muted">
            From national challenges to global arenas, access a curated list of
            opportunities tailored for your next big win. Keep track of upcoming
            competitions, registration deadlines, and event details in one
            place.
          </Text>
        </div>
        {onManage ? (
          <Button variant="secondary" onClick={onManage}>
            Manage calendar
          </Button>
        ) : null}
      </div>
      {events.length > 0 ? (
        <CompetitionCalendar events={events} />
      ) : (
        <EmptyStateCard
          icon={<IconCalendarEvent className="text-cogito-orange" />}
          title="No competitions yet"
          description="Published competitions will appear here when they are available."
        />
      )}
    </Stack>
  );
}
