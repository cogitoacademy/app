"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  IconAdjustmentsHorizontal,
  IconChevronDown,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  InputGroup,
  InputGroupAddon,
} from "@cogito-app/ui/components/selia/input-group";
import {
  getSelectItemValue,
  getSelectItemValues,
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { EmptyStateCard } from "@/components/empty-state";
import { orpc } from "@/utils/orpc";
import { TutorCard } from "./tutor-card";
import { TutorDrawer } from "./tutor-drawer";
import type {
  TutorCompetitionAchievement,
  TutorEducationEntry,
} from "./tutor-achievements";
import type { TutorExperienceEntry } from "./tutor-experiences";
import { useSubjectTaxonomy, type TutorSubject } from "./subject-taxonomy";

type PublishedTutor = {
  id: string;
  userId: string;
  displayName: string | null;
  shortBio: string | null;
  credentialsSummary: string | null;
  achievements: string | null;
  experiences: string | null;
  education: TutorEducationEntry[] | null;
  competitionAchievements: TutorCompetitionAchievement[] | null;
  experienceEntries: TutorExperienceEntry[] | null;
  expertise: string[];
  subjects?: TutorSubject[] | null;
  modality: string | null;
  prices: Record<string, number> | null;
  pricesByModality?: Partial<
    Record<"online" | "offline", Record<string, number>>
  > | null;
  publishedAt: Date | null;
  user: { name: string | null; image: string | null } | null;
};

const MODALITY_OPTIONS = [
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
  { value: "both", label: "Both" },
] as const;
const MODALITY_VALUES = new Map<string, (typeof MODALITY_OPTIONS)[number]>(
  MODALITY_OPTIONS.map((option) => [option.value, option]),
);
const TUTOR_LIST_DEBOUNCE_MS = 300;

export function TutorsPageContent() {
  const [search, setSearch] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [modality, setModality] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTutorSnapshot, setSelectedTutorSnapshot] =
    useState<PublishedTutor | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: categories, isError: isTaxonomyError } = useSubjectTaxonomy();

  const selectedCategories = useMemo(
    () => categories.filter((category) => categoryIds.includes(category.id)),
    [categories, categoryIds],
  );
  const availableSubjects = useMemo(() => {
    const subjects = new Map<string, TutorSubject>();

    for (const category of selectedCategories) {
      for (const subject of category.children) {
        subjects.set(subject.id, {
          ...subject,
          isSelectable: true,
          parent: {
            id: category.id,
            slug: category.slug,
            name: category.name,
          },
        });
      }
    }

    return [...subjects.values()];
  }, [selectedCategories]);
  const categoryValues = useMemo(
    () =>
      new Map(
        categories.map((category) => [
          category.id,
          { value: category.id, label: category.name },
        ]),
      ),
    [categories],
  );
  const subjectValues = useMemo(
    () =>
      new Map(
        availableSubjects.map((subject) => [
          subject.id,
          { value: subject.id, label: subject.name },
        ]),
      ),
    [availableSubjects],
  );
  const selectedCategoryValues = useMemo(
    () =>
      categoryIds
        .map((id) => categoryValues.get(id))
        .filter((value): value is NonNullable<typeof value> => value != null),
    [categoryIds, categoryValues],
  );
  const selectedSubjectValues = useMemo(
    () =>
      subjectIds
        .map((id) => subjectValues.get(id))
        .filter((value): value is NonNullable<typeof value> => value != null),
    [subjectIds, subjectValues],
  );
  const tutorListInput = useMemo(
    () => ({
      search: search.trim() || undefined,
      // Keep the singular fields for rolling/stale API instances. The
      // current API prefers the array fields, so multiple selections still
      // use the complete multi-select contract after the server reloads.
      categoryId: categoryIds.length === 1 ? categoryIds[0] : undefined,
      subjectId: subjectIds.length === 1 ? subjectIds[0] : undefined,
      categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
      subjectIds: subjectIds.length > 0 ? subjectIds : undefined,
      modality: (modality || undefined) as
        | "online"
        | "offline"
        | "both"
        | undefined,
    }),
    [categoryIds, modality, search, subjectIds],
  );
  const [debouncedTutorListInput, setDebouncedTutorListInput] =
    useState(tutorListInput);
  const activeFilterCount =
    (categoryIds.length > 0 ? 1 : 0) +
    (subjectIds.length > 0 ? 1 : 0) +
    (modality ? 1 : 0);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedTutorListInput(tutorListInput),
      TUTOR_LIST_DEBOUNCE_MS,
    );

    return () => window.clearTimeout(timer);
  }, [tutorListInput]);
  function handleCategoryChange(value: unknown) {
    const nextCategoryIds = getSelectItemValues(value);
    setCategoryIds(nextCategoryIds);

    const nextSubjectIds = new Set(
      categories
        .filter((category) => nextCategoryIds.includes(category.id))
        .flatMap((category) => category.children.map((subject) => subject.id)),
    );
    setSubjectIds((current) =>
      current.filter((subjectId) => nextSubjectIds.has(subjectId)),
    );
  }

  function clearDiscoveryFilters() {
    setCategoryIds([]);
    setSubjectIds([]);
    setModality("");
  }

  const {
    data: tutors = [],
    isFetching,
    isPending,
  } = useQuery({
    ...orpc.tutors.listPublished.queryOptions({
      input: debouncedTutorListInput,
    }),
    // Keep the current cards visible while search or filters load the next
    // result set, so the page does not collapse between requests.
    placeholderData: keepPreviousData,
  });

  const selected = selectedId
    ? (tutors.find((t: PublishedTutor) => t.id === selectedId) ??
      selectedTutorSnapshot)
    : selectedTutorSnapshot;

  function openTutor(tutorId: string) {
    const nextTutor = tutors.find((t: PublishedTutor) => t.id === tutorId);
    if (!nextTutor) return;

    setDrawerOpen(false);
    setSelectedId(tutorId);
    setSelectedTutorSnapshot(nextTutor);
    requestAnimationFrame(() => setDrawerOpen(true));
  }

  return (
    <Stack
      direction="column"
      spacing="lg"
      className="w-full min-w-0 max-w-full"
    >
      <div>
        <Heading level={1} size="md">
          Book a Session
        </Heading>
        <Text className="text-muted">
          Find a verified tutor by name, field of competition, and
          specialization.
        </Text>
      </div>

      <div className="flex w-full min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:items-center">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <IconSearch className="size-4" />
          </InputGroupAddon>
          <Input
            placeholder="Search tutors or specializations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <Button
          variant={activeFilterCount > 0 ? "secondary" : "outline"}
          className="w-full shrink-0 sm:w-auto"
          aria-expanded={filtersOpen}
          aria-controls="tutor-discovery-filters"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <IconAdjustmentsHorizontal />
          Filters
          {activeFilterCount > 0 ? (
            <Badge
              variant="primary"
              size="sm"
              pill
              className="size-5 justify-center p-0 tabular-nums"
            >
              {activeFilterCount}
            </Badge>
          ) : null}
          <IconChevronDown
            className={`transition-transform duration-200 ease-out motion-reduce:transition-none ${filtersOpen ? "rotate-180" : ""}`}
          />
        </Button>
      </div>

      <div
        id="tutor-discovery-filters"
        aria-hidden={!filtersOpen}
        className={`relative grid w-full min-w-0 max-w-full transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${filtersOpen ? "grid-rows-[1fr] opacity-100" : "-mb-6 grid-rows-[0fr] opacity-0"}`}
      >
        <div
          className="z-0 min-h-0 w-full min-w-0 max-w-full"
          inert={!filtersOpen}
        >
          <Card className="w-full min-w-0 max-w-full">
            <CardBody className="grid w-full min-w-0 max-w-full gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.75fr_auto] lg:items-center">
              <Select
                multiple
                value={selectedCategoryValues}
                onValueChange={handleCategoryChange}
              >
                <SelectTrigger className="min-w-0 w-full">
                  <SelectValue
                    className="min-w-0 flex-1 overflow-visible text-left"
                    placeholder="All categories"
                  />
                </SelectTrigger>
                <SelectPopup>
                  <SelectList>
                    {categories.map((category) => (
                      <SelectItem
                        key={category.id}
                        value={categoryValues.get(category.id)}
                      >
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectList>
                </SelectPopup>
              </Select>
              <Select
                multiple
                value={selectedSubjectValues}
                disabled={categoryIds.length === 0}
                onValueChange={(value) =>
                  setSubjectIds(getSelectItemValues(value))
                }
              >
                <SelectTrigger className="min-w-0 w-full">
                  <SelectValue
                    className="min-w-0 flex-1 overflow-visible text-left"
                    placeholder={
                      categoryIds.length > 0
                        ? "All specializations"
                        : "Choose category first"
                    }
                  />
                </SelectTrigger>
                <SelectPopup>
                  <SelectList>
                    {availableSubjects.map((subject) => (
                      <SelectItem
                        key={subject.id}
                        value={subjectValues.get(subject.id)}
                      >
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectList>
                </SelectPopup>
              </Select>
              <Select
                value={
                  modality ? (MODALITY_VALUES.get(modality) ?? null) : null
                }
                onValueChange={(value) =>
                  setModality(getSelectItemValue(value) ?? "")
                }
              >
                <SelectTrigger className="min-w-0 w-full">
                  <SelectValue
                    className="min-w-0 flex-1 truncate text-left"
                    placeholder="All modalities"
                  />
                </SelectTrigger>
                <SelectPopup>
                  <SelectList>
                    <SelectItem value={{ value: "", label: "All" }}>
                      All modalities
                    </SelectItem>
                    {MODALITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectList>
                </SelectPopup>
              </Select>
              <Button
                variant="plain"
                className="w-full lg:w-auto"
                disabled={activeFilterCount === 0}
                onClick={clearDiscoveryFilters}
              >
                <IconX />
                Clear
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>

      {isTaxonomyError && (
        <Text className="text-muted" role="status">
          Specialization filters are temporarily unavailable. You can still
          search tutors by name or description.
        </Text>
      )}

      {isPending ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {[
            "tutor-skeleton-1",
            "tutor-skeleton-2",
            "tutor-skeleton-3",
            "tutor-skeleton-4",
            "tutor-skeleton-5",
            "tutor-skeleton-6",
          ].map((placeholder) => (
            <TutorCardSkeleton key={placeholder} />
          ))}
        </div>
      ) : tutors.length === 0 ? (
        <EmptyStateCard
          className="z-1"
          icon={<IconSearch />}
          title="No tutors found"
          description="We couldn't find a tutor matching those filters. Try another specialization or reset your search."
          tone="danger"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setSearch("");
                clearDiscoveryFilters();
              }}
            >
              Clear all filters
            </Button>
          }
        />
      ) : (
        <div
          className="grid grid-cols-1 gap-4 xl:grid-cols-2"
          aria-busy={isFetching}
        >
          {tutors.map((tutor: PublishedTutor) => (
            <TutorCard
              key={tutor.id}
              tutor={tutor}
              onClick={() => openTutor(tutor.id)}
            />
          ))}
        </div>
      )}

      <TutorDrawer
        tutor={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </Stack>
  );
}

function TutorCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="h-5 w-32 rounded bg-muted" />
        <div className="h-5 w-16 rounded bg-muted" />
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-2/3 rounded bg-muted" />
        <div className="flex flex-wrap gap-1.5">
          <div className="h-5 w-16 rounded bg-muted" />
          <div className="h-5 w-20 rounded bg-muted" />
          <div className="h-5 w-14 rounded bg-muted" />
        </div>
      </CardBody>
    </Card>
  );
}
