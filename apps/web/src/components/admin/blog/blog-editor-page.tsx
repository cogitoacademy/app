"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import {
  IconPlus,
  IconArrowLeft,
  IconDeviceFloppy,
  IconPhotoPlus,
  IconTrash,
} from "@tabler/icons-react";

import type {
  AdminBlogArticleDto,
  AdminBlogVersionDto,
  BlogLocale,
  BlogMediaDto,
  SaveBlogVersionInput,
} from "@cogito-app/api/modules/blog/blog.types";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@cogito-app/ui/components/selia/dialog";
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
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionPanel,
} from "@cogito-app/ui/components/selia/accordion";
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
  const [archiveOpen, setArchiveOpen] = useState(false);
  const archiveCompleted = useRef(false);
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
    featuredTutorName: "",
    reviewedByName: "",
    featuredTutorId: "",
    reviewedByTutorId: "",
    internalNotes: "",
  });
  const [heroMedia, setHeroMedia] = useState<BlogMediaDto | null>(null);
  const [gallery, setGallery] = useState<AdminBlogArticleDto["gallery"]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeLocale, setActiveLocale] = useState<BlogLocale>("id");
  const [manualPeople, setManualPeople] = useState({
    featured: false,
    reviewer: false,
  });
  const [addedEnglish, setAddedEnglish] = useState<string[]>([]);
  const [initialized, setInitialized] = useState<string | null>(null);

  useEffect(() => {
    const data = article.data;
    if (!data || initialized === data.id) return;
    // Hydrate the draft once per document; query refreshes must preserve unsaved edits.
    // eslint-disable-next-line react/set-state-in-effect
    setInitialized(data.id);
    setDrafts({
      id: draftFrom(data.versions.id),
      en: draftFrom(data.versions.en),
    });
    setVersions({ id: data.versions.id, en: data.versions.en });
    setShared({
      categoryId: data.category?.id ?? "",
      subcategoryId: data.subcategory?.id ?? "",
      featuredTutorName: data.featuredTutorName ?? "",
      reviewedByName: data.reviewedByName ?? "",
      featuredTutorId: data.featuredTutor?.id ?? "",
      reviewedByTutorId: data.reviewedByTutor?.id ?? "",
      internalNotes: data.internalNotes ?? "",
    });
    setManualPeople({
      featured: !!data.featuredTutorName,
      reviewer: !!data.reviewedByName,
    });
    setHeroMedia(data.heroMedia);
    setGallery(data.gallery);
  }, [article.data, initialized]);

  const mediaOptions = useMemo(() => {
    const map = new Map<string, BlogMediaDto>();
    if (heroMedia) map.set(heroMedia.id, heroMedia);
    for (const image of gallery) map.set(image.id, image);
    for (const image of article.data?.bodyMedia ?? []) map.set(image.id, image);
    return [...map.values()];
  }, [heroMedia, gallery, article.data?.bodyMedia]);

  function toastError(title: string, error: unknown) {
    toastManager.add({
      title,
      description: getUserFacingError(error),
      type: "error",
    });
  }

  async function persistShared() {
    await client.adminBlog.updateArticle({
      articleId,
      expectedVersion: article.data!.version,
      categoryId: shared.categoryId || null,
      subcategoryId: shared.subcategoryId || null,
      featuredTutorName: shared.featuredTutorId
        ? null
        : shared.featuredTutorName || null,
      reviewedByName: shared.reviewedByTutorId
        ? null
        : shared.reviewedByName || null,
      featuredTutorId: shared.featuredTutorId || null,
      reviewedByTutorId: shared.reviewedByTutorId || null,
      internalNotes: shared.internalNotes || null,
    });
    await article.refetch();
  }

  async function saveVersion(locale: BlogLocale) {
    const current = versions[locale];
    const draft = drafts[locale];
    const draftSlug = `draft-${articleId}-${locale}`;
    const saved = await client.adminBlog.saveVersion({
      articleId,
      locale,
      expectedVersion: current?.version ?? 0,
      ...draft,
      slug:
        (!draft.slug || draft.slug === draftSlug) && !current?.publishedAt
          ? slugify(draft.title) || draftSlug
          : draft.slug,
      seoTitle: draft.seoTitle || draft.title.slice(0, 60),
    });
    setVersions((value) => ({ ...value, [locale]: saved }));
    setDrafts((value) => ({ ...value, [locale]: draftFrom(saved) }));
    return saved;
  }

  const saveOne = useMutation({
    mutationFn: async (_locale: BlogLocale) => {
      await persistShared();
      await saveVersion("id");
      if (
        versions.en ||
        JSON.stringify(drafts.en) !== JSON.stringify(EMPTY_DRAFT)
      )
        await saveVersion("en");
      return true;
    },
    onSuccess: async () => {
      await article.refetch();
      await queryClient.invalidateQueries({ queryKey: ["adminBlog", "list"] });
      toastManager.add({ title: "Article saved", type: "success" });
    },
    onError: (error) =>
      toastError("Language version could not be saved", error),
  });

  const publish = useMutation({
    mutationFn: async (locale: BlogLocale) => {
      await persistShared();
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
      await queryClient.invalidateQueries({ queryKey: ["adminBlog", "list"] });
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
    onSuccess: async (result, locale) => {
      setVersions((value) => ({ ...value, [locale]: result }));
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
      archiveCompleted.current = true;
      setArchiveOpen(false);
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

  const hasUnsavedChanges =
    !!article.data &&
    initialized === articleId &&
    (JSON.stringify(drafts.id) !== JSON.stringify(draftFrom(versions.id)) ||
      JSON.stringify(drafts.en) !== JSON.stringify(draftFrom(versions.en)) ||
      JSON.stringify(shared) !==
        JSON.stringify({
          categoryId: article.data.category?.id ?? "",
          subcategoryId: article.data.subcategory?.id ?? "",
          featuredTutorName: article.data.featuredTutorName ?? "",
          reviewedByName: article.data.reviewedByName ?? "",
          featuredTutorId: article.data.featuredTutor?.id ?? "",
          reviewedByTutorId: article.data.reviewedByTutor?.id ?? "",
          internalNotes: article.data.internalNotes ?? "",
        }));
  const blocker = useBlocker({
    shouldBlockFn: () =>
      !archiveCompleted.current &&
      (saveOne.isPending || publish.isPending || hasUnsavedChanges),
    enableBeforeUnload: hasUnsavedChanges,
    withResolver: true,
  });

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

  function changeDraft<K extends keyof Draft>(
    locale: BlogLocale,
    key: K,
    value: Draft[K],
  ) {
    setDrafts((current) => ({
      ...current,
      [locale]: { ...current[locale], [key]: value },
    }));
  }
  function paired(
    key: keyof Draft,
    label: string,
    render: (locale: BlogLocale) => React.ReactNode,
  ) {
    const englishValue = drafts.en[key];
    const englishVisible =
      addedEnglish.includes(key) ||
      (Array.isArray(englishValue) ? englishValue.length > 0 : !!englishValue);
    return (
      <section
        className="space-y-3 border-l-2 border-border pl-3"
        aria-label={label}
      >
        <div className="flex items-center justify-between gap-2">
          <Heading level={3} className="text-base">
            {label}
          </Heading>
          {!englishVisible ? (
            <Button
              variant="plain"
              size="sm"
              onClick={() => setAddedEnglish((current) => [...current, key])}
            >
              <IconPlus aria-hidden="true" />
              English
            </Button>
          ) : null}
        </div>
        <div>
          <Field>
            <FieldLabel>Indonesia</FieldLabel>
            {render("id")}
          </Field>
        </div>
        {englishVisible ? (
          <div className="">
            <Field>
              <FieldLabel>English</FieldLabel>
              {render("en")}
            </Field>
          </div>
        ) : null}
      </section>
    );
  }
  function textField(
    key:
      | "title"
      | "slug"
      | "seoTitle"
      | "metaDescription"
      | "lead"
      | "mainKeyword"
      | "heroAlt",
    label: string,
    multiline = false,
  ) {
    return paired(key, label, (locale) =>
      multiline ? (
        <Textarea
          rows={3}
          value={drafts[locale][key] ?? ""}
          onChange={(event) => changeDraft(locale, key, event.target.value)}
        />
      ) : (
        <Input
          value={drafts[locale][key] ?? ""}
          disabled={key === "slug" && !!versions[locale]?.publishedAt}
          maxLength={
            key === "seoTitle"
              ? 60
              : key === "metaDescription"
                ? 155
                : undefined
          }
          placeholder={
            key === "slug"
              ? slugify(drafts[locale].title)
              : key === "seoTitle"
                ? drafts[locale].title.slice(0, 60)
                : undefined
          }
          onChange={(event) => changeDraft(locale, key, event.target.value)}
        />
      ),
    );
  }

  return (
    <Stack spacing="lg" className="relative mx-auto w-full max-w-3xl">
      <Stack
        direction="row"
        className="flex-wrap items-center justify-between gap-3 border-b border-border pb-5"
      >
        <div>
          <Button
            variant="underline"
            size="sm"
            onClick={() => navigate({ to: "/admin-blog" })}
          >
            <IconArrowLeft aria-hidden="true" />
            All articles
          </Button>
          <Heading level={1} className="mt-2 text-xl">
            {drafts.id.title || drafts.en.title || "Untitled article"}
          </Heading>
          <p className="text-sm text-muted">
            ID: {versions.id ? STATUS_LABEL[versions.id.status] : "not started"}{" "}
            · EN:{" "}
            {versions.en ? STATUS_LABEL[versions.en.status] : "not started"}
          </p>
        </div>
        <Button
          variant="tertiary"
          size="sm"
          disabled={!!data.archivedAt || archive.isPending}
          onClick={() => setArchiveOpen(true)}
        >
          <IconTrash />
          {data.archivedAt ? "Archived" : "Archive"}
        </Button>
      </Stack>

      <Accordion multiple defaultValue={["content"]}>
        <AccordionItem value="content">
          <AccordionHeader>
            <AccordionTrigger>Content · title, lead & body</AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>
            <div className="space-y-7 pb-4">
              {textField("title", "Title")}
              {textField("lead", "Introduction", true)}
              {paired("body", "Article body", (locale) => (
                <BlogBodyEditor
                  key={locale}
                  blocks={drafts[locale].body}
                  onChange={(body) => changeDraft(locale, "body", body)}
                  media={mediaOptions}
                  label={`Article body — ${locale === "id" ? "Indonesia" : "English"}`}
                />
              ))}
            </div>
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="search">
          <AccordionHeader>
            <AccordionTrigger>Search appearance</AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>
            <div className="space-y-6 pb-4">
              {textField("seoTitle", "SEO title")}
              {textField("slug", "Address")}
              {textField("metaDescription", "Meta description", true)}
              {textField("mainKeyword", "Main keyword")}
              {paired("secondaryKeywords", "Secondary keywords", (locale) => (
                <Input
                  value={(drafts[locale].secondaryKeywords ?? []).join(", ")}
                  onChange={(event) =>
                    changeDraft(
                      locale,
                      "secondaryKeywords",
                      event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    )
                  }
                />
              ))}
            </div>
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="facts">
          <AccordionHeader>
            <AccordionTrigger>Key facts & image descriptions</AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>
            <div className="space-y-6 pb-4">
              {textField("heroAlt", "Cover description")}
              {paired("keyFacts", "Key facts — one per line", (locale) => (
                <Textarea
                  rows={4}
                  value={drafts[locale].keyFacts
                    .map((fact) => fact.text)
                    .join("\n")}
                  onChange={(event) =>
                    changeDraft(
                      locale,
                      "keyFacts",
                      event.target.value
                        .split("\n")
                        .filter((value) => value.trim())
                        .map((text) => ({ text })),
                    )
                  }
                />
              ))}
            </div>
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="settings">
          <AccordionHeader>
            <AccordionTrigger>
              Article settings · category, people & cover
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>
            <div className="m-px pt-5">
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
                      value={
                        shared.featuredTutorId ||
                        (manualPeople.featured ? "manual" : "")
                      }
                      onValueChange={(value) => {
                        setManualPeople((current) => ({
                          ...current,
                          featured: value === "manual",
                        }));
                        setShared((current) => ({
                          ...current,
                          featuredTutorId:
                            value === "manual" ? "" : String(value ?? ""),
                          featuredTutorName:
                            value === "manual" ? current.featuredTutorName : "",
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectList>
                          <SelectItem value="">None</SelectItem>
                          <SelectItem value="manual">
                            Enter name manually
                          </SelectItem>
                          {(tutors.data ?? []).map((tutor) => (
                            <SelectItem key={tutor.id} value={tutor.id}>
                              {tutor.name}
                            </SelectItem>
                          ))}
                        </SelectList>
                      </SelectPopup>
                    </Select>
                    {!shared.featuredTutorId && manualPeople.featured ? (
                      <Input
                        aria-label="Featured tutor name"
                        placeholder="Featured tutor name"
                        maxLength={200}
                        value={shared.featuredTutorName}
                        onChange={(event) =>
                          setShared((current) => ({
                            ...current,
                            featuredTutorName: event.target.value,
                          }))
                        }
                      />
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel>Reviewed by</FieldLabel>
                    <Select
                      value={
                        shared.reviewedByTutorId ||
                        (manualPeople.reviewer ? "manual" : "")
                      }
                      onValueChange={(value) => {
                        setManualPeople((current) => ({
                          ...current,
                          reviewer: value === "manual",
                        }));
                        setShared((current) => ({
                          ...current,
                          reviewedByTutorId:
                            value === "manual" ? "" : String(value ?? ""),
                          reviewedByName:
                            value === "manual" ? current.reviewedByName : "",
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectList>
                          <SelectItem value="">None</SelectItem>
                          <SelectItem value="manual">
                            Enter name manually
                          </SelectItem>
                          {(tutors.data ?? []).map((tutor) => (
                            <SelectItem key={tutor.id} value={tutor.id}>
                              {tutor.name}
                            </SelectItem>
                          ))}
                        </SelectList>
                      </SelectPopup>
                    </Select>
                    {!shared.reviewedByTutorId && manualPeople.reviewer ? (
                      <Input
                        aria-label="Reviewer name"
                        placeholder="Reviewer name"
                        maxLength={200}
                        value={shared.reviewedByName}
                        onChange={(event) =>
                          setShared((current) => ({
                            ...current,
                            reviewedByName: event.target.value,
                          }))
                        }
                      />
                    ) : null}
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
                      src={
                        resolveProfileImageUrl(heroMedia.url) ?? heroMedia.url
                      }
                    />
                  ) : null}
                </Stack>

                <Field>
                  <FieldLabel>Gallery</FieldLabel>
                  <Stack
                    direction="row"
                    className="flex-wrap items-center gap-2"
                  >
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
              </Stack>
            </div>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
      <div className="sticky bottom-0 z-20 -mb-8 flex border flex-wrap items-center justify-between gap-3 rounded-xl border-border bg-background/95 p-3 backdrop-blur">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge
            variant={
              versions[activeLocale]?.status === "published"
                ? "success"
                : "secondary"
            }
          >
            {versions[activeLocale]
              ? STATUS_LABEL[versions[activeLocale]!.status]
              : "Not started"}
          </Badge>
          <Select
            value={activeLocale}
            onValueChange={(value) =>
              setActiveLocale(value === "en" ? "en" : "id")
            }
          >
            <SelectTrigger aria-label="Language to publish" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectList>
                <SelectItem value="id">Indonesia</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectList>
            </SelectPopup>
          </Select>
          <span role="status" className="text-sm text-muted">
            {hasUnsavedChanges ? "Unsaved changes" : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={saveOne.isPending || publish.isPending || uploading}
            onClick={() => saveOne.mutate(activeLocale)}
          >
            <IconDeviceFloppy />
            {saveOne.isPending ? "Saving…" : "Save article"}
          </Button>
          <Button
            disabled={
              saveOne.isPending ||
              publish.isPending ||
              uploading ||
              !!data.archivedAt
            }
            onClick={() => publish.mutate(activeLocale)}
          >
            {publish.isPending
              ? "Publishing…"
              : `Publish ${activeLocale === "id" ? "Indonesia" : "English"}`}
          </Button>
          {versions[activeLocale]?.status === "published" ? (
            <Button
              variant="plain"
              disabled={
                unpublish.isPending || saveOne.isPending || publish.isPending
              }
              onClick={() => unpublish.mutate(activeLocale)}
            >
              Unpublish
            </Button>
          ) : null}
        </div>
      </div>
      <Dialog
        open={archiveOpen}
        onOpenChange={(open) => {
          if (!archive.isPending) setArchiveOpen(open);
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <div>
              <DialogTitle>Archive this article?</DialogTitle>
              <DialogDescription>
                Both language versions will stop appearing on the website.
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="plain"
              disabled={archive.isPending}
              onClick={() => setArchiveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={archive.isPending}
              onClick={() => archive.mutate()}
            >
              {archive.isPending ? "Archiving…" : "Archive article"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
      <Dialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.status === "blocked") blocker.reset();
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <div>
              <DialogTitle>
                {saveOne.isPending || publish.isPending
                  ? "Article is being saved"
                  : "Discard unsaved changes?"}
              </DialogTitle>
              <DialogDescription>
                {saveOne.isPending || publish.isPending
                  ? "Wait for saving to finish before leaving this article."
                  : "Your unsaved edits will be lost if you leave this article."}
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="plain"
              onClick={() => {
                if (blocker.status === "blocked") blocker.reset();
              }}
            >
              Keep editing
            </Button>
            <Button
              variant="danger"
              disabled={saveOne.isPending || publish.isPending}
              onClick={() => {
                if (blocker.status === "blocked") blocker.proceed();
              }}
            >
              Discard and leave
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </Stack>
  );
}
