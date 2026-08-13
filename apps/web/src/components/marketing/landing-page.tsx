"use client";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
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
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";
import { Separator } from "@cogito-app/ui/components/selia/separator";
import { Text } from "@cogito-app/ui/components/selia/text";
import { Link } from "@tanstack/react-router";
import {
  IconArrowRight,
  IconBrandWhatsapp,
  IconCalendarEvent,
  IconCertificate,
  IconChevronRight,
  IconSchool,
  IconSparkles,
  IconTargetArrow,
  IconUsersGroup,
  IconWallet,
} from "@tabler/icons-react";

const learningFlow = [
  {
    title: "Find the right tutor",
    description:
      "Browse verified Cogito tutors by subject, modality, availability, and learning fit.",
    icon: IconSchool,
  },
  {
    title: "Top up Marks",
    description:
      "Buy a Marks package once, then use the balance for solo, group, or series sessions.",
    icon: IconWallet,
  },
  {
    title: "Book the session",
    description:
      "Hold a slot, confirm attendance, and keep every update visible in your workspace.",
    icon: IconCalendarEvent,
  },
  {
    title: "Show the progress",
    description:
      "Submit achievements and keep a parent-legible record of learning milestones.",
    icon: IconCertificate,
  },
] as const;

const achievementHighlights = [
  "Olympiad prep milestones",
  "Research and writing portfolio",
  "University application readiness",
] as const;

export function LandingPage() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg bg-tertiary text-tertiary-foreground ring ring-tertiary-border">
              <img src="/c of cogito.png" alt="" className="size-5 invert" />
            </span>
            <span className="font-semibold">Cogito</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-6 text-sm text-muted md:flex">
            <a href="#flow" className="hover:text-foreground">
              Flow
            </a>
            <a href="#achievements" className="hover:text-foreground">
              Achievements
            </a>
            <a
              href="https://cogitoacademy.id/en/calendar"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              Calendar
            </a>
          </nav>
          <Button
            variant="secondary"
            size="sm"
            nativeButton={false}
            render={<Link to="/login" aria-label="Sign in" />}
          >
            Sign in
          </Button>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-info/20 via-success/10 to-transparent" />
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-18">
          <div className="relative z-1 flex flex-col justify-center">
            <Badge variant="info" size="lg" pill>
              <IconSparkles />
              Built for ambitious students in Indonesia
            </Badge>
            <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[0.98] sm:text-6xl lg:text-7xl">
              Cogito academic coaching, booked with Marks.
            </h1>
            <Text className="mt-5 max-w-2xl text-lg text-muted">
              A focused learning workspace for tutor discovery, flexible
              booking, parent-visible progress, and competition preparation.
            </Text>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                nativeButton={false}
                render={
                  <Link
                    to="/login"
                    search={{ redirect: "/tutors" }}
                    aria-label="Find a tutor"
                  />
                }
              >
                Find a tutor
                <IconArrowRight />
              </Button>
              <Button
                variant="outline"
                size="lg"
                nativeButton={false}
                render={
                  <a
                    href="https://cogitoacademy.id/en/calendar"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open competition calendar"
                  />
                }
              >
                Competition calendar
                <IconCalendarEvent />
              </Button>
            </div>
          </div>

          <div className="relative z-1">
            <div className="rounded-xl border border-card-border bg-card p-4 shadow-card">
              <div className="rounded-lg border border-border bg-background p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Text className="text-sm text-muted">Learning plan</Text>
                    <Heading size="sm">IB Math sprint</Heading>
                  </div>
                  <Badge variant="success">Ready</Badge>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    { label: "Solo", marks: 18 },
                    { label: "Group", marks: 28 },
                    { label: "Series", marks: 84 },
                  ].map((option) => (
                    <div
                      key={option.label}
                      className="rounded-lg border border-item-border bg-item p-3"
                    >
                      <Text className="text-xs text-muted">{option.label}</Text>
                      <div className="mt-3 flex items-center gap-1.5">
                        <img src="/cogito-mark.png" alt="" className="h-5" />
                        <span className="text-lg font-semibold">
                          {option.marks}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <Separator className="my-5" />
                <Item variant="plain">
                  <ItemMedia>
                    <IconBox variant="warning">
                      <IconTargetArrow />
                    </IconBox>
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>Next milestone</ItemTitle>
                    <ItemDescription>
                      Submit mock result, unlock tutor feedback, and prepare the
                      next session.
                    </ItemDescription>
                  </ItemContent>
                </Item>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="flow"
        className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8"
      >
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Text className="text-sm font-medium text-info">
              Primary website flow
            </Text>
            <Heading className="text-3xl sm:text-4xl">
              From discovery to visible progress
            </Heading>
          </div>
          <Button
            variant="plain"
            nativeButton={false}
            render={
              <Link
                to="/login"
                search={{ redirect: "/dashboard" }}
                aria-label="Open workspace"
              />
            }
          >
            Open workspace
            <IconChevronRight />
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {learningFlow.map((step, index) => {
            const Icon = step.icon;

            return (
              <Card key={step.title}>
                <CardHeader>
                  <IconBox variant={index % 2 === 0 ? "info" : "success"}>
                    <Icon />
                  </IconBox>
                  <CardTitle>{step.title}</CardTitle>
                  <CardDescription>Step {index + 1}</CardDescription>
                </CardHeader>
                <CardBody>
                  <Text className="text-muted">{step.description}</Text>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </section>

      <section
        id="achievements"
        className="border-y border-border bg-accent/40"
      >
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <Badge variant="warning" size="lg" pill>
              <IconCertificate />
              Promotion-ready
            </Badge>
            <Heading className="mt-5 text-3xl sm:text-4xl">
              Achievements become part of the story.
            </Heading>
            <Text className="mt-4 text-muted">
              The public surface is ready to promote approved student outcomes.
              Once the public achievements API is added, this section can be
              wired to live moderation data.
            </Text>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {achievementHighlights.map((item) => (
              <Card key={item}>
                <CardBody>
                  <IconBox variant="tertiary">
                    <IconCertificate />
                  </IconBox>
                  <Text className="mt-4 font-medium">{item}</Text>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <Heading className="text-2xl">Need help choosing a path?</Heading>
          <Text className="mt-2 text-muted">
            Talk to Cogito support or start by browsing available tutors.
          </Text>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant="secondary"
            nativeButton={false}
            render={
              <a
                href="https://wa.me/6288101190195"
                target="_blank"
                rel="noreferrer"
                aria-label="Contact Cogito through WhatsApp"
              />
            }
          >
            WhatsApp support
            <IconBrandWhatsapp />
          </Button>
          <Button
            nativeButton={false}
            render={
              <Link
                to="/login"
                search={{ redirect: "/tutors" }}
                aria-label="Browse tutors"
              />
            }
          >
            Browse tutors
            <IconUsersGroup />
          </Button>
        </div>
      </section>
    </main>
  );
}
