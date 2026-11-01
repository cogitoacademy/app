"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { IconPlus } from "@tabler/icons-react";

import type {
  BlogLocale,
  BlogVersionStatus,
} from "@cogito-app/api/modules/blog/blog.types";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@cogito-app/ui/components/selia/table";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { client } from "@/utils/orpc";
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
  const [status, setStatus] = useState<string>("all");
  const [locale, setLocale] = useState<string>("all");
  const [categoryId, setCategoryId] = useState("");
  const [categoryTitleId, setCategoryTitleId] = useState("");
  const [categoryTitleEn, setCategoryTitleEn] = useState("");
  const [categorySlugId, setCategorySlugId] = useState("");
  const [categorySlugEn, setCategorySlugEn] = useState("");

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
    mutationFn: (id: string) =>
      client.adminBlog.createArticle({ categoryId: id }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: LIST_KEY });
      window.location.assign(`/admin-blog/${result.articleId}`);
    },
    onError: (error) =>
      toastManager.add({
        title: "Article could not be created",
        description: getUserFacingError(error),
        type: "error",
      }),
  });

  const createCategory = useMutation({
    mutationFn: () =>
      client.adminBlog.categories.create({
        titleId: categoryTitleId,
        titleEn: categoryTitleEn,
        slugId: categorySlugId || slugify(categoryTitleId),
        slugEn: categorySlugEn || slugify(categoryTitleEn),
      }),
    onSuccess: async () => {
      setCategoryTitleId("");
      setCategoryTitleEn("");
      setCategorySlugId("");
      setCategorySlugEn("");
      await queryClient.invalidateQueries({ queryKey: CATEGORY_KEY });
      toastManager.add({ title: "Category created", type: "success" });
    },
    onError: (error) =>
      toastManager.add({
        title: "Category could not be created",
        description: getUserFacingError(error),
        type: "error",
      }),
  });

  const activeCategories = categories.data ?? [];

  return (
    <Stack spacing="lg">
      <Stack direction="row" className="items-end justify-between gap-4">
        <div>
          <Heading level={1}>Blog</Heading>
          <p className="text-sm text-muted">
            Write both languages, publish each one independently.
          </p>
        </div>
      </Stack>

      <Card>
        <CardHeader>
          <CardTitle>Articles</CardTitle>
        </CardHeader>
        <CardBody>
          <Stack spacing="md">
            <Stack direction="row" className="flex-wrap items-end gap-3">
              <Field className="w-40">
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
              <Field className="w-32">
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
            </Stack>

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
                          {row.titleId || row.titleEn || "Untitled article"}
                        </Link>
                      </TableCell>
                      <TableCell>{row.categoryTitle}</TableCell>
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
                        {new Date(row.updatedAt).toLocaleDateString("id-ID")}
                      </TableCell>
                    </TableRow>
                  ))}
                  {list.data?.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        No articles yet. Create a category, then create the
                        first article.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TableContainer>

            <Stack direction="row" className="flex-wrap items-end gap-3">
              <Field className="min-w-56 flex-1">
                <FieldLabel>New article category</FieldLabel>
                <Select
                  value={categoryId}
                  onValueChange={(value) => setCategoryId(value as string)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectList>
                      {activeCategories
                        .filter(
                          (category) => !category.parentId && category.isActive,
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
              <Button
                disabled={!categoryId || create.isPending}
                onClick={() => create.mutate(categoryId)}
              >
                <IconPlus />
                New article
              </Button>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
        </CardHeader>
        <CardBody>
          <Stack spacing="md">
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
            <Button
              disabled={
                createCategory.isPending ||
                !categoryTitleId.trim() ||
                !categoryTitleEn.trim()
              }
              onClick={() => createCategory.mutate()}
            >
              Add category
            </Button>
            <Stack spacing="sm">
              {activeCategories.map((category) => (
                <div
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  key={category.id}
                >
                  <span>
                    {category.titleId}
                    {category.parentId ? " · subcategory" : ""}
                  </span>
                  <span className="text-muted">
                    {category.articleCount} articles
                  </span>
                </div>
              ))}
            </Stack>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}
