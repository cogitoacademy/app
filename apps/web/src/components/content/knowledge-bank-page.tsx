"use client";

import { IconBook2, IconEye, IconLock, IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
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
import { Input } from "@cogito-app/ui/components/selia/input";
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

import { EmptyStateCard } from "@/components/empty-state";
import { serverUrl } from "@/lib/server-url";
import { orpc } from "@/utils/orpc";
import { getCategoryLabel } from "./knowledge-bank-utils";

type Resource = {
  id: string;
  title: string;
  description: string | null;
  category: string;
};

function resourceFileUrl(resourceId: string) {
  return `${serverUrl}/content/knowledge-bank/${encodeURIComponent(resourceId)}/file`;
}

export function KnowledgeBankPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    null,
  );
  const resources = useQuery(orpc.content.listStudentResources.queryOptions());

  const resourceItems = resources.data?.items;
  const items = useMemo(
    () => (resourceItems ?? []) as Resource[],
    [resourceItems],
  );
  const access = resources.data?.access;
  const categories = useMemo(
    () => [...new Set(items.map((item) => item.category))].toSorted(),
    [items],
  );
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory = category === "all" || item.category === category;
      const matchesSearch =
        !query ||
        item.title.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [category, items, search]);
  const hasFilters = category !== "all" || search.trim().length > 0;

  if (resources.isPending) {
    return (
      <Stack direction="column" spacing="lg">
        <div>
          <Heading>Knowledge Bank</Heading>
          <Text className="mt-1 text-muted">Loading learning materials…</Text>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-48 animate-pulse rounded-lg border border-border bg-accent/30"
            />
          ))}
        </div>
      </Stack>
    );
  }

  if (resources.isError) {
    return (
      <EmptyStateCard
        icon={<IconBook2 />}
        title="Knowledge Bank unavailable"
        description="We could not load the learning materials. Please try again later."
        action={
          <Button onClick={() => void resources.refetch()}>Try again</Button>
        }
      />
    );
  }

  if (!access?.eligible) {
    return (
      <EmptyStateCard
        icon={<IconLock />}
        tone="warning"
        title="Knowledge Bank is locked"
        description={`Keep at least ${access?.threshold ?? 35} Marks in your wallet to unlock the learning materials. Your current balance is ${access?.balance ?? 0} Marks.`}
        action={
          <Button
            nativeButton={false}
            render={<Link to="/balance" aria-label="Open Marks balance" />}
          >
            Open balance
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Stack direction="column" spacing="lg">
        <div>
          <div className="flex items-center gap-2">
            <IconBook2 className="size-6 text-primary" />
            <Heading>Knowledge Bank</Heading>
          </div>
          <Text className="mt-1 max-w-2xl text-muted">
            Explore curated learning materials for your academic and competition
            goals.
          </Text>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search resources"
              aria-label="Search resources"
              className="pl-9"
            />
          </div>
          <Select
            value={category}
            onValueChange={(value) =>
              setCategory(typeof value === "string" ? value : "all")
            }
          >
            <SelectTrigger className="sm:w-52" aria-label="Filter by category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectPopup>
              <SelectList>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((item) => (
                  <SelectItem key={item} value={item}>
                    {getCategoryLabel(item)}
                  </SelectItem>
                ))}
              </SelectList>
            </SelectPopup>
          </Select>
        </div>

        {filteredItems.length === 0 ? (
          <EmptyStateCard
            icon={hasFilters ? <IconSearch /> : <IconBook2 />}
            title={hasFilters ? "No matching resources" : "No resources yet"}
            description={
              hasFilters
                ? "Try a different search term or category."
                : "Learning materials will appear here when they are published."
            }
            tone="secondary"
            size="compact"
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((resource) => (
              <Card key={resource.id} className="flex flex-col">
                <CardHeader className="h-full items-start!">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="line-clamp-2">
                      {resource.title}
                    </CardTitle>
                    <Badge variant="info" size="sm" className="shrink-0">
                      PDF
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-3">
                    {resource.description ||
                      "Curated Cogito learning material."}
                  </CardDescription>
                </CardHeader>
                <CardBody className="flex items-center justify-between gap-3">
                  <Badge variant="secondary" size="sm">
                    {getCategoryLabel(resource.category)}
                  </Badge>
                  <Button
                    size="sm"
                    onClick={() => setSelectedResource(resource)}
                  >
                    <IconEye /> View
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </Stack>

      <Dialog
        open={selectedResource !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedResource(null);
        }}
      >
        <DialogPopup className="max-w-5xl">
          {selectedResource ? (
            <>
              <DialogHeader className="items-start">
                <div className="min-w-0">
                  <DialogTitle>{selectedResource.title}</DialogTitle>
                  <DialogDescription>
                    {getCategoryLabel(selectedResource.category)} resource
                  </DialogDescription>
                </div>
              </DialogHeader>
              <DialogBody className="min-h-0">
                <iframe
                  title={selectedResource.title}
                  src={resourceFileUrl(selectedResource.id)}
                  sandbox="allow-same-origin"
                  className="h-[60svh] min-h-96 w-full rounded border border-border bg-background"
                />
              </DialogBody>
              <DialogFooter>
                <DialogClose>Close</DialogClose>
                <Button
                  nativeButton={false}
                  render={
                    <a
                      href={resourceFileUrl(selectedResource.id)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${selectedResource.title} in a new tab`}
                    />
                  }
                >
                  Open in new tab
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogPopup>
      </Dialog>
    </>
  );
}
