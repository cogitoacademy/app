"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconSearch } from "@tabler/icons-react";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  InputGroup,
  InputGroupAddon,
} from "@cogito-app/ui/components/selia/input-group";
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { orpc } from "@/utils/orpc";
import { TutorCard } from "./tutor-card";
import { TutorDrawer } from "./tutor-drawer";

const EXPERTISE_OPTIONS = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "Economics",
  "English",
  "History",
  "Other",
];

type PublishedTutor = {
  id: string;
  displayName: string | null;
  shortBio: string | null;
  credentialsSummary: string | null;
  expertise: string[] | null;
  modality: string | null;
  prices: Record<string, number> | null;
  availabilitySummary: string | null;
  proofUrls: string[] | null;
  publishedAt: Date | null;
  user: { name: string | null; image: string | null } | null;
};

export function TutorsPageContent() {
  const [search, setSearch] = useState("");
  const [expertise, setExpertise] = useState("");
  const [modality, setModality] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: tutors = [], isLoading } = useQuery(
    orpc.tutors.listPublished.queryOptions({
      search: search || undefined,
      expertise: expertise || undefined,
      modality: (modality || undefined) as
        | "online"
        | "offline"
        | "both"
        | undefined,
    }),
  );

  const selected = selectedId
    ? (tutors.find((t: PublishedTutor) => t.id === selectedId) ?? null)
    : null;

  return (
    <Stack direction="column" spacing="lg">
      <div>
        <Heading size="md">Tutors</Heading>
        <Text className="text-muted">
          Browse our verified tutors and find the right fit.
        </Text>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <IconSearch className="size-4" />
          </InputGroupAddon>
          <Input
            placeholder="Search by name or bio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <Select
          value={expertise}
          onValueChange={(v) => setExpertise(v as string)}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Expertise" />
          </SelectTrigger>
          <SelectPopup>
            <SelectList>
              <SelectItem value="">All</SelectItem>
              {EXPERTISE_OPTIONS.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectList>
          </SelectPopup>
        </Select>
        <Select
          value={modality}
          onValueChange={(v) => setModality(v as string)}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Modality" />
          </SelectTrigger>
          <SelectPopup>
            <SelectList>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectList>
          </SelectPopup>
        </Select>
      </div>

      {isLoading ? (
        <Text className="py-8 text-center text-muted">Loading tutors...</Text>
      ) : tutors.length === 0 ? (
        <Text className="py-8 text-center text-muted">
          No tutors found matching your criteria.
        </Text>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {tutors.map((tutor: PublishedTutor) => (
            <TutorCard
              key={tutor.id}
              tutor={tutor}
              onClick={() => setSelectedId(tutor.id)}
            />
          ))}
        </div>
      )}

      <TutorDrawer
        tutor={selected}
        open={!!selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </Stack>
  );
}
