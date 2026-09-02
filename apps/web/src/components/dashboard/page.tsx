import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemMeta,
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { Link } from "@tanstack/react-router";
import {
  IconArrowRightCircle,
  IconBrandWhatsapp,
  IconCalendarEvent,
  IconCertificate,
  IconSchool,
  IconUsersGroup,
  IconWallet,
} from "@tabler/icons-react";

import { WhatsAppSupportDialog } from "@/components/whatsapp-support-dialog";
import { StatCard } from "./stat-card";

const milestones = [
  {
    name: "Choose a tutor",
    description: "Match by specialization, style, and session format.",
    icon: IconSchool,
  },
  {
    name: "Keep Marks ready",
    description: "Use Marks for solo, group, or series bookings.",
    icon: IconWallet,
  },
  {
    name: "Track achievements",
    description: "Submit milestones for review and visibility.",
    icon: IconCertificate,
  },
] as const;

export function DashboardPage() {
  return (
    <>
      <Card className="overflow-hidden">
        <CardBody className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <Badge variant="info" size="lg" pill>
              Student workspace
            </Badge>
            <Heading className="mt-4 text-3xl">Plan the next session</Heading>
            <Text className="mt-2 max-w-2xl text-muted">
              Find tutors, prepare Marks, follow Cogito competition updates, and
              keep learning progress visible in one place.
            </Text>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
            <Button
              nativeButton={false}
              render={<Link to="/tutors" aria-label="Find a tutor" />}
              className="w-full sm:w-auto"
            >
              Find a tutor
              <IconArrowRightCircle />
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link to="/calendar" aria-label="Open competition calendar" />
              }
              className="w-full sm:w-auto"
            >
              Competition Calendar
              <IconCalendarEvent />
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<IconSchool />}
          title="Tutor Discovery"
          value="Open"
          change="Browse verified tutors"
        />
        <StatCard
          icon={<IconWallet />}
          title="Marks Wallet"
          value="Ready"
          change="Top up before booking"
        />
        <StatCard
          icon={<IconCalendarEvent />}
          title="Calendar"
          value="Live"
          change="Competition schedule"
        />
        <StatCard
          icon={<IconCertificate />}
          title="Achievements"
          value="Track"
          change="Submit milestones"
        />
      </div>

      <div className="flex flex-wrap gap-4 lg:flex-nowrap">
        <div className="w-full lg:w-7/12">
          <NextStepsCard />
        </div>
        <div className="w-full lg:w-5/12">
          <SupportCard />
        </div>
      </div>
    </>
  );
}

function NextStepsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Primary flow</CardTitle>
      </CardHeader>
      <CardBody>
        <Stack>
          {milestones.map((item) => {
            const Icon = item.icon;

            return (
              <Item key={item.name} variant="plain">
                <ItemMedia>
                  <IconBox variant="secondary">
                    <Icon />
                  </IconBox>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{item.name}</ItemTitle>
                  <ItemDescription>{item.description}</ItemDescription>
                </ItemContent>
                <ItemMeta className="ml-auto shrink-0">
                  <IconArrowRightCircle />
                </ItemMeta>
              </Item>
            );
          })}
        </Stack>
      </CardBody>
      <CardFooter>
        <Button
          variant="secondary"
          block
          size="lg"
          nativeButton={false}
          render={<Link to="/bookings" aria-label="View bookings" />}
        >
          View bookings <IconArrowRightCircle />
        </Button>
      </CardFooter>
    </Card>
  );
}

function SupportCard() {
  return (
    <Card>
      <CardHeader>
        <IconBox variant="success">
          <IconUsersGroup />
        </IconBox>
        <CardTitle>Need guidance?</CardTitle>
        <CardDescription>
          Contact Cogito support or check competition dates before committing to
          a study plan.
        </CardDescription>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <WhatsAppSupportDialog
          trigger={
            <Button
              variant="outline"
              aria-label="Contact Cogito through WhatsApp"
            >
              WhatsApp Support
              <IconBrandWhatsapp />
            </Button>
          }
        />
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link to="/calendar" aria-label="Open competition calendar" />
          }
        >
          Competition Calendar
          <IconCalendarEvent />
        </Button>
      </CardBody>
    </Card>
  );
}
