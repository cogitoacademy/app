"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  IconArrowRight,
  IconCheck,
  IconChevronDown,
} from "@tabler/icons-react";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemMeta,
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import {
  Tabs,
  TabsItem,
  TabsList,
  TabsPanel,
} from "@cogito-app/ui/components/selia/tabs";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text, TextLink } from "@cogito-app/ui/components/selia/text";
import { Separator } from "@cogito-app/ui/components/selia/separator";
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

function getGuideStepIds(content: (typeof GUIDE_CONTENT)[GuideView]) {
  return content.chapters.flatMap((chapter) =>
    chapter.steps.map((step) => step.id),
  );
}

function GuideCopy({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  const occurrences = new Map<string, number>();

  return parts.map((part) => {
    const occurrence = occurrences.get(part) ?? 0;
    occurrences.set(part, occurrence + 1);

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong
          key={`${part}-${occurrence}`}
          className="font-semibold text-foreground"
        >
          {part.slice(2, -2)}
        </strong>
      );
    }

    return part;
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
  const firstChapterId = content.chapters[0]?.id ?? null;
  const stepIds = getGuideStepIds(content);
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(
    () => new Set(stepIds),
  );
  const [activeChapterId, setActiveChapterId] = useState<string | null>(
    firstChapterId,
  );

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleChapter = entries
          .filter(
            (entry) => entry.isIntersecting && entry.boundingClientRect.height,
          )
          .toSorted(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];

        if (visibleChapter) {
          setActiveChapterId(visibleChapter.target.id);
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );

    for (const chapter of content.chapters) {
      const element = document.getElementById(chapter.id);
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, [content.chapters]);

  useEffect(() => {
    if (
      !import.meta.env.DEV ||
      document.querySelector("script[data-antislop-tweaks]")
    ) {
      return;
    }

    const script = document.createElement("script");
    script.src = "/tweaks-bar.js";
    script.dataset.antislopTweaks = "true";
    document.body.appendChild(script);
  }, []);

  function changeView(nextView: GuideView) {
    void navigate({
      to: "/guide",
      search: { view: nextView },
    });
  }

  function toggleStep(stepId: string) {
    setExpandedStepIds((current) => {
      const next = new Set(current);

      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }

      return next;
    });
  }

  function toggleAllSteps() {
    setExpandedStepIds((current) =>
      current.size === stepIds.length ? new Set() : new Set(stepIds),
    );
  }

  const allStepsExpanded =
    stepIds.length > 0 && expandedStepIds.size === stepIds.length;

  return (
    <div className="mx-auto flex flex-col gap-8" data-testid="guide-page">
      <Tabs
        value={view}
        onValueChange={(nextValue) => {
          if (allowedViews.includes(nextValue as GuideView)) {
            changeView(nextValue as GuideView);
          }
        }}
        className="gap-8"
      >
        <TabsPanel value={view} className="flex flex-col gap-8">
          <div className="grid min-w-0 gap-8 lg:grid-cols-[16rem_auto_minmax(0,1fr)]">
            <div className="space-y-5">
              <GuideViewSwitcher allowedViews={allowedViews} />
              <Separator />
              <GuideChapterNav
                chapters={content.chapters}
                activeChapterId={activeChapterId}
                onNavigate={setActiveChapterId}
              />
            </div>
            <Separator orientation="vertical" />
            <div className="order-first flex min-w-0 flex-col gap-8 lg:order-last">
              <GuideHero content={content} />
              <div className="flex min-w-0 flex-col gap-4">
                <div className="flex justify-end">
                  <Button
                    variant="plain"
                    size="sm"
                    aria-label={
                      allStepsExpanded
                        ? "Collapse all guide details"
                        : "Expand all guide details"
                    }
                    onClick={toggleAllSteps}
                  >
                    {allStepsExpanded ? "Collapse details" : "Expand details"}
                  </Button>
                </div>
                <div className="flex min-w-0 flex-col gap-10">
                  {content.chapters.map((chapter, chapterIndex) => (
                    <GuideChapterSection
                      key={chapter.id}
                      chapter={chapter}
                      chapterNumber={chapterIndex + 1}
                      stepOffset={content.chapters
                        .slice(0, chapterIndex)
                        .reduce(
                          (total, previousChapter) =>
                            total + previousChapter.steps.length,
                          0,
                        )}
                      expandedStepIds={expandedStepIds}
                      onToggleStep={toggleStep}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </TabsPanel>
      </Tabs>
    </div>
  );
}

function GuideViewSwitcher({
  allowedViews,
}: {
  allowedViews: readonly GuideView[];
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-wrap">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        Guide view
      </div>
      <TabsList aria-label="Guide view">
        {allowedViews.map((allowedView) => (
          <TabsItem key={allowedView} value={allowedView}>
            {GUIDE_VIEW_META[allowedView].shortLabel}
          </TabsItem>
        ))}
      </TabsList>
    </div>
  );
}

function GuideHero({
  content,
}: {
  content: (typeof GUIDE_CONTENT)[GuideView];
}) {
  return (
    <section className="border-b border-border pb-8 sm:pb-10">
      <div className="max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-muted">
          <span>{content.label}</span>
          <span className="text-dimmed" aria-hidden="true">
            /
          </span>
          <span>How Cogito works</span>
        </div>
        <Heading
          size="lg"
          className="max-w-3xl font-sans text-[2.25rem] leading-[1.1] tracking-[-0.025em] text-balance sm:text-5xl"
        >
          {content.title}
        </Heading>
        <Text className="mt-4 max-w-2xl text-pretty text-muted">
          <GuideCopy text={content.description} />
        </Text>
      </div>
      <GuideFactsRail highlights={content.highlights} />
    </section>
  );
}

function GuideFactsRail({ highlights }: { highlights: GuideHighlight[] }) {
  return (
    <dl className="mt-8 grid border-t border-border pt-6 sm:grid-cols-3 sm:gap-8">
      {highlights.map((highlight, index) => (
        <GuideFact
          key={highlight.label}
          highlight={highlight}
          emphasis={index === 0}
        />
      ))}
    </dl>
  );
}

function GuideFact({
  highlight,
  emphasis,
}: {
  highlight: GuideHighlight;
  emphasis: boolean;
}) {
  return (
    <div className="min-w-0 border-b border-border pb-5 last:border-b-0 sm:border-b-0 sm:pb-0">
      <dt className="text-sm font-medium text-muted">{highlight.label}</dt>
      <dd
        className={cn(
          "mt-1 font-semibold text-foreground",
          emphasis ? "text-lg" : "text-base",
        )}
      >
        {highlight.value}
      </dd>
      <Text className="mt-1 max-w-[22rem] text-sm text-muted">
        <GuideCopy text={highlight.description} />
      </Text>
    </div>
  );
}

function GuideChapterNav({
  chapters,
  activeChapterId,
  onNavigate,
}: {
  chapters: GuideChapter[];
  activeChapterId: string | null;
  onNavigate: (chapterId: string) => void;
}) {
  const activeChapterIndex = Math.max(
    chapters.findIndex((chapter) => chapter.id === activeChapterId),
    0,
  );

  return (
    <nav
      aria-label="Guide chapters"
      className="order-first min-w-0 lg:order-last lg:sticky lg:top-6 lg:self-start"
    >
      <div className="py-5 lg:py-1">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
            On this journey
          </div>
          <span
            aria-label={`Chapter ${activeChapterIndex + 1} of ${chapters.length}`}
            className="shrink-0 font-mono text-xs tabular-nums text-dimmed"
          >
            {String(activeChapterIndex + 1).padStart(2, "0")} /{" "}
            {String(chapters.length).padStart(2, "0")}
          </span>
        </div>
        <ol className="mt-4 flex flex-col gap-1.5">
          {chapters.map((chapter, index) => {
            const isActive = activeChapterId === chapter.id;

            return (
              <li key={chapter.id}>
                <Item
                  render={
                    <a
                      href={`#${chapter.id}`}
                      aria-label={chapter.title}
                      aria-current={isActive ? "location" : undefined}
                      onClick={() => onNavigate(chapter.id)}
                    />
                  }
                  data-slot="item"
                  variant="plain"
                  size="sm"
                  className={cn(
                    "group min-w-0 items-start rounded-md! px-3! py-2.5! no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    isActive
                      ? "bg-accent! text-foreground"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  <ItemMedia
                    className={cn(
                      "mt-0.5 flex size-6 items-center justify-center rounded-sm bg-info/15 font-mono text-[0.6875rem] text-info ring-1 ring-info/25 transition-colors tabular-nums flex-items-center justify-center",
                      isActive && "bg-info text-info-foreground ring-info",
                    )}
                  >
                    {String(index + 1)}
                  </ItemMedia>
                  <ItemContent className="min-w-0 gap-0.5">
                    <ItemTitle
                      className={cn(
                        "min-w-0 text-sm leading-snug",
                        isActive && "font-semibold",
                      )}
                    >
                      {chapter.title}
                    </ItemTitle>
                    <ItemMeta className="text-xs">
                      {chapter.steps.length}{" "}
                      {chapter.steps.length === 1 ? "step" : "steps"}
                    </ItemMeta>
                  </ItemContent>
                </Item>
              </li>
            );
          })}
        </ol>
      </div>
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
    <section
      id={chapter.id}
      className="scroll-mt-6 border-t border-border pt-7 first:border-t-0 first:pt-0"
    >
      <div className="mb-4 flex flex-col items-start gap-3">
        <Badge variant="tertiary">Step {chapterNumber}</Badge>
        <div className="min-w-0">
          <div className="flex items-center gap-x-2">
            <Heading size="md" level={2}>
              {chapter.title}
            </Heading>
            <ChapterIcon className="size-4" />
          </div>
          <Text className="mt-1 max-w-3xl text-muted">
            <GuideCopy text={chapter.description} />
          </Text>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {chapter.steps.map((step, index) => (
          <GuideStepRow
            key={step.id}
            step={step}
            stepNumber={stepOffset + index + 1}
            isLast={index === chapter.steps.length - 1}
            isExpanded={expandedStepIds.has(step.id)}
            onToggle={() => onToggleStep(step.id)}
          />
        ))}
      </div>
    </section>
  );
}

function GuideStepRow({
  step,
  stepNumber,
  isLast,
  isExpanded,
  onToggle,
}: {
  step: GuideStep;
  stepNumber: number;
  isLast: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const detailsId = `${step.id}-details`;

  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] gap-3 py-2 transition-colors duration-200 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4 pl-1 pr-4 rounded-lg ",
        isExpanded && "bg-accent/50",
        "motion-reduce:transition-none",
      )}
    >
      <div className="flex min-h-full flex-col items-center py-1">
        <Badge
          variant="tertiary"
          pill
          className="flex aspect-square items-center justify-center"
        >
          {stepNumber}
        </Badge>
        {!isLast ? <div className="my-2 w-px flex-1 bg-border" /> : null}
      </div>
      <div className="min-w-0">
        <button
          type="button"
          className="group flex w-full touch-manipulation items-start gap-3 rounded-md text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:gap-4 motion-reduce:transition-none"
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          onClick={onToggle}
        >
          <span className="min-w-0 flex-1 mt-1">
            <div className="flex items-center gap-2 font-medium text-foreground">
              {step.title}
              <Badge variant="info" size="sm">
                {step.actor}
              </Badge>
            </div>
            <span className="mt-1 block text-sm leading-relaxed text-muted">
              <GuideCopy text={step.summary} />
            </span>
          </span>
          <IconChevronDown
            className={cn(
              "mt-1 size-5 shrink-0 text-dimmed transition-[transform,color] duration-200 motion-reduce:transform-none motion-reduce:transition-none",
              isExpanded && "rotate-180 text-foreground",
            )}
            aria-hidden="true"
          />
        </button>
        <div
          id={detailsId}
          aria-hidden={!isExpanded}
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
            isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div
            className={cn(
              "min-h-0 overflow-hidden transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transform-none motion-reduce:transition-none",
              isExpanded
                ? "visible translate-y-0 opacity-100"
                : "invisible pointer-events-none opacity-0",
            )}
          >
            <div className="px-2 pb-3 pt-3 sm:px-2">
              <GuideStepDetails step={step} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GuideStepDetails({ step }: { step: GuideStep }) {
  return (
    <Stack spacing="lg">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,0.6fr)]">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            Details:
          </div>
          <ul className="flex flex-col gap-2">
            {step.details.map((detail) => (
              <li
                key={detail}
                className="flex gap-2 text-sm leading-relaxed text-muted"
              >
                <IconCheck
                  className="mt-0.5 size-4 shrink-0 text-foreground"
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
            <div className="mb-2 text-sm font-medium text-foreground">
              Possible states:
            </div>
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
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            If plans change:
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {step.branches.map((branch) => (
              <GuideBranchCard key={branch.title} branch={branch} />
            ))}
          </div>
        </div>
      ) : null}
      {step.cta ? <GuideCta cta={step.cta} /> : null}
    </Stack>
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
      <ItemTitle>{branch.title}</ItemTitle>
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
