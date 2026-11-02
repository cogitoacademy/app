"use client";

import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  IconPlus,
  IconSearch,
  IconChevronRight,
  IconTrash,
  IconCirclePlus,
  IconAdjustmentsHorizontal,
} from "@tabler/icons-react";

import type {
  AdminBlogCategoryDto,
  BlogLocale,
  BlogVersionStatus,
} from "@cogito-app/api/modules/blog/blog.types";
import {
  Drawer,
  DrawerPopup,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
} from "@cogito-app/ui/components/selia/drawer";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@cogito-app/ui/components/selia/dialog";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
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
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@cogito-app/ui/components/selia/table";
import {
  Tabs,
  TabsList,
  TabsItem,
  TabsPanel,
} from "@cogito-app/ui/components/selia/tabs";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { client } from "@/utils/orpc";
import Loader from "@/components/loader";
import { getUserFacingError } from "@/lib/error-message";
import { slugify } from "./blog-api";

const LIST_KEY = ["adminBlog", "list"] as const;
const CATEGORY_KEY = ["adminBlog", "categories"] as const;

const STATUS_LABEL: Record<BlogVersionStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  published: "Published",
  archived: "Archived",
};

function statusVariant(status: BlogVersionStatus | null) {
  if (status === "published") return "success" as const;
  if (status === "in_review") return "warning" as const;
  if (status === "archived") return "danger" as const;
  return "secondary" as const;
}

export function BlogListPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<AdminBlogCategoryDto | null>(
    null,
  );
  const [categorySearch, setCategorySearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [tab, setTab] = useState("articles");
  const [editingCategory, setEditingCategory] =
    useState<AdminBlogCategoryDto | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [parentId, setParentId] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [locale, setLocale] = useState<string>("all");
  const [categoryTitleId, setCategoryTitleId] = useState("");
  const [categoryTitleEn, setCategoryTitleEn] = useState("");
  const [categorySlugId, setCategorySlugId] = useState("");
  const [categorySlugEn, setCategorySlugEn] = useState("");
  const [categoryIntroId, setCategoryIntroId] = useState("");
  const [categoryIntroEn, setCategoryIntroEn] = useState("");
  const activeFilterCount =
    (status !== "all" ? 1 : 0) + (locale !== "all" ? 1 : 0);

  const list = useQuery({
    queryKey: [...LIST_KEY, status, locale],
    queryFn: () =>
      client.adminBlog.list({
        limit: 50,
        ...(status !== "all" ? { status: status as BlogVersionStatus } : {}),
        ...(locale !== "all" ? { locale: locale as BlogLocale } : {}),
      }),
  });

  const categories = useQuery({
    queryKey: CATEGORY_KEY,
    queryFn: () => client.adminBlog.categories.list(),
  });

  const create = useMutation({
    mutationFn: () => client.adminBlog.createArticle({}),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: LIST_KEY });
      void navigate({
        to: "/admin-blog/$articleId",
        params: { articleId: result.articleId },
      });
    },
    onError: (error) =>
      toastManager.add({
        title: "Article could not be created",
        description: getUserFacingError(error),
        type: "error",
      }),
  });

  const createCategory = useMutation({
    mutationFn: () => {
      const input = {
        parentId: parentId || null,
        titleId: categoryTitleId,
        titleEn: categoryTitleEn,
        slugId: categorySlugId || slugify(categoryTitleId),
        slugEn: categorySlugEn || slugify(categoryTitleEn),
        introId: categoryIntroId || null,
        introEn: categoryIntroEn || null,
      };
      return editingCategory
        ? client.adminBlog.categories.update({
            ...input,
            categoryId: editingCategory.id,
            expectedVersion: editingCategory.version,
            isActive: editingCategory.isActive,
          })
        : client.adminBlog.categories.create(input);
    },
    onSuccess: async () => {
      setCategoryOpen(false);
      setParentId("");
      setCategoryTitleId("");
      setCategoryTitleEn("");
      setCategorySlugId("");
      setCategorySlugEn("");
      setCategoryIntroId("");
      setCategoryIntroEn("");
      await queryClient.invalidateQueries({ queryKey: CATEGORY_KEY });
      toastManager.add({
        title: editingCategory ? "Category updated" : "Category created",
        type: "success",
      });
    },
    onError: (error) =>
      toastManager.add({
        title: "Category could not be saved",
        description: getUserFacingError(error),
        type: "error",
      }),
  });

  const deleteCategory = useMutation({
    mutationFn: (category: AdminBlogCategoryDto) =>
      client.adminBlog.categories.delete({
        categoryId: category.id,
        expectedVersion: category.version,
      }),
    onSuccess: async () => {
      setDeleteTarget(null);
      setCategoryOpen(false);
      await queryClient.invalidateQueries({ queryKey: CATEGORY_KEY });
      toastManager.add({ title: "Category deleted", type: "success" });
    },
    onError: (error) =>
      toastManager.add({
        title: "Category could not be deleted",
        description: getUserFacingError(error),
        type: "error",
      }),
  });
  const activeCategories = categories.data ?? [];

  function openCategory(category: AdminBlogCategoryDto | null, parent = "") {
    setEditingCategory(category);
    setParentId(category?.parentId ?? parent);
    setCategoryTitleId(category?.titleId ?? "");
    setCategoryTitleEn(category?.titleEn ?? "");
    setCategorySlugId(category?.slugId ?? "");
    setCategorySlugEn(category?.slugEn ?? "");
    setCategoryIntroId(category?.introId ?? "");
    setCategoryIntroEn(category?.introEn ?? "");
    setCategoryOpen(true);
  }
  const query = categorySearch.trim().toLocaleLowerCase();
  const matches = (category: AdminBlogCategoryDto) =>
    `${category.titleId} ${category.titleEn}`
      .toLocaleLowerCase()
      .includes(query);
  const groups = activeCategories
    .filter((category) => !category.parentId)
    .map((parent) => ({
      parent,
      children: activeCategories.filter(
        (child) => child.parentId === parent.id,
      ),
    }))
    .filter(
      (group) =>
        !query || matches(group.parent) || group.children.some(matches),
    );

  return (
    <Stack spacing="lg" className="w-full min-w-0 max-w-full">
      <Stack
        direction="row"
        className="min-w-0 items-end justify-between gap-4"
      >
        <div className="min-w-0">
          <Heading level={1}>Blog</Heading>
          <p className="text-sm text-muted">
            Write both languages, publish each one independently.
          </p>
        </div>
      </Stack>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(String(value))}
        className="min-w-0 max-w-full"
      >
        <div className="flex w-full min-w-0 max-w-full flex-wrap items-center justify-between gap-3">
          <TabsList aria-label="Blog management" className="w-fit">
            <TabsItem value="articles">Blog</TabsItem>
            <TabsItem value="categories">Categories</TabsItem>
          </TabsList>
          {tab === "articles" ? (
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              <Button
                variant={activeFilterCount > 0 ? "secondary" : "outline"}
                size="icon"
                aria-label={
                  activeFilterCount > 0
                    ? `Toggle blog filters (${activeFilterCount} active)`
                    : "Toggle blog filters"
                }
                title="Filters"
                aria-expanded={filtersOpen}
                aria-controls="blog-article-filters"
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <IconAdjustmentsHorizontal aria-hidden="true" />
              </Button>
              <Button
                disabled={create.isPending}
                onClick={() => create.mutate()}
              >
                <IconPlus />
                {create.isPending ? "Creating…" : "New draft"}
              </Button>
            </div>
          ) : (
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:max-w-md sm:flex-1">
              <div className="relative min-w-0 flex-1">
                <IconSearch
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted"
                />
                <Input
                  aria-label="Search categories and subcategories"
                  className="pl-9"
                  placeholder="Find a category or subcategory…"
                  value={categorySearch}
                  onChange={(event) => setCategorySearch(event.target.value)}
                />
              </div>
              <Button
                size="icon"
                aria-label="Create category"
                title="Create category"
                onClick={() => openCategory(null)}
              >
                <IconPlus aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
        <TabsPanel value="articles" className="min-w-0 max-w-full">
          <div
            id="blog-article-filters"
            aria-hidden={!filtersOpen}
            className={`grid w-full min-w-0 max-w-full transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${filtersOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
          >
            <div
              className="min-h-0 w-full min-w-0 max-w-full overflow-hidden"
              inert={!filtersOpen}
            >
              <Card className="m-px">
                <CardBody className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:p-6">
                  <Field className="w-full sm:w-auto sm:min-w-40">
                    <FieldLabel>Status</FieldLabel>
                    <Select
                      value={status}
                      onValueChange={(value) => setStatus(value as string)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectList>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="in_review">In review</SelectItem>
                          <SelectItem value="published">Published</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectList>
                      </SelectPopup>
                    </Select>
                  </Field>
                  <Field className="w-full sm:w-auto sm:min-w-32">
                    <FieldLabel>Language</FieldLabel>
                    <Select
                      value={locale}
                      onValueChange={(value) => setLocale(value as string)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectList>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="id">Indonesian</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                        </SelectList>
                      </SelectPopup>
                    </Select>
                  </Field>
                </CardBody>
              </Card>
            </div>
          </div>
          <section className="min-w-0 max-w-full space-y-5 py-4">
            {list.isPending ? (
              <Loader />
            ) : (
              <div>
                <Stack spacing="md">
                  <TableContainer>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Article</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>ID</TableHead>
                          <TableHead>EN</TableHead>
                          <TableHead>Updated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(list.data?.rows ?? []).map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              <Link
                                className="font-medium underline-offset-4 hover:underline"
                                to="/admin-blog/$articleId"
                                params={{ articleId: row.id }}
                              >
                                {row.titleId ||
                                  row.titleEn ||
                                  "Untitled article"}
                              </Link>
                            </TableCell>
                            <TableCell>
                              {row.categoryTitle || "Uncategorized"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(row.statusId)}>
                                {row.statusId
                                  ? STATUS_LABEL[row.statusId]
                                  : "Missing"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(row.statusEn)}>
                                {row.statusEn
                                  ? STATUS_LABEL[row.statusEn]
                                  : "Missing"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {new Date(row.updatedAt).toLocaleDateString(
                                "id-ID",
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {list.data?.rows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5}>
                              No articles yet. Start with a new draft.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Stack>
              </div>
            )}
          </section>
        </TabsPanel>
        <TabsPanel value="categories">
          <section className="space-y-3 py-4" aria-label="Category groups">
            <p role="status" className="text-sm text-muted">
              {categories.isPending
                ? ""
                : categories.isFetching
                  ? "Updating…"
                  : `${groups.length} groups`}
            </p>
            <TableContainer>
              <Table className="min-w-3xl">
                <TableHeader>
                  <TableRow>
                    <TableHead>Category / subcategory</TableHead>
                    <TableHead className="w-20">Articles</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map(({ parent, children }) => {
                    const open = expandedCategories.has(parent.id) || !!query;
                    return (
                      <Fragment key={parent.id}>
                        <TableRow className="[&>td]:py-1">
                          <TableCell>
                            <Button
                              variant="plain"
                              size="xs"
                              className="justify-start"
                              aria-expanded={open}
                              aria-label={`${open ? "Collapse" : "Expand"} ${parent.titleId}`}
                              onClick={() =>
                                setExpandedCategories((previous) => {
                                  const next = new Set(previous);
                                  if (next.has(parent.id))
                                    next.delete(parent.id);
                                  else next.add(parent.id);
                                  return next;
                                })
                              }
                            >
                              <IconChevronRight
                                aria-hidden="true"
                                className={
                                  open
                                    ? "rotate-90 transition-transform"
                                    : "transition-transform"
                                }
                              />
                              <span className="font-medium">
                                {parent.titleId}
                              </span>
                              <span className="text-muted">
                                ({children.length})
                              </span>
                            </Button>
                          </TableCell>
                          <TableCell>{parent.articleCount}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                parent.isActive ? "success" : "secondary"
                              }
                            >
                              {parent.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="plain"
                                size="xs"
                                aria-label={`Edit ${parent.titleId}`}
                                title="Edit category"
                                onClick={() => openCategory(parent)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="plain"
                                size="xs"
                                aria-label={`Add subcategory to ${parent.titleId}`}
                                title="Add subcategory"
                                onClick={() => openCategory(null, parent.id)}
                              >
                                <IconCirclePlus aria-hidden="true" /> Add
                                subcategory
                              </Button>
                              <Button
                                variant="plain"
                                size="xs-icon"
                                aria-label={`Delete ${parent.titleId}`}
                                title="Delete category"
                                onClick={() => setDeleteTarget(parent)}
                              >
                                <IconTrash aria-hidden="true" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {open
                          ? children
                              .filter(
                                (child) =>
                                  !query || matches(parent) || matches(child),
                              )
                              .map((child) => (
                                <TableRow
                                  key={child.id}
                                  className="[&>td]:py-0.5"
                                >
                                  <TableCell className="pl-8 sm:pl-12">
                                    <Button
                                      variant="plain"
                                      size="xs"
                                      onClick={() => openCategory(child)}
                                    >
                                      {child.titleId}
                                    </Button>
                                  </TableCell>
                                  <TableCell>{child.articleCount}</TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        child.isActive ? "success" : "secondary"
                                      }
                                    >
                                      {child.isActive ? "Active" : "Inactive"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="plain"
                                      size="xs"
                                      aria-label={`Edit ${child.titleId}`}
                                      title="Edit subcategory"
                                      onClick={() => openCategory(child)}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      variant="plain"
                                      size="xs-icon"
                                      aria-label={`Delete ${child.titleId}`}
                                      title="Delete subcategory"
                                      onClick={() => setDeleteTarget(child)}
                                    >
                                      <IconTrash aria-hidden="true" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))
                          : null}
                      </Fragment>
                    );
                  })}
                  {!groups.length ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        {categories.isPending ? (
                          <Loader />
                        ) : categories.isError ? (
                          "Categories could not be loaded."
                        ) : query ? (
                          "No matching categories."
                        ) : (
                          "No categories yet. Create your first category."
                        )}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TableContainer>
          </section>
        </TabsPanel>
      </Tabs>
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleteCategory.isPending) setDeleteTarget(null);
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>
              Delete {deleteTarget?.parentId ? "subcategory" : "category"}?
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">
              Delete “{deleteTarget?.titleId}”? This cannot be undone.
              Categories with articles or subcategories must be emptied first.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="plain"
              disabled={deleteCategory.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={deleteCategory.isPending}
              onClick={() => {
                if (deleteTarget) deleteCategory.mutate(deleteTarget);
              }}
            >
              {deleteCategory.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
      <Drawer open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DrawerPopup className="max-w-2xl">
          <DrawerHeader>
            <DrawerTitle>
              {editingCategory ? "Edit category" : "Create category"}
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            <Stack spacing="md">
              <Field>
                <FieldLabel>Parent category</FieldLabel>
                <Select
                  disabled={
                    !!editingCategory &&
                    activeCategories.some(
                      (category) => category.parentId === editingCategory.id,
                    )
                  }
                  value={parentId}
                  onValueChange={(value) => setParentId(String(value ?? ""))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None — top-level category" />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectList>
                      <SelectItem value="">
                        None — top-level category
                      </SelectItem>
                      {activeCategories
                        .filter(
                          (category) =>
                            !category.parentId &&
                            category.isActive &&
                            category.id !== editingCategory?.id,
                        )
                        .map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.titleId}
                          </SelectItem>
                        ))}
                    </SelectList>
                  </SelectPopup>
                </Select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Indonesian title</FieldLabel>
                  <Input
                    value={categoryTitleId}
                    onChange={(event) => setCategoryTitleId(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>English title</FieldLabel>
                  <Input
                    value={categoryTitleEn}
                    onChange={(event) => setCategoryTitleEn(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Indonesian slug</FieldLabel>
                  <Input
                    placeholder={slugify(categoryTitleId)}
                    value={categorySlugId}
                    onChange={(event) => setCategorySlugId(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>English slug</FieldLabel>
                  <Input
                    placeholder={slugify(categoryTitleEn)}
                    value={categorySlugEn}
                    onChange={(event) => setCategorySlugEn(event.target.value)}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Indonesian introduction</FieldLabel>
                  <Textarea
                    rows={5}
                    maxLength={3000}
                    placeholder="150-300 words for an indexable hub."
                    value={categoryIntroId}
                    onChange={(event) => setCategoryIntroId(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>English introduction</FieldLabel>
                  <Textarea
                    rows={5}
                    maxLength={3000}
                    placeholder="150-300 words for an indexable hub."
                    value={categoryIntroEn}
                    onChange={(event) => setCategoryIntroEn(event.target.value)}
                  />
                </Field>
              </div>
            </Stack>
          </DrawerBody>
          <DrawerFooter>
            <Button variant="plain" onClick={() => setCategoryOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                createCategory.isPending ||
                !categoryTitleId.trim() ||
                !categoryTitleEn.trim()
              }
              onClick={() => createCategory.mutate()}
            >
              {editingCategory ? "Save category" : "Create category"}
            </Button>
          </DrawerFooter>
        </DrawerPopup>
      </Drawer>
    </Stack>
  );
}
