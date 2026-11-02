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
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
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
import { Tabs, TabsItem, TabsList } from "@cogito-app/ui/components/selia/tabs";
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
import Loader from "@/components/loader";
import { assertBodyImageAlts } from "@/lib/blog-body-alt";
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

const FIELD_LABEL: Record<string, string> = {
  title: "Title",
  seoTitle: "SEO title",
  slug: "Address",
  metaDescription: "Meta description",
  lead: "Introduction",
  body: "Article body",
  keyFacts: "Key facts",
  heroMedia: "Hero image",
  heroAlt: "Cover description",
  categoryId: "Category",
  galleryAltId: "Gallery alt text (Indonesia)",
  galleryAltEn: "Gallery alt text (English)",
};

function blogErrorDescription(error: unknown) {
  const data = (error as { data?: unknown } | null)?.data;
  if (data && typeof data === "object") {
    const missing = (data as { missingFields?: unknown }).missingFields;
    if (Array.isArray(missing) && missing.length > 0) {
      const labels = missing
        .map((field) =>
          typeof field === "string" ? (FIELD_LABEL[field] ?? field) : "",
        )
        .filter(Boolean);
      return `${getUserFacingError(error)} Missing: ${labels.join(", ")}.`;
    }
    const actual = (data as { actualVersion?: unknown }).actualVersion;
    if (typeof actual === "number") {
      return `${getUserFacingError(error)} Current version: ${actual}. Reload before saving again.`;
    }
  }
  return getUserFacingError(error);
}

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
  const publishedArticles = useQuery({
    queryKey: ["adminBlog", "published-options"],
    queryFn: () => client.adminBlog.list({ status: "published", limit: 50 }),
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
  const [initialized, setInitialized] = useState<string | null>(null);
  const [relatedIds, setRelatedIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "publish" | "unpublish";
    locale: BlogLocale;
  } | null>(null);
  const interacted = useRef(false);
  const suppressDirtyUntil = useRef(0);

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
    setRelatedIds(data.relatedArticleIds);
    clearDirty();
    interacted.current = false;
  }, [article.data, initialized]);

  const mediaOptions = useMemo(() => {
    const map = new Map<string, BlogMediaDto>();
    if (heroMedia) map.set(heroMedia.id, heroMedia);
    for (const image of gallery) map.set(image.id, image);
    for (const image of article.data?.bodyMedia ?? []) map.set(image.id, image);
    return [...map.values()];
  }, [heroMedia, gallery, article.data?.bodyMedia]);

  function markDirty() {
    if (interacted.current && Date.now() >= suppressDirtyUntil.current) {
      setDirty(true);
    }
  }

  function clearDirty() {
    suppressDirtyUntil.current = Date.now() + 1_000;
    setDirty(false);
  }

  function toastError(title: string, error: unknown) {
    toastManager.add({
      title,
      description: blogErrorDescription(error),
      type: "error",
    });
  }

  async function persistShared() {
    const updated = await client.adminBlog.updateArticle({
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
    await Promise.all([
      client.adminBlog.replaceGallery({
        articleId,
        expectedVersion: updated.version,
        images: gallery.map((image) => ({
          mediaId: image.id,
          altId: image.altId,
          altEn: image.altEn,
        })),
      }),
      client.adminBlog.replaceRelated({
        articleId,
        expectedVersion: updated.version,
        relatedArticleIds: relatedIds,
      }),
    ]);
    await article.refetch();
  }

  async function saveVersion(locale: BlogLocale) {
    const current = versions[locale];
    const draft = drafts[locale];
    assertBodyImageAlts(draft.body);
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
    mutationFn: async () => {
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
      clearDirty();
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
      clearDirty();
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
      clearDirty();
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
    !!article.data && initialized === articleId && dirty;
  const blocker = useBlocker({
    shouldBlockFn: () =>
      !archiveCompleted.current &&
      (saveOne.isPending || publish.isPending || hasUnsavedChanges),
    enableBeforeUnload: hasUnsavedChanges,
    withResolver: true,
  });

  if (article.isLoading) return <Loader />;
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
    markDirty();
    setDrafts((current) => ({
      ...current,
      [locale]: { ...current[locale], [key]: value },
    }));
  }

  function updateShared(patch: Partial<typeof shared>) {
    markDirty();
    setShared((current) => ({ ...current, ...patch }));
  }

  function updateRelated(index: number, value: string) {
    markDirty();
    const next = [...relatedIds];
    if (value) next[index] = value;
    else next.splice(index, 1);
    setRelatedIds([...new Set(next.filter(Boolean))].slice(0, 3));
  }

  function updateGalleryAlt(
    index: number,
    key: "altId" | "altEn",
    value: string,
  ) {
    markDirty();
    setGallery((current) =>
      current.map((image, imageIndex) =>
        imageIndex === index ? { ...image, [key]: value || null } : image,
      ),
    );
  }

  function removeGalleryImage(index: number) {
    markDirty();
    setGallery((current) =>
      current.filter((_, imageIndex) => imageIndex !== index),
    );
  }
  function localeField(
    label: string,
    render: (locale: BlogLocale) => React.ReactNode,
  ) {
    return (
      <Field>
        <FieldLabel>{label}</FieldLabel>
        {render(activeLocale)}
      </Field>
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
    return localeField(label, (locale) => {
      const value = String(drafts[locale][key] ?? "");
      const limit =
        key === "seoTitle" ? 60 : key === "metaDescription" ? 155 : null;
      const canonicalSlug = value || slugify(drafts[locale].title);
      return (
        <div className="space-y-1">
          {multiline ? (
            <Textarea
              rows={3}
              value={value}
              onChange={(event) => changeDraft(locale, key, event.target.value)}
            />
          ) : (
            <Input
              value={value}
              disabled={key === "slug" && !!versions[locale]?.publishedAt}
              maxLength={limit ?? undefined}
              placeholder={
                key === "slug"
                  ? slugify(drafts[locale].title)
                  : key === "seoTitle"
                    ? drafts[locale].title.slice(0, 60)
                    : undefined
              }
              onChange={(event) => changeDraft(locale, key, event.target.value)}
            />
          )}
          {limit ? (
            <p className="text-xs text-muted">
              {value.length}/{limit} characters
            </p>
          ) : null}
          {key === "slug" ? (
            <p className="break-all text-xs text-muted">
              {versions[locale]?.publishedAt ? "Locked after publish. " : ""}
              https://www.cogitoacademy.id/{locale}/blog/
              {canonicalSlug || "…"}
            </p>
          ) : null}
        </div>
      );
    });
  }

  // Mirrors the server publish gate so the tab can show what is still open.
  function missingPublishFields(locale: BlogLocale) {
    const draft = drafts[locale];
    const missing: string[] = [];
    if (!draft.title.trim()) missing.push("title");
    if (!(draft.seoTitle.trim() || draft.title.trim()))
      missing.push("seoTitle");
    if (!draft.metaDescription.trim()) missing.push("metaDescription");
    if (!draft.lead.trim()) missing.push("lead");
    if (draft.body.length === 0) missing.push("body");
    if (!heroMedia) missing.push("heroMedia");
    if (!draft.heroAlt?.trim()) missing.push("heroAlt");
    if (draft.keyFacts.length === 0) missing.push("keyFacts");
    if (
      gallery.some((image) =>
        locale === "id" ? !image.altId?.trim() : !image.altEn?.trim(),
      )
    )
      missing.push(locale === "id" ? "galleryAltId" : "galleryAltEn");
    return missing;
  }

  const PUBLISH_GATE_TOTAL = 9;
  const missingActive = missingPublishFields(activeLocale);
  const missingLabels = missingActive.map(
    (field) => FIELD_LABEL[field] ?? field,
  );

  return (
    <Stack
      spacing="lg"
      className="relative mx-auto w-full max-w-3xl"
      onPointerDownCapture={() => {
        interacted.current = true;
      }}
      onKeyDownCapture={() => {
        interacted.current = true;
      }}
    >
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
              {localeField("Article body", (locale) => (
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
              {localeField("Secondary keywords", (locale) => (
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
              {localeField("Key facts — one per line", (locale) => (
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
        <AccordionItem value="faq">
          <AccordionHeader>
            <AccordionTrigger>F.A.Q.</AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>
            <div className="pb-4">
              {localeField("Questions & answers", (locale) => {
                const items = drafts[locale].faq;
                return (
                  <div className="space-y-3">
                    {items.map((item, index) => (
                      <div
                        className="space-y-2 rounded-lg border border-border p-3"
                        key={index}
                      >
                        <Field>
                          <FieldLabel>Question {index + 1}</FieldLabel>
                          <Input
                            value={item.question}
                            onChange={(event) =>
                              changeDraft(
                                locale,
                                "faq",
                                items.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, question: event.target.value }
                                    : entry,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel>Answer {index + 1}</FieldLabel>
                          <Textarea
                            rows={3}
                            value={item.answer}
                            onChange={(event) =>
                              changeDraft(
                                locale,
                                "faq",
                                items.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, answer: event.target.value }
                                    : entry,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Button
                          variant="plain"
                          size="sm"
                          onClick={() =>
                            changeDraft(
                              locale,
                              "faq",
                              items.filter(
                                (_, entryIndex) => entryIndex !== index,
                              ),
                            )
                          }
                        >
                          Remove question
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        changeDraft(locale, "faq", [
                          ...items,
                          { question: "", answer: "" },
                        ])
                      }
                    >
                      <IconPlus />
                      Add question
                    </Button>
                  </div>
                );
              })}
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
                        updateShared({
                          categoryId: String(value ?? ""),
                          subcategoryId: "",
                        })
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
                        updateShared({ subcategoryId: String(value ?? "") })
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
                        updateShared({
                          featuredTutorId:
                            value === "manual" ? "" : String(value ?? ""),
                          featuredTutorName:
                            value === "manual" ? shared.featuredTutorName : "",
                        });
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
                          updateShared({
                            featuredTutorName: event.target.value,
                          })
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
                        updateShared({
                          reviewedByTutorId:
                            value === "manual" ? "" : String(value ?? ""),
                          reviewedByName:
                            value === "manual" ? shared.reviewedByName : "",
                        });
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
                          updateShared({
                            reviewedByName: event.target.value,
                          })
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
                  <FieldDescription>
                    Every gallery image needs alt text in both languages before
                    publishing.
                  </FieldDescription>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {gallery.map((image, index) => (
                      <div
                        className="space-y-2 rounded-lg border border-border p-3"
                        key={image.id}
                      >
                        <img
                          alt={image.altId ?? ""}
                          className="h-24 w-full rounded-md object-cover"
                          src={resolveProfileImageUrl(image.url) ?? image.url}
                        />
                        <Input
                          aria-label={`Gallery alt text Indonesia ${index + 1}`}
                          placeholder="Alt text — Indonesia"
                          maxLength={500}
                          value={image.altId ?? ""}
                          onChange={(event) =>
                            updateGalleryAlt(index, "altId", event.target.value)
                          }
                        />
                        <Input
                          aria-label={`Gallery alt text English ${index + 1}`}
                          placeholder="Alt text — English"
                          maxLength={500}
                          value={image.altEn ?? ""}
                          onChange={(event) =>
                            updateGalleryAlt(index, "altEn", event.target.value)
                          }
                        />
                        <Button
                          variant="plain"
                          size="sm"
                          onClick={() => removeGalleryImage(index)}
                        >
                          Remove image
                        </Button>
                      </div>
                    ))}
                  </div>
                  <label className="mt-3 inline-flex">
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
                </Field>

                <Field>
                  <FieldLabel>Related articles</FieldLabel>
                  <FieldDescription>
                    Choose up to three. When empty, the newest articles from the
                    same subcategory fill the block.
                  </FieldDescription>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[0, 1, 2].map((index) => (
                      <Select
                        key={index}
                        value={relatedIds[index] ?? ""}
                        onValueChange={(value) =>
                          updateRelated(index, String(value ?? ""))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={`Related ${index + 1}`} />
                        </SelectTrigger>
                        <SelectPopup>
                          <SelectList>
                            <SelectItem value="">None</SelectItem>
                            {(publishedArticles.data?.rows ?? [])
                              .filter((row) => row.id !== articleId)
                              .map((row) => (
                                <SelectItem key={row.id} value={row.id}>
                                  {row.titleId ||
                                    row.titleEn ||
                                    "Untitled article"}
                                </SelectItem>
                              ))}
                          </SelectList>
                        </SelectPopup>
                      </Select>
                    ))}
                  </div>
                </Field>

                <Field>
                  <FieldLabel>Internal notes</FieldLabel>
                  <Textarea
                    rows={3}
                    value={shared.internalNotes}
                    onChange={(event) =>
                      updateShared({ internalNotes: event.target.value })
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
          <Tabs
            value={activeLocale}
            onValueChange={(value) =>
              setActiveLocale(value === "en" ? "en" : "id")
            }
          >
            <TabsList aria-label="Language being edited">
              <TabsItem value="id" className="whitespace-nowrap">
                Indonesia
              </TabsItem>
              <TabsItem value="en" className="whitespace-nowrap">
                English
              </TabsItem>
            </TabsList>
          </Tabs>
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
          <span className="text-xs text-muted">
            ID {PUBLISH_GATE_TOTAL - missingPublishFields("id").length}/
            {PUBLISH_GATE_TOTAL} · EN{" "}
            {PUBLISH_GATE_TOTAL - missingPublishFields("en").length}/
            {PUBLISH_GATE_TOTAL}
          </span>
          <span role="status" className="text-sm text-muted">
            {hasUnsavedChanges ? "Unsaved changes" : ""}
          </span>
          {missingActive.length > 0 ? (
            <span
              className="text-xs text-muted"
              title={missingLabels.join(", ")}
            >
              {missingActive.length} required{" "}
              {missingActive.length === 1 ? "field" : "fields"} missing
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={saveOne.isPending || publish.isPending || uploading}
            onClick={() => saveOne.mutate()}
          >
            <IconDeviceFloppy />
            {saveOne.isPending ? "Saving…" : "Save all languages"}
          </Button>
          <Button
            disabled={
              saveOne.isPending ||
              publish.isPending ||
              uploading ||
              !!data.archivedAt ||
              missingActive.length > 0
            }
            title={
              missingActive.length > 0
                ? `Missing: ${missingLabels.join(", ")}`
                : undefined
            }
            onClick={() =>
              setConfirmAction({ type: "publish", locale: activeLocale })
            }
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
              onClick={() =>
                setConfirmAction({ type: "unpublish", locale: activeLocale })
              }
            >
              Unpublish
            </Button>
          ) : null}
        </div>
      </div>
      <Dialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open && !publish.isPending && !unpublish.isPending)
            setConfirmAction(null);
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <div>
              <DialogTitle>
                {confirmAction?.type === "unpublish"
                  ? `Unpublish ${confirmAction.locale === "id" ? "Indonesia" : "English"}?`
                  : `Publish ${confirmAction?.locale === "id" ? "Indonesia" : "English"}?`}
              </DialogTitle>
              <DialogDescription>
                {confirmAction?.type === "unpublish"
                  ? "The page, its sitemap entry, and the sibling language alternate disappear within two minutes. The saved text is kept as a draft."
                  : "The saved version goes live at the address below. The other language stays unchanged."}
              </DialogDescription>
            </div>
          </DialogHeader>
          {confirmAction ? (
            <div className="break-all rounded-lg bg-item p-3 text-sm">
              https://www.cogitoacademy.id/{confirmAction.locale}/blog/
              {drafts[confirmAction.locale].slug ||
                slugify(drafts[confirmAction.locale].title) ||
                "…"}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="plain"
              disabled={publish.isPending || unpublish.isPending}
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </Button>
            <Button
              variant={
                confirmAction?.type === "unpublish" ? "danger" : "primary"
              }
              disabled={publish.isPending || unpublish.isPending}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.type === "unpublish")
                  unpublish.mutate(confirmAction.locale);
                else publish.mutate(confirmAction.locale);
                setConfirmAction(null);
              }}
            >
              {confirmAction?.type === "unpublish"
                ? "Unpublish"
                : "Publish now"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
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
