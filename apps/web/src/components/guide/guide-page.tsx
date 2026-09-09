"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconRoute,
  IconSparkles,
} from "@tabler/icons-react";

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
  ItemMeta,
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";
import { Tabs, TabsItem, TabsList } from "@cogito-app/ui/components/selia/tabs";
import { Text, TextLink } from "@cogito-app/ui/components/selia/text";
import { cn } from "@cogito-app/ui/lib/utils";

import {
  type GuideBranch,
  type GuideChapter,
  type GuideCta,
  type GuideHighlight,
  type GuideStatus,
  type GuideStep,
  type GuideTone,
  type GuideView,
  GUIDE_CONTENT,
  GUIDE_VIEW_META,
  getAllowedGuideViews,
  resolveGuideView,
} from "./guide-content";

const branchItemVariants: Record<
  GuideTone,
  | "outline"
  | "primary-outline"
  | "tertiary-outline"
  | "info-outline"
  | "success-outline"
  | "warning-outline"
  | "danger-outline"
> = {
  primary: "primary-outline",
  secondary: "outline",
  tertiary: "tertiary-outline",
  info: "info-outline",
  success: "success-outline",
  warning: "warning-outline",
  danger: "danger-outline",
};

function GuideCopy({ text }: { text: string }): ReactNode {
  const occurrences = new Map<string, number>();

  return text.split(/(\*\*[^*]+\*\*)/g).map((part) => {
    const occurrence = occurrences.get(part) ?? 0;
    occurrences.set(part, occurrence + 1);

    return part.startsWith("**") && part.endsWith("**") ? (
      <strong
        key={`${part}-${occurrence}`}
        className="font-semibold text-foreground"
      >
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    );
  });
}

export function GuidePage({
  role,
  requestedView,
}: {
  role?: string;
  requestedView?: GuideView;
}) {
  const view = resolveGuideView(role, requestedView);
  return <GuidePageContent key={view} role={role} view={view} />;
}

function GuidePageContent({ role, view }: { role?: string; view: GuideView }) {
  const navigate = useNavigate();
  const allowedViews = getAllowedGuideViews(role);
  const content = GUIDE_CONTENT[view];
  const stepIds = content.chapters.flatMap((chapter) =>
    chapter.steps.map((step) => step.id),
  );
  const [expandedStepIds, setExpandedStepIds] = useState(
    () => new Set(stepIds),
  );
  const [activeChapterId, setActiveChapterId] = useState(
    content.chapters[0]?.id ?? "",
  );

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleChapter = entries
          .filter((entry) => entry.isIntersecting)
          .toSorted(
            (first, second) =>
              first.boundingClientRect.top - second.boundingClientRect.top,
          )[0];
        if (visibleChapter) setActiveChapterId(visibleChapter.target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    for (const chapter of content.chapters) {
      const element = document.getElementById(chapter.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [content.chapters]);

  function toggleStep(stepId: string) {
    setExpandedStepIds((current) => {
      const next = new Set(current);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }

  const allExpanded =
    stepIds.length > 0 && expandedStepIds.size === stepIds.length;
  const stepOffsets = content.chapters.map((_, chapterIndex) =>
    content.chapters
      .slice(0, chapterIndex)
      .reduce((total, chapter) => total + chapter.steps.length, 0),
  );

  return (
    <main
      className="mx-auto w-full max-w-7xl space-y-6 pb-12 sm:space-y-8 sm:pb-16"
      data-testid="guide-page"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Text className="text-sm font-medium text-muted">Cogito guide</Text>
          <Text className="text-sm text-dimmed">
            Choose the perspective you want to explore.
          </Text>
        </div>
        <Tabs
          value={view}
          onValueChange={(nextValue) => {
            if (!allowedViews.includes(nextValue as GuideView)) return;
            void navigate({
              to: "/guide",
              search: { view: nextValue as GuideView },
            });
          }}
          className="w-full sm:w-auto"
        >
          <TabsList aria-label="Choose a guide by role" className="w-full">
            {allowedViews.map((allowedView) => (
              <TabsItem key={allowedView} value={allowedView}>
                {GUIDE_VIEW_META[allowedView].shortLabel}
              </TabsItem>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <GuideHero content={content} />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-10">
        <GuideChapterNav
          chapters={content.chapters}
          activeChapterId={activeChapterId}
          onNavigate={setActiveChapterId}
        />
        <div className="min-w-0">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <Heading size="sm" level={2}>
                Your journey with Cogito
              </Heading>
              <Text className="mt-1 text-sm text-muted">
                Follow the flow from start to finish.
              </Text>
            </div>
            <Button
              variant="tertiary"
              size="sm"
              className="shrink-0"
              onClick={() =>
                setExpandedStepIds(allExpanded ? new Set() : new Set(stepIds))
              }
              aria-label={
                allExpanded ? "Collapse all details" : "Expand all details"
              }
            >
              {allExpanded ? "Collapse all" : "Expand all"}
            </Button>
          </div>

          <div className="space-y-10 sm:space-y-14">
            {content.chapters.map((chapter, chapterIndex) => {
              return (
                <GuideChapterSection
                  key={chapter.id}
                  chapter={chapter}
                  chapterNumber={chapterIndex + 1}
                  stepOffset={stepOffsets[chapterIndex] ?? 0}
                  expandedStepIds={expandedStepIds}
                  onToggleStep={toggleStep}
                />
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}

function GuideHero({
  content,
}: {
  content: (typeof GUIDE_CONTENT)[GuideView];
}) {
  return (
    <Card className="overflow-hidden">
      <CardBody className="grid gap-8 p-5! sm:p-8! xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)] xl:gap-12 xl:p-10!">
        <div className="flex min-w-0 flex-col justify-center">
          <Badge variant="primary" className="mb-5 w-fit">
            Start here
          </Badge>
          <Heading
            size="lg"
            className="max-w-3xl text-balance text-3xl leading-tight tracking-tight sm:text-5xl"
          >
            {content.title}
          </Heading>
          <Text className="mt-4 max-w-2xl text-pretty text-muted sm:text-lg sm:leading-7">
            <GuideCopy text={content.description} />
          </Text>
          <div className="mt-6 flex items-center gap-2 text-sm font-medium text-foreground">
            <IconRoute className="size-4 text-primary" aria-hidden="true" />
            {content.chapters.length} chapters, explained step by step
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          {content.highlights.map((highlight, index) => (
            <GuideFact
              key={highlight.label}
              highlight={highlight}
              index={index}
            />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function GuideFact({
  highlight,
  index,
}: {
  highlight: GuideHighlight;
  index: number;
}) {
  const HighlightIcon = highlight.icon;
  return (
    <div className="flex min-w-0 gap-3 rounded-lg bg-accent p-4">
      <IconBox
        variant={index === 0 ? "primary-subtle" : "info-subtle"}
        size="sm"
      >
        <HighlightIcon />
      </IconBox>
      <div className="min-w-0">
        <Text className="text-xs font-medium uppercase tracking-wide text-muted">
          {highlight.label}
        </Text>
        <Text className="mt-0.5 font-semibold text-foreground">
          {highlight.value}
        </Text>
        <Text className="mt-1 text-sm leading-5 text-muted">
          <GuideCopy text={highlight.description} />
        </Text>
      </div>
    </div>
  );
}

function GuideChapterNav({
  chapters,
  activeChapterId,
  onNavigate,
}: {
  chapters: GuideChapter[];
  activeChapterId: string;
  onNavigate: (chapterId: string) => void;
}) {
  return (
    <nav
      aria-label="Guide chapters"
      className="min-w-0 xl:sticky xl:top-0 xl:self-start"
    >
      <Text className="mb-3 hidden text-xs font-semibold uppercase tracking-wider text-dimmed xl:block">
        In this guide
      </Text>
      <ol className="-mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 xl:flex-col xl:scroll-pl-0 xl:overflow-visible xl:pb-0">
        {chapters.map((chapter, index) => {
          const isActive = activeChapterId === chapter.id;
          return (
            <li key={chapter.id} className="shrink-0 snap-start xl:w-full">
              <Item
                render={
                  <a
                    href={`#${chapter.id}`}
                    aria-label={chapter.title}
                    aria-current={isActive ? "location" : undefined}
                    onClick={() => onNavigate(chapter.id)}
                  />
                }
                variant="plain"
                size="sm"
                className={cn(
                  "min-w-[12rem] rounded-lg! px-3! py-2.5! no-underline xl:min-w-0",
                  isActive ? "bg-accent!" : "hover:bg-accent/60!",
                )}
              >
                <ItemMedia
                  className={cn(
                    "flex size-7 items-center justify-center rounded font-mono text-xs tabular-nums",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-accent text-muted",
                  )}
                >
                  {String(index + 1).padStart(2, "0")}
                </ItemMedia>
                <ItemContent className="min-w-0 gap-0.5">
                  <ItemTitle className="text-sm">{chapter.title}</ItemTitle>
                  <ItemMeta className="text-xs">
                    {chapter.steps.length} steps
                  </ItemMeta>
                </ItemContent>
              </Item>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function GuideChapterSection({
  chapter,
  chapterNumber,
  stepOffset,
  expandedStepIds,
  onToggleStep,
}: {
  chapter: GuideChapter;
  chapterNumber: number;
  stepOffset: number;
  expandedStepIds: Set<string>;
  onToggleStep: (stepId: string) => void;
}) {
  const ChapterIcon = chapter.icon;
  return (
    <section id={chapter.id} className="scroll-mt-6">
      <div className="mb-5 flex items-start gap-3 sm:mb-6">
        <IconBox variant="tertiary-subtle" size="md">
          <ChapterIcon />
        </IconBox>
        <div className="min-w-0">
          <Text className="text-xs font-semibold text-dimmed">
            Chapter {chapterNumber}
          </Text>
          <Heading size="sm" level={3} className="mt-1 text-balance">
            {chapter.title}
          </Heading>
          <Text className="mt-1 max-w-3xl text-sm text-pretty text-muted">
            <GuideCopy text={chapter.description} />
          </Text>
        </div>
      </div>
      <div className="space-y-3">
        {chapter.steps.map((step, index) => (
          <GuideStepCard
            key={step.id}
            step={step}
            stepNumber={stepOffset + index + 1}
            isExpanded={expandedStepIds.has(step.id)}
            onToggle={() => onToggleStep(step.id)}
          />
        ))}
      </div>
    </section>
  );
}

function GuideStepCard({
  step,
  stepNumber,
  isExpanded,
  onToggle,
}: {
  step: GuideStep;
  stepNumber: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const StepIcon = step.icon;
  const detailsId = `${step.id}-details`;
  return (
    <Card className={cn("transition-shadow", isExpanded && "shadow-card")}>
      <CardHeader className="p-0! border-none">
        <button
          type="button"
          className="col-span-full grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-xl p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:gap-4 sm:p-5"
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          onClick={onToggle}
        >
          <div className="relative">
            <IconBox variant="info-subtle" size="md">
              <StepIcon />
            </IconBox>
            <span className="absolute -bottom-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground font-mono text-[0.625rem] text-background ring-2 ring-card">
              {stepNumber}
            </span>
          </div>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <CardTitle level={4} className="text-base leading-5 sm:text-lg">
                {step.title}
              </CardTitle>
              <Badge variant="info" size="sm">
                {step.actor}
              </Badge>
            </span>
            <CardDescription className="mt-1.5 text-sm leading-5 sm:text-base sm:leading-6">
              <GuideCopy text={step.summary} />
            </CardDescription>
          </span>
          <IconChevronDown
            className={cn(
              "mt-1 size-5 shrink-0 text-dimmed transition-transform motion-reduce:transition-none",
              isExpanded && "rotate-180 text-foreground",
            )}
            aria-hidden="true"
          />
        </button>
      </CardHeader>
      <div
        id={detailsId}
        aria-hidden={!isExpanded}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <CardBody className="border-t border-card-separator p-4! sm:p-5!">
            <GuideStepDetails step={step} />
          </CardBody>
        </div>
      </div>
    </Card>
  );
}

function GuideStepDetails({ step }: { step: GuideStep }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div>
          <Text className="mb-3 text-sm font-semibold">What happens</Text>
          <ul className="space-y-2.5">
            {step.details.map((detail) => (
              <li
                key={detail}
                className="flex gap-2.5 text-sm leading-6 text-muted"
              >
                <IconCheck
                  className="mt-1 size-4 shrink-0 text-success"
                  aria-hidden="true"
                />
                <span>
                  <GuideCopy text={detail} />
                </span>
              </li>
            ))}
          </ul>
        </div>
        {step.statuses?.length ? (
          <div>
            <Text className="mb-3 text-sm font-semibold">
              Possible statuses
            </Text>
            <div className="flex flex-wrap gap-2">
              {step.statuses.map((status) => (
                <GuideStatusBadge key={status.label} status={status} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {step.branches?.length ? (
        <div>
          <Text className="mb-3 text-sm font-semibold">If plans change</Text>
          <div className="grid gap-3 xl:grid-cols-2">
            {step.branches.map((branch) => (
              <GuideBranchCard key={branch.title} branch={branch} />
            ))}
          </div>
        </div>
      ) : null}
      {step.cta ? <GuideCta cta={step.cta} /> : null}
    </div>
  );
}

function GuideStatusBadge({ status }: { status: GuideStatus }) {
  return (
    <Badge variant={status.variant} pill>
      {status.label}
    </Badge>
  );
}

function GuideBranchCard({ branch }: { branch: GuideBranch }) {
  return (
    <Item
      variant={branchItemVariants[branch.variant]}
      size="sm"
      direction="column"
      className="gap-2.5 p-4"
    >
      <ItemTitle className="flex items-center gap-2">
        <IconSparkles className="size-4" aria-hidden="true" />
        {branch.title}
      </ItemTitle>
      <ItemDescription>
        <span className="font-medium text-foreground">When:</span>{" "}
        <GuideCopy text={branch.trigger} />
      </ItemDescription>
      <ItemDescription>
        <span className="font-medium text-foreground">Then:</span>{" "}
        <GuideCopy text={branch.outcome} />
      </ItemDescription>
      {branch.cta ? <GuideCta cta={branch.cta} /> : null}
    </Item>
  );
}

function GuideCta({ cta }: { cta: GuideCta }) {
  return (
    <TextLink
      render={<Link to={cta.to} aria-label={cta.label} />}
      className="inline-flex w-fit items-center gap-1.5 font-medium text-primary no-underline hover:underline"
    >
      {cta.label}
      <IconArrowRight className="size-4" aria-hidden="true" />
    </TextLink>
  );
}
