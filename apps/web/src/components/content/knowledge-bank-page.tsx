"use client";

import { IconBook2, IconEye, IconLock, IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
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
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerHandle,
  DrawerHeader,
  DrawerPopup,
  DrawerTitle,
} from "@cogito-app/ui/components/selia/drawer";
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
import { CogitoMarks } from "@/components/cogito-marks";
import Loader from "@/components/loader";
import { useRole } from "@/hooks/use-role";
import { serverUrl } from "@/lib/server-url";
import { orpc } from "@/utils/orpc";
import { getCategoryLabel } from "./knowledge-bank-utils";
import { SanityStudioEditButton } from "./sanity-studio-button";

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
  const [isDesktop, setIsDesktop] = useState(false);
  const resources = useQuery(orpc.content.listStudentResources.queryOptions());
  const { role, isLoading: isRoleLoading } = useRole();
  const isAdmin = !isRoleLoading && role === "admin";

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

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 640px)");
    const updateViewport = () => setIsDesktop(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  if (resources.isPending) return <Loader />;

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
        description={
          <>
            Keep at least
            <CogitoMarks
              value={access?.threshold ?? 35}
              size="3"
              className="mx-1"
            />
            in your wallet to unlock the learning materials. Your current
            balance is
            <CogitoMarks
              value={access?.balance ?? 0}
              size="3"
              className="mx-1"
            />
            .
          </>
        }
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Heading>Learn from curated resources</Heading>
            </div>
            <Text className="mt-1 max-w-2xl text-muted">
              Find focused materials to strengthen your academic and competition
              preparation.
            </Text>
          </div>
          {isAdmin ? (
            <SanityStudioEditButton
              type="studentResource"
              label="Edit resources"
            />
          ) : null}
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

      <Drawer
        open={selectedResource !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedResource(null);
        }}
        swipeDirection={isDesktop ? "right" : "down"}
      >
        <DrawerPopup
          direction={isDesktop ? "right" : "bottom"}
          className={
            isDesktop
              ? "w-full max-w-3xl"
              : "h-[85dvh] max-h-[calc(85dvh+3rem)]"
          }
        >
          {selectedResource ? (
            <>
              {!isDesktop ? <DrawerHandle /> : null}
              <DrawerHeader className="items-start">
                <div className="min-w-0">
                  <DrawerTitle>{selectedResource.title}</DrawerTitle>
                  <DrawerDescription>
                    {getCategoryLabel(selectedResource.category)} resource
                  </DrawerDescription>
                </div>
              </DrawerHeader>
              <DrawerBody className="flex h-full flex-col p-4.5! sm:p-6!">
                {/* Native browser PDF viewers do not run reliably in sandboxed frames. */}
                {/* oxlint-disable react/iframe-missing-sandbox */}
                {/* react-doctor-disable-next-line react-doctor/iframe-missing-sandbox */}
                <iframe
                  title={selectedResource.title}
                  src={resourceFileUrl(selectedResource.id)}
                  className="min-h-0 w-full flex-1 rounded border border-border bg-background"
                />
                {/* oxlint-enable react/iframe-missing-sandbox */}
              </DrawerBody>
              <DrawerFooter>
                <DrawerClose>Close</DrawerClose>
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
              </DrawerFooter>
            </>
          ) : null}
        </DrawerPopup>
      </Drawer>
    </>
  );
}
