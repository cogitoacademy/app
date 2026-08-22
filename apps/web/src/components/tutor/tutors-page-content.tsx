"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { IconSearch } from "@tabler/icons-react";
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
import { useSubjectTaxonomy, type TutorSubject } from "./subject-taxonomy";

type PublishedTutor = {
  id: string;
  userId: string;
  displayName: string | null;
  shortBio: string | null;
  credentialsSummary: string | null;
  expertise: string[];
  subjects?: TutorSubject[] | null;
  modality: string | null;
  prices: Record<string, number> | null;
  availabilitySummary: string | null;
  proofUrls: string[] | null;
  publishedAt: Date | null;
  user: { name: string | null; image: string | null } | null;
};

const ALL_CATEGORIES_OPTION = { value: "", label: "All categories" };
const ALL_CHILD_SUBJECTS_OPTION = {
  value: "",
  label: "All child subjects",
};
const MODALITY_OPTIONS = [
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
  { value: "both", label: "Both" },
] as const;
const MODALITY_VALUES = new Map<string, (typeof MODALITY_OPTIONS)[number]>(
  MODALITY_OPTIONS.map((option) => [option.value, option]),
);

export function TutorsPageContent() {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [modality, setModality] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: categories, isError: isTaxonomyError } = useSubjectTaxonomy();

  const selectedCategory = categories.find(
    (category) => category.id === categoryId,
  );
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
        (selectedCategory?.children ?? []).map((subject) => [
          subject.id,
          { value: subject.id, label: subject.name },
        ]),
      ),
    [selectedCategory],
  );
  const tutorListInput = useMemo(
    () => ({
      search: search.trim() || undefined,
      categoryId: categoryId || undefined,
      subjectId: subjectId || undefined,
      modality: (modality || undefined) as
        | "online"
        | "offline"
        | "both"
        | undefined,
    }),
    [categoryId, modality, search, subjectId],
  );
  const hasActiveFilter = Boolean(categoryId || subjectId || modality);

  const { data: tutors = [], isPending } = useQuery({
    ...orpc.tutors.listPublished.queryOptions({
      input: tutorListInput,
    }),
    // Keep search results stable while typing, but never show the previous
    // unfiltered list while a category/subject/modality filter is loading.
    placeholderData: hasActiveFilter ? undefined : keepPreviousData,
  });

  const selected = selectedId
    ? (tutors.find((t: PublishedTutor) => t.id === selectedId) ?? null)
    : null;

  function openTutor(tutorId: string) {
    setDrawerOpen(false);
    setSelectedId(tutorId);
    requestAnimationFrame(() => setDrawerOpen(true));
  }

  return (
    <Stack direction="column" spacing="lg">
      <div>
        <Heading size="md">Tutors</Heading>
        <Text className="text-muted">
          Find a verified tutor by name, subject, or learning style.
        </Text>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <IconSearch className="size-4" />
          </InputGroupAddon>
          <Input
            placeholder="Search tutors or subjects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <Select
          value={categoryId ? (categoryValues.get(categoryId) ?? null) : null}
          onValueChange={(value) => {
            setCategoryId(getSelectItemValue(value) ?? "");
            setSubjectId("");
          }}
        >
          <SelectTrigger className="min-w-0 w-full sm:w-52">
            <SelectValue
              className="min-w-0 flex-1 truncate text-left"
              placeholder="All categories"
            />
          </SelectTrigger>
          <SelectPopup>
            <SelectList>
              <SelectItem value={ALL_CATEGORIES_OPTION}>
                All categories
              </SelectItem>
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
          value={subjectId ? (subjectValues.get(subjectId) ?? null) : null}
          disabled={!selectedCategory}
          onValueChange={(value) =>
            setSubjectId(getSelectItemValue(value) ?? "")
          }
        >
          <SelectTrigger className="min-w-0 w-full sm:w-56">
            <SelectValue
              className="min-w-0 flex-1 truncate text-left"
              placeholder={
                selectedCategory
                  ? "All child subjects"
                  : "Choose category first"
              }
            />
          </SelectTrigger>
          <SelectPopup>
            <SelectList>
              <SelectItem value={ALL_CHILD_SUBJECTS_OPTION}>
                All child subjects
              </SelectItem>
              {(selectedCategory?.children ?? []).map((subject) => (
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
          value={modality ? (MODALITY_VALUES.get(modality) ?? null) : null}
          onValueChange={(value) =>
            setModality(getSelectItemValue(value) ?? "")
          }
        >
          <SelectTrigger className="min-w-0 w-full sm:w-44">
            <SelectValue
              className="min-w-0 flex-1 truncate text-left"
              placeholder="All"
            />
          </SelectTrigger>
          <SelectPopup>
            <SelectList>
              <SelectItem value={{ value: "", label: "All" }}>All</SelectItem>
              {MODALITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectList>
          </SelectPopup>
        </Select>
      </div>

      {isTaxonomyError && (
        <Text className="text-muted" role="status">
          Subject filters are temporarily unavailable. You can still search
          tutors by name or description.
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
          icon={<IconSearch />}
          title="No tutors found"
          description="We couldn't find a tutor matching those filters. Try another subject or reset your search."
          tone="secondary"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setSearch("");
                setCategoryId("");
                setSubjectId("");
                setModality("");
              }}
            >
              Clear all filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
