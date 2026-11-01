"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  IconDeviceFloppy,
  IconPhotoPlus,
  IconTrash,
} from "@tabler/icons-react";

import type {
  AdminBlogArticleDto,
  AdminBlogVersionDto,
  BlogBlock,
  BlogLocale,
  BlogMediaDto,
  SaveBlogVersionInput,
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
  Tabs,
  TabsItem,
  TabsList,
  TabsPanel,
} from "@cogito-app/ui/components/selia/tabs";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { client } from "@/utils/orpc";
import { getUserFacingError } from "@/lib/error-message";
import { resolveProfileImageUrl } from "@/lib/profile-image-url";
import { BlogBodyEditor } from "./blog-body-editor";
import { slugify, uploadBlogImage } from "./blog-api";

type Draft = Omit<
  SaveBlogVersionInput,
  "articleId" | "locale" | "expectedVersion"
>;

const EMPTY_DRAFT: Draft = {
  slug: "",
  title: "",
  seoTitle: "",
  metaDescription: "",
  lead: "",
  mainKeyword: null,
  secondaryKeywords: null,
  keyFacts: [],
  body: [],
  faq: [],
  heroAlt: null,
};

function draftFrom(version: AdminBlogVersionDto | null): Draft {
  if (!version) return { ...EMPTY_DRAFT };
  return {
    slug: version.slug,
    title: version.title,
    seoTitle: version.seoTitle,
    metaDescription: version.metaDescription,
    lead: version.lead,
    mainKeyword: version.mainKeyword,
    secondaryKeywords: version.secondaryKeywords,
    keyFacts: version.keyFacts,
    body: version.body,
    faq: version.faq,
    heroAlt: version.heroAlt,
  };
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "In review",
  published: "Published",
  archived: "Archived",
};

export function BlogEditorPage({ articleId }: { articleId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const article = useQuery({
    queryKey: ["adminBlog", "get", articleId],
    queryFn: () => client.adminBlog.get({ articleId }),
  });
  const categories = useQuery({
    queryKey: ["adminBlog", "categories"],
    queryFn: () => client.adminBlog.categories.list(),
  });
  const tutors = useQuery({
    queryKey: ["adminBlog", "tutors"],
    queryFn: () => client.adminBlog.tutors(),
  });

  const [drafts, setDrafts] = useState<Record<BlogLocale, Draft>>({
    id: { ...EMPTY_DRAFT },
    en: { ...EMPTY_DRAFT },
  });
  const [versions, setVersions] = useState<
    Record<BlogLocale, AdminBlogVersionDto | null>
  >({ id: null, en: null });
  const [shared, setShared] = useState({
    categoryId: "",
    subcategoryId: "",
    featuredTutorId: "",
    reviewedByTutorId: "",
    internalNotes: "",
  });
  const [heroMedia, setHeroMedia] = useState<BlogMediaDto | null>(null);
  const [gallery, setGallery] = useState<AdminBlogArticleDto["gallery"]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeLocale, setActiveLocale] = useState<BlogLocale>("id");
  const initialized = useRef<string | null>(null);

  useEffect(() => {
    const data = article.data;
    if (!data || initialized.current === data.id) return;
    initialized.current = data.id;
    setDrafts({
      id: draftFrom(data.versions.id),
      en: draftFrom(data.versions.en),
    });
    setVersions({ id: data.versions.id, en: data.versions.en });
    setShared({
      categoryId: data.category.id,
      subcategoryId: data.subcategory?.id ?? "",
      featuredTutorId: data.featuredTutor?.id ?? "",
      reviewedByTutorId: data.reviewedByTutor?.id ?? "",
      internalNotes: data.internalNotes ?? "",
    });
    setHeroMedia(data.heroMedia);
    setGallery(data.gallery);
  }, [article.data]);

  const mediaOptions = useMemo(() => {
    const map = new Map<string, BlogMediaDto>();
    if (heroMedia) map.set(heroMedia.id, heroMedia);
    for (const image of gallery) map.set(image.id, image);
    return [...map.values()];
  }, [heroMedia, gallery]);

  function toastError(title: string, error: unknown) {
    toastManager.add({
      title,
      description: getUserFacingError(error),
      type: "error",
    });
  }

  const saveShared = useMutation({
    mutationFn: () =>
      client.adminBlog.updateArticle({
        articleId,
        expectedVersion: article.data!.version,
        categoryId: shared.categoryId,
        subcategoryId: shared.subcategoryId || null,
        featuredTutorId: shared.featuredTutorId || null,
        reviewedByTutorId: shared.reviewedByTutorId || null,
        internalNotes: shared.internalNotes || null,
      }),
    onSuccess: async () => {
      await article.refetch();
      toastManager.add({ title: "Shared details saved", type: "success" });
    },
    onError: (error) => toastError("Shared details could not be saved", error),
  });

  async function saveVersion(locale: BlogLocale) {
    const current = versions[locale];
    const draft = drafts[locale];
    const saved = await client.adminBlog.saveVersion({
      articleId,
      locale,
      expectedVersion: current?.version ?? 0,
      ...draft,
    });
    setVersions((value) => ({ ...value, [locale]: saved }));
    setDrafts((value) => ({ ...value, [locale]: draftFrom(saved) }));
    return saved;
  }

  const saveOne = useMutation({
    mutationFn: (locale: BlogLocale) => saveVersion(locale),
    onSuccess: async () => {
      await article.refetch();
      toastManager.add({ title: "Language version saved", type: "success" });
    },
    onError: (error) =>
      toastError("Language version could not be saved", error),
  });

  const publish = useMutation({
    mutationFn: async (locale: BlogLocale) => {
      const saved = await saveVersion(locale);
      return client.adminBlog.publishVersion({
        articleId,
        locale,
        expectedVersion: saved.version,
      });
    },
    onSuccess: async (result) => {
      setVersions((value) => ({ ...value, [result.locale]: result }));
      setDrafts((value) => ({ ...value, [result.locale]: draftFrom(result) }));
      await article.refetch();
      toastManager.add({ title: "Published", type: "success" });
    },
    onError: (error) => toastError("Article could not be published", error),
  });

  const unpublish = useMutation({
    mutationFn: (locale: BlogLocale) =>
      client.adminBlog.unpublishVersion({
        articleId,
        locale,
        expectedVersion: versions[locale]!.version,
      }),
    onSuccess: async (_result, locale) => {
      await article.refetch();
      toastManager.add({
        title: `Unpublished ${locale.toUpperCase()}`,
        type: "success",
      });
    },
    onError: (error) => toastError("Article could not be unpublished", error),
  });

  const archive = useMutation({
    mutationFn: () =>
      client.adminBlog.archiveArticle({
        articleId,
        expectedVersion: article.data!.version,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["adminBlog", "list"] });
      navigate({ to: "/admin-blog" });
    },
    onError: (error) => toastError("Article could not be archived", error),
  });

  async function handleUpload(
    file: File | undefined,
    target: "hero" | "gallery",
  ) {
    if (!file) return;
    setUploading(true);
    try {
      const media = await uploadBlogImage(file);
      if (target === "hero") {
        setHeroMedia(media);
        await client.adminBlog.updateArticle({
          articleId,
          expectedVersion: article.data!.version,
          heroMediaId: media.id,
        });
      } else {
        const next = [
          ...gallery,
          { ...media, sortOrder: gallery.length, altId: null, altEn: null },
        ];
        setGallery(next);
        await client.adminBlog.replaceGallery({
          articleId,
          expectedVersion: article.data!.version,
          images: next.map((image) => ({
            mediaId: image.id,
            altId: image.altId,
            altEn: image.altEn,
          })),
        });
      }
      await article.refetch();
      toastManager.add({ title: "Image uploaded", type: "success" });
    } catch (error) {
      toastError("Image could not be uploaded", error);
    } finally {
      setUploading(false);
    }
  }

  if (article.isLoading)
    return <p className="text-sm text-muted">Loading article…</p>;
  if (article.isError || !article.data) {
    return <p className="text-sm text-danger">Article could not be loaded.</p>;
  }

  const data = article.data;
  const rootCategories = (categories.data ?? []).filter(
    (category) => !category.parentId && category.isActive,
  );
  const children = (categories.data ?? []).filter(
    (category) => category.parentId === shared.categoryId,
  );

  function renderVersion(locale: BlogLocale) {
    const draft = drafts[locale];
    const version = versions[locale];
    return (
      <Stack spacing="md">
        <div className="grid gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel>Title</FieldLabel>
            <Input
              value={draft.title}
              onChange={(event) =>
                setDrafts((value) => ({
                  ...value,
                  [locale]: { ...value[locale], title: event.target.value },
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel>SEO title (max 60)</FieldLabel>
            <Input
              value={draft.seoTitle}
              onChange={(event) =>
                setDrafts((value) => ({
                  ...value,
                  [locale]: { ...value[locale], seoTitle: event.target.value },
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel>
              Slug {version?.publishedAt ? "(locked)" : ""}
            </FieldLabel>
            <Input
              disabled={!!version?.publishedAt}
              value={draft.slug}
              onChange={(event) =>
                setDrafts((value) => ({
                  ...value,
                  [locale]: { ...value[locale], slug: event.target.value },
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel>Meta description (max 155)</FieldLabel>
            <Input
              value={draft.metaDescription}
              onChange={(event) =>
                setDrafts((value) => ({
                  ...value,
                  [locale]: {
                    ...value[locale],
                    metaDescription: event.target.value,
                  },
                }))
              }
            />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel>Lead</FieldLabel>
            <Textarea
              rows={3}
              value={draft.lead}
              onChange={(event) =>
                setDrafts((value) => ({
                  ...value,
                  [locale]: { ...value[locale], lead: event.target.value },
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel>Main keyword</FieldLabel>
            <Input
              value={draft.mainKeyword ?? ""}
              onChange={(event) =>
                setDrafts((value) => ({
                  ...value,
                  [locale]: {
                    ...value[locale],
                    mainKeyword: event.target.value || null,
                  },
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel>Secondary keywords (comma separated)</FieldLabel>
            <Input
              value={(draft.secondaryKeywords ?? []).join(", ")}
              onChange={(event) =>
                setDrafts((value) => ({
                  ...value,
                  [locale]: {
                    ...value[locale],
                    secondaryKeywords: event.target.value
                      ? event.target.value
                          .split(",")
                          .map((keyword) => keyword.trim())
                          .filter(Boolean)
                      : null,
                  },
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel>Hero alt text</FieldLabel>
            <Input
              value={draft.heroAlt ?? ""}
              onChange={(event) =>
                setDrafts((value) => ({
                  ...value,
                  [locale]: {
                    ...value[locale],
                    heroAlt: event.target.value || null,
                  },
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel>Key facts (one per line)</FieldLabel>
            <Textarea
              rows={3}
              value={draft.keyFacts.map((fact) => fact.text).join("\n")}
              onChange={(event) =>
                setDrafts((value) => ({
                  ...value,
                  [locale]: {
                    ...value[locale],
                    keyFacts: event.target.value
                      .split("\n")
                      .map((text) => text.trim())
                      .filter(Boolean)
                      .map((text) => ({ text })),
                  },
                }))
              }
            />
          </Field>
        </div>

        <Field>
          <FieldLabel>Body</FieldLabel>
          <BlogBodyEditor
            blocks={draft.body}
            onChange={(body: BlogBlock[]) =>
              setDrafts((value) => ({
                ...value,
                [locale]: { ...value[locale], body },
              }))
            }
            media={mediaOptions}
          />
        </Field>

        <Stack direction="row" className="flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={saveOne.isPending}
            onClick={() => saveOne.mutate(locale)}
          >
            <IconDeviceFloppy />
            Save {locale.toUpperCase()}
          </Button>
          <Button
            disabled={publish.isPending}
            onClick={() => publish.mutate(locale)}
          >
            Publish {locale.toUpperCase()}
          </Button>
          {version?.status === "published" ? (
            <Button
              variant="danger"
              disabled={unpublish.isPending}
              onClick={() => unpublish.mutate(locale)}
            >
              Unpublish
            </Button>
          ) : null}
          <Badge variant="secondary">
            {version ? STATUS_LABEL[version.status] : "Not started"}
          </Badge>
          <span className="text-xs text-muted">
            Saving as {slugify(draft.slug || draft.title) || "draft"}
          </span>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack spacing="lg">
      <Stack
        direction="row"
        className="flex-wrap items-end justify-between gap-3"
      >
        <div>
          <Heading level={1}>
            {drafts.id.title || drafts.en.title || "Untitled article"}
          </Heading>
          <p className="text-sm text-muted">
            ID: {versions.id ? STATUS_LABEL[versions.id.status] : "not started"}{" "}
            · EN:{" "}
            {versions.en ? STATUS_LABEL[versions.en.status] : "not started"}
          </p>
        </div>
        <Button
          variant="danger"
          disabled={!!data.archivedAt || archive.isPending}
          onClick={() => {
            if (
              window.confirm(
                "Archive this article? Both languages will stop serving.",
              )
            ) {
              archive.mutate();
            }
          }}
        >
          <IconTrash />
          {data.archivedAt ? "Archived" : "Archive"}
        </Button>
      </Stack>

      <Card>
        <CardHeader>
          <CardTitle>Shared details</CardTitle>
        </CardHeader>
        <CardBody>
          <Stack spacing="md">
            <div className="grid gap-3 md:grid-cols-2">
              <Field>
                <FieldLabel>Category</FieldLabel>
                <Select
                  value={shared.categoryId}
                  onValueChange={(value) =>
                    setShared((current) => ({
                      ...current,
                      categoryId: String(value ?? ""),
                      subcategoryId: "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectList>
                      {rootCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.titleId}
                        </SelectItem>
                      ))}
                    </SelectList>
                  </SelectPopup>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Subcategory</FieldLabel>
                <Select
                  value={shared.subcategoryId}
                  onValueChange={(value) =>
                    setShared((current) => ({
                      ...current,
                      subcategoryId: String(value ?? ""),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectList>
                      {children.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.titleId}
                        </SelectItem>
                      ))}
                    </SelectList>
                  </SelectPopup>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Featured tutor</FieldLabel>
                <Select
                  value={shared.featuredTutorId}
                  onValueChange={(value) =>
                    setShared((current) => ({
                      ...current,
                      featuredTutorId: String(value ?? ""),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectList>
                      {(tutors.data ?? []).map((tutor) => (
                        <SelectItem key={tutor.id} value={tutor.id}>
                          {tutor.name}
                        </SelectItem>
                      ))}
                    </SelectList>
                  </SelectPopup>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Reviewed by</FieldLabel>
                <Select
                  value={shared.reviewedByTutorId}
                  onValueChange={(value) =>
                    setShared((current) => ({
                      ...current,
                      reviewedByTutorId: String(value ?? ""),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectList>
                      {(tutors.data ?? []).map((tutor) => (
                        <SelectItem key={tutor.id} value={tutor.id}>
                          {tutor.name}
                        </SelectItem>
                      ))}
                    </SelectList>
                  </SelectPopup>
                </Select>
              </Field>
            </div>

            <Stack direction="row" className="flex-wrap items-center gap-3">
              <Field className="flex-1">
                <FieldLabel>Hero image</FieldLabel>
                <Input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={(event) =>
                    void handleUpload(event.target.files?.[0], "hero")
                  }
                />
              </Field>
              {heroMedia ? (
                <img
                  alt={drafts.id.heroAlt ?? ""}
                  className="h-16 w-24 rounded-md object-cover"
                  src={resolveProfileImageUrl(heroMedia.url) ?? heroMedia.url}
                />
              ) : null}
            </Stack>

            <Field>
              <FieldLabel>Gallery</FieldLabel>
              <Stack direction="row" className="flex-wrap items-center gap-2">
                {gallery.map((image) => (
                  <div className="relative" key={image.id}>
                    <img
                      alt={image.altId ?? ""}
                      className="h-16 w-24 rounded-md object-cover"
                      src={resolveProfileImageUrl(image.url) ?? image.url}
                    />
                  </div>
                ))}
                <label className="inline-flex">
                  <input
                    className="hidden"
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(event) =>
                      void handleUpload(event.target.files?.[0], "gallery")
                    }
                  />
                  <Button
                    variant="secondary"
                    nativeButton={false}
                    render={<span />}
                  >
                    <IconPhotoPlus />
                    Add image
                  </Button>
                </label>
              </Stack>
            </Field>

            <Field>
              <FieldLabel>Internal notes</FieldLabel>
              <Textarea
                rows={3}
                value={shared.internalNotes}
                onChange={(event) =>
                  setShared((current) => ({
                    ...current,
                    internalNotes: event.target.value,
                  }))
                }
              />
            </Field>

            <Button
              disabled={saveShared.isPending}
              onClick={() => saveShared.mutate()}
            >
              Save shared details
            </Button>
          </Stack>
        </CardBody>
      </Card>

      <Tabs
        value={activeLocale}
        onValueChange={(value) => setActiveLocale(value === "en" ? "en" : "id")}
      >
        <TabsList>
          <TabsItem value="id">Indonesian</TabsItem>
          <TabsItem value="en">English</TabsItem>
        </TabsList>
        <TabsPanel value="id">{renderVersion("id")}</TabsPanel>
        <TabsPanel value="en">{renderVersion("en")}</TabsPanel>
      </Tabs>
    </Stack>
  );
}
