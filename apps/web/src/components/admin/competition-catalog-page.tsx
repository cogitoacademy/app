"use client";

import { NumberField as SeliaNumberField } from "@cogito-app/ui/components/selia/number-field";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconArchive,
  IconArrowRight,
  IconCheck,
  IconChevronRight,
  IconCirclePlus,
  IconDeviceFloppy,
  IconPalette,
  IconRefresh,
  IconRestore,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardHeaderAction,
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
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";
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
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import Loader from "@/components/loader";
import {
  getCompetitionPalette,
  type CompetitionPalette,
} from "@/lib/competition-colors";
import { getPaletteContrastWarnings } from "@/lib/competition-palette-contrast";
import { getUserFacingError } from "@/lib/error-message";
import { client, orpc } from "@/utils/orpc";

type CatalogEntry = Awaited<
  ReturnType<typeof client.admin.listCompetitionCatalog>
>[number];
type CatalogDetails = Awaited<
  ReturnType<typeof client.admin.getCompetitionCatalogEntry>
>;
type CatalogImpact = Awaited<
  ReturnType<typeof client.admin.previewCompetitionCatalogImpact>
>;
type CatalogAction = "archive" | "restore" | "delete";
type EditorMode = "parent" | "specialization" | null;

type CatalogDraft = {
  slug: string;
  name: string;
  nameId: string;
  description: string;
  descriptionId: string;
  sortOrder: string;
  parentId: string;
  lightTextColor: string;
  lightBackgroundColor: string;
  darkTextColor: string;
  darkBackgroundColor: string;
  reason: string;
};

type PaletteKey = keyof CompetitionPalette;

function ownPalette(entry: CatalogEntry): CompetitionPalette | null {
  return getCompetitionPalette({
    lightTextColor: entry.lightTextColor ?? undefined,
    lightBackgroundColor: entry.lightBackgroundColor ?? undefined,
    darkTextColor: entry.darkTextColor ?? undefined,
    darkBackgroundColor: entry.darkBackgroundColor ?? undefined,
  });
}

const paletteFields: Array<{
  key: PaletteKey;
  label: string;
  theme: "Light" | "Dark";
  role: "Text" | "Background";
}> = [
  { key: "lightTextColor", label: "Light text", theme: "Light", role: "Text" },
  {
    key: "lightBackgroundColor",
    label: "Light background",
    theme: "Light",
    role: "Background",
  },
  { key: "darkTextColor", label: "Dark text", theme: "Dark", role: "Text" },
  {
    key: "darkBackgroundColor",
    label: "Dark background",
    theme: "Dark",
    role: "Background",
  },
];

const emptyDraft: CatalogDraft = {
  slug: "",
  name: "",
  nameId: "",
  description: "",
  descriptionId: "",
  sortOrder: "0",
  parentId: "",
  lightTextColor: "",
  lightBackgroundColor: "",
  darkTextColor: "",
  darkBackgroundColor: "",
  reason: "",
};
const emptyCatalogEntries: CatalogEntry[] = [];

function draftFromEntry(entry: CatalogEntry): CatalogDraft {
  const palette =
    entry.parentId === null ? ownPalette(entry) : entry.parentColors;
  return {
    slug: entry.slug,
    name: entry.name,
    nameId: entry.nameId ?? "",
    description: entry.description ?? "",
    descriptionId: entry.descriptionId ?? "",
    sortOrder: String(entry.sortOrder),
    parentId: entry.parentId ?? "",
    lightTextColor: palette?.lightTextColor ?? "",
    lightBackgroundColor: palette?.lightBackgroundColor ?? "",
    darkTextColor: palette?.darkTextColor ?? "",
    darkBackgroundColor: palette?.darkBackgroundColor ?? "",
    reason: "",
  };
}

function isValidColor(value: string) {
  const match = value
    .trim()
    .match(/^oklch\(\s*(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s*\)$/i);
  if (!match) return false;
  const [, lightnessText, chromaText, hueText] = match;
  const lightness = Number(lightnessText);
  const chroma = Number(chromaText);
  const hue = Number(hueText);
  return (
    Number.isFinite(lightness) &&
    lightness >= 0 &&
    lightness <= 1 &&
    Number.isFinite(chroma) &&
    chroma >= 0 &&
    chroma <= 0.5 &&
    Number.isFinite(hue) &&
    hue >= 0 &&
    hue <= 360
  );
}

function getStatus(entry: CatalogEntry) {
  if (!entry.rateConfigured) {
    return { label: "Draft · rates required", variant: "warning" as const };
  }
  if (!entry.isActive)
    return { label: "Archived", variant: "secondary" as const };
  if (!entry.selectable) {
    return { label: "Parent unavailable", variant: "warning" as const };
  }
  return { label: "Selectable", variant: "success" as const };
}

function isVersionConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("COMPETITION_CATALOG_VERSION_CONFLICT") ||
    message.includes("changed in another admin session")
  );
}

function nullableText(value: string) {
  return value.trim() ? value.trim() : null;
}

function formatRatio(ratio: number) {
  return `${ratio.toFixed(2)}:1`;
}

export function CompetitionCatalogPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [draft, setDraft] = useState<CatalogDraft>(emptyDraft);
  const [isDirty, setIsDirty] = useState(false);
  const [versionConflict, setVersionConflict] = useState(false);
  const [actionTarget, setActionTarget] = useState<{
    entry: CatalogEntry;
    action: CatalogAction;
  } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [moveTargetId, setMoveTargetId] = useState("");
  const [moveReason, setMoveReason] = useState("");

  const listQuery = useQuery(
    orpc.admin.listCompetitionCatalog.queryOptions({
      input: { includeArchived: true, query: search.trim() || undefined },
    }),
  );
  const detailQuery = useQuery({
    ...orpc.admin.getCompetitionCatalogEntry.queryOptions({
      input: { id: selectedId ?? "" },
    }),
    enabled: Boolean(selectedId),
  });
  const impactQuery = useQuery({
    ...orpc.admin.previewCompetitionCatalogImpact.queryOptions({
      input: { id: actionTarget?.entry.id ?? "" },
    }),
    enabled: Boolean(actionTarget),
  });

  const entries = listQuery.data ?? emptyCatalogEntries;
  const selectedListEntry = entries.find((entry) => entry.id === selectedId);
  const selectedEntry = (detailQuery.data ??
    selectedListEntry ??
    null) as CatalogEntry | null;
  const details = detailQuery.data as CatalogDetails | undefined;
  const children = details && "children" in details ? details.children : [];
  const parentEntriesById = new Map<string, CatalogEntry>(
    entries
      .filter((entry) => entry.parentId === null)
      .map((parent) => [parent.id, parent]),
  );
  for (const entry of entries) {
    if (entry.parentId !== null && entry.parent) {
      const parent = entry.parent;
      parentEntriesById.set(parent.id, {
        ...parent,
        parent: null,
        rateConfigured: entry.rateConfigured,
        selectable: parent.isActive && entry.rateConfigured,
        parentColors: entry.parentColors,
      });
    }
  }
  const parentEntries = [...parentEntriesById.values()].toSorted(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  const palette = useMemo(() => {
    if (editorMode === "parent") return getCompetitionPalette(draft);
    if (editorMode === "specialization") {
      const parent = entries.find((entry) => entry.id === draft.parentId);
      return parent?.parentColors ?? null;
    }
    if (selectedEntry?.parentId === null) {
      return ownPalette(selectedEntry);
    }
    return selectedEntry?.parentColors ?? null;
  }, [draft, editorMode, entries, selectedEntry]);
  const editingParentPalette =
    editorMode === "parent" ||
    (!editorMode && selectedEntry?.parentId === null);
  const paletteIsValid =
    !editingParentPalette ||
    paletteFields.every(({ key }) => isValidColor(draft[key]));
  const paletteChanged = Boolean(
    editingParentPalette &&
    selectedEntry &&
    paletteFields.some(({ key }) => draft[key] !== selectedEntry[key]),
  );
  const showContrastWarnings =
    Boolean(palette) &&
    editingParentPalette &&
    (!selectedEntry || paletteChanged);
  const contrastWarnings =
    showContrastWarnings && palette ? getPaletteContrastWarnings(palette) : [];
  const hasCatalogChanges = Boolean(
    selectedEntry &&
    (draft.name !== selectedEntry.name ||
      nullableText(draft.nameId) !== selectedEntry.nameId ||
      nullableText(draft.description) !== selectedEntry.description ||
      nullableText(draft.descriptionId) !== selectedEntry.descriptionId ||
      Number(draft.sortOrder) !== selectedEntry.sortOrder ||
      (selectedEntry.parentId === null &&
        paletteFields.some(({ key }) => draft[key] !== selectedEntry[key]))),
  );

  const refreshCatalog = async () => {
    // Catalog labels and colors are projected into unrelated active queries.
    // Writes are rare, so refresh all cached reads once they commit.
    await queryClient.invalidateQueries();
  };

  const handleVersionError = async (error: unknown, id?: string) => {
    if (!isVersionConflict(error)) return false;
    setVersionConflict(true);
    await refreshCatalog();
    if (id && selectedId === id) await detailQuery.refetch();
    if (id && actionTarget?.entry.id === id) await impactQuery.refetch();
    return true;
  };

  const createParent = useMutation(
    orpc.admin.createCompetitionParent.mutationOptions({
      onSuccess: async (entry) => {
        setSelectedId(entry.id);
        setEditorMode(null);
        setIsDirty(false);
        setVersionConflict(false);
        setDraft(draftFromEntry(entry as CatalogEntry));
        await refreshCatalog();
        toastManager.add({
          title: "Competition added as a draft",
          type: "success",
        });
      },
      onError: (error: Error) => {
        toastManager.add({
          title: "Competition could not be created",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );
  const createSpecialization = useMutation(
    orpc.admin.createCompetitionSpecialization.mutationOptions({
      onSuccess: async (entry) => {
        setSelectedId(entry.id);
        setEditorMode(null);
        setIsDirty(false);
        setVersionConflict(false);
        setDraft(draftFromEntry(entry as CatalogEntry));
        await refreshCatalog();
        toastManager.add({ title: "Specialization added", type: "success" });
      },
      onError: (error: Error) => {
        toastManager.add({
          title: "Specialization could not be created",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );
  const updateEntry = useMutation(
    orpc.admin.updateCompetitionCatalogEntry.mutationOptions({
      onSuccess: async (entry) => {
        setDraft(draftFromEntry(entry as CatalogEntry));
        setIsDirty(false);
        setVersionConflict(false);
        setEditorMode(null);
        await refreshCatalog();
        toastManager.add({ title: "Catalog entry saved", type: "success" });
      },
      onError: async (error: Error) => {
        const handled = await handleVersionError(error, selectedEntry?.id);
        if (handled) return;
        toastManager.add({
          title: "Catalog entry could not be saved",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );
  const moveSpecialization = useMutation(
    orpc.admin.moveCompetitionSpecialization.mutationOptions({
      onSuccess: async (result) => {
        setMoveReason("");
        setMoveTargetId("");
        setVersionConflict(false);
        await refreshCatalog();
        await detailQuery.refetch();
        toastManager.add({ title: "Specialization moved", type: "success" });
        return result;
      },
      onError: async (error: Error) => {
        const handled = await handleVersionError(error, selectedEntry?.id);
        if (handled) return;
        toastManager.add({
          title: "Specialization could not be moved",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );
  const setEntryActive = useMutation(
    orpc.admin.archiveCompetitionCatalogEntry.mutationOptions({
      onSuccess: async () => {
        setActionTarget(null);
        setActionReason("");
        setVersionConflict(false);
        await refreshCatalog();
        if (selectedId) await detailQuery.refetch();
        toastManager.add({ title: "Catalog entry archived", type: "success" });
      },
      onError: async (error: Error) => {
        const handled = await handleVersionError(error, actionTarget?.entry.id);
        if (handled) return;
        toastManager.add({
          title: "Catalog entry could not be archived",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );
  const restoreEntry = useMutation(
    orpc.admin.restoreCompetitionCatalogEntry.mutationOptions({
      onSuccess: async () => {
        setActionTarget(null);
        setActionReason("");
        setVersionConflict(false);
        await refreshCatalog();
        if (selectedId) await detailQuery.refetch();
        toastManager.add({ title: "Catalog entry restored", type: "success" });
      },
      onError: async (error: Error) => {
        const handled = await handleVersionError(error, actionTarget?.entry.id);
        if (handled) return;
        toastManager.add({
          title: "Catalog entry could not be restored",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );
  const deleteEntry = useMutation(
    orpc.admin.deleteCompetitionCatalogEntry.mutationOptions({
      onSuccess: async () => {
        const deletedId = actionTarget?.entry.id;
        setActionTarget(null);
        setActionReason("");
        setSelectedId((current) => (current === deletedId ? null : current));
        setEditorMode(null);
        setIsDirty(false);
        setVersionConflict(false);
        await refreshCatalog();
        toastManager.add({
          title: "Unused catalog entry deleted",
          type: "success",
        });
      },
      onError: async (error: Error) => {
        const handled = await handleVersionError(error, actionTarget?.entry.id);
        if (handled) return;
        toastManager.add({
          title: "Catalog entry could not be deleted",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );

  useEffect(() => {
    if (!detailQuery.data || isDirty || editorMode) return;
    // oxlint-disable-next-line react/set-state-in-effect -- hydrate the pristine editor from the fetched server record.
    setDraft(draftFromEntry(detailQuery.data as CatalogEntry));
    setVersionConflict(false);
  }, [detailQuery.data, editorMode, isDirty]);

  const selectEntry = (entry: CatalogEntry) => {
    setSelectedId(entry.id);
    setEditorMode(null);
    setDraft(draftFromEntry(entry));
    setIsDirty(false);
    setVersionConflict(false);
    setMoveTargetId("");
    setMoveReason("");
  };

  const startCreateParent = () => {
    setSelectedId(null);
    setEditorMode("parent");
    setDraft(emptyDraft);
    setIsDirty(false);
    setVersionConflict(false);
  };

  const startCreateSpecialization = (parentId: string) => {
    const parent = entries.find((entry) => entry.id === parentId);
    setSelectedId(parentId);
    setEditorMode("specialization");
    setDraft({
      ...emptyDraft,
      parentId,
      sortOrder: String((parent?.sortOrder ?? -1) + 1),
    });
    setIsDirty(false);
    setVersionConflict(false);
  };

  const updateDraft = (key: keyof CatalogDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setIsDirty(true);
    setVersionConflict(false);
  };

  const save = () => {
    if (!draft.reason.trim()) return;
    const sortOrder = Number(draft.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) return;

    if (editorMode === "parent") {
      if (
        !draft.slug.trim() ||
        !draft.name.trim() ||
        !paletteFields.every(({ key }) => isValidColor(draft[key]))
      )
        return;
      createParent.mutate({
        slug: draft.slug.trim(),
        name: draft.name.trim(),
        nameId: nullableText(draft.nameId),
        description: nullableText(draft.description),
        descriptionId: nullableText(draft.descriptionId),
        lightTextColor: draft.lightTextColor,
        lightBackgroundColor: draft.lightBackgroundColor,
        darkTextColor: draft.darkTextColor,
        darkBackgroundColor: draft.darkBackgroundColor,
        sortOrder,
        reason: draft.reason.trim(),
      });
      return;
    }

    if (editorMode === "specialization") {
      if (!draft.parentId || !draft.slug.trim() || !draft.name.trim()) return;
      createSpecialization.mutate({
        parentId: draft.parentId,
        slug: draft.slug.trim(),
        name: draft.name.trim(),
        nameId: nullableText(draft.nameId),
        description: nullableText(draft.description),
        descriptionId: nullableText(draft.descriptionId),
        sortOrder,
        reason: draft.reason.trim(),
      });
      return;
    }

    if (!selectedEntry) return;
    const payload: Parameters<
      typeof client.admin.updateCompetitionCatalogEntry
    >[0] = {
      id: selectedEntry.id,
      expectedVersion: selectedEntry.version,
      reason: draft.reason.trim(),
    };
    if (draft.name.trim() && draft.name !== selectedEntry.name) {
      payload.name = draft.name.trim();
    }
    const nameId = nullableText(draft.nameId);
    if (nameId !== selectedEntry.nameId) payload.nameId = nameId;
    const description = nullableText(draft.description);
    if (description !== selectedEntry.description)
      payload.description = description;
    const descriptionId = nullableText(draft.descriptionId);
    if (descriptionId !== selectedEntry.descriptionId) {
      payload.descriptionId = descriptionId;
    }
    if (sortOrder !== selectedEntry.sortOrder) payload.sortOrder = sortOrder;
    if (selectedEntry.parentId === null) {
      for (const { key } of paletteFields) {
        if (draft[key] !== selectedEntry[key]) {
          payload[key] = draft[key];
        }
      }
    }
    if (Object.keys(payload).length === 3) return;
    if (
      !draft.name.trim() ||
      (selectedEntry.parentId === null &&
        !paletteFields.every(({ key }) => isValidColor(draft[key])))
    )
      return;
    updateEntry.mutate(payload);
  };

  const openAction = (entry: CatalogEntry, action: CatalogAction) => {
    setActionTarget({ entry, action });
    setActionReason("");
    setVersionConflict(false);
  };

  const submitAction = () => {
    if (!actionTarget || !actionReason.trim()) return;
    const entry = impactQuery.data?.entry ?? actionTarget.entry;
    const input = {
      id: entry.id,
      expectedVersion: entry.version,
      reason: actionReason.trim(),
    };
    if (actionTarget.action === "archive") setEntryActive.mutate(input);
    if (actionTarget.action === "restore") restoreEntry.mutate(input);
    if (actionTarget.action === "delete") deleteEntry.mutate(input);
  };

  const move = () => {
    if (
      !selectedEntry ||
      selectedEntry.parentId === null ||
      !moveTargetId ||
      !moveReason.trim()
    )
      return;
    moveSpecialization.mutate({
      id: selectedEntry.id,
      parentId: moveTargetId,
      expectedVersion: selectedEntry.version,
      reason: moveReason.trim(),
    });
  };

  if (listQuery.isPending) return <Loader />;
  if (listQuery.isError) {
    return (
      <Card>
        <CardBody className="p-6">
          <Text className="text-danger">
            Competition catalog could not be loaded.
          </Text>
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() => void listQuery.refetch()}
          >
            <IconRefresh /> Retry
          </Button>
        </CardBody>
      </Card>
    );
  }

  const isSaving =
    createParent.isPending ||
    createSpecialization.isPending ||
    updateEntry.isPending;
  const isActionPending =
    setEntryActive.isPending || restoreEntry.isPending || deleteEntry.isPending;
  const currentActionEntry = impactQuery.data?.entry ?? actionTarget?.entry;
  const cannotDelete = Boolean(
    impactQuery.data &&
    (impactQuery.data.childCount > 0 || impactQuery.data.totalReferences > 0),
  );
  const actionTitle =
    actionTarget?.action === "archive"
      ? "Archive catalog entry"
      : actionTarget?.action === "restore"
        ? "Restore catalog entry"
        : "Delete unused entry";

  return (
    <Stack spacing="lg" className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <Stack
        direction="row"
        spacing="md"
        className="items-start justify-between"
      >
        <div>
          <Heading level={1}>Competition catalog</Heading>
          <Text className="mt-2 max-w-2xl text-muted">
            Manage competition names, specializations, lifecycle, ordering, and
            display colors. New competitions stay draft until their rates are
            configured.
          </Text>
        </div>
        <Button onClick={startCreateParent}>
          <IconCirclePlus /> Add competition
        </Button>
      </Stack>

      {versionConflict ? (
        <div
          role="alert"
          className="rounded-lg border border-warning-border bg-warning/10 p-4 text-warning"
        >
          This entry changed in another admin session. The latest version has
          been reloaded and your draft is still here. Review it, then save again
          to apply your changed fields.
          {selectedEntry ? (
            <span className="ml-1">
              Current version: {selectedEntry.version}.
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="grid w-full min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(17rem,0.85fr)_minmax(0,1.65fr)]">
        <Card className="min-h-[36rem]">
          <CardHeader>
            <CardTitle>Catalog entries</CardTitle>
            <CardHeaderAction>
              <Badge variant="secondary">{entries.length}</Badge>
            </CardHeaderAction>
          </CardHeader>
          <CardBody className="p-4">
            <div className="relative mb-4">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input
                aria-label="Search competition catalog"
                className="pl-9"
                placeholder="Search names or slugs"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="max-h-[65vh] space-y-1 overflow-y-auto pr-1">
              {parentEntries.map((parent) => {
                const status = getStatus(parent);
                const parentChildren = entries
                  .filter((entry) => entry.parentId === parent.id)
                  .toSorted((left, right) => left.sortOrder - right.sortOrder);
                return (
                  <div key={parent.id}>
                    <button
                      type="button"
                      onClick={() => selectEntry(parent)}
                      className={`flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent/50 ${selectedId === parent.id && !editorMode ? "bg-accent/60" : ""}`}
                      aria-current={
                        selectedId === parent.id && !editorMode
                          ? "page"
                          : undefined
                      }
                    >
                      <IconChevronRight className="mt-1 size-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {parent.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {parent.slug}
                        </span>
                      </span>
                      <Badge variant={status.variant} size="sm">
                        {status.label}
                      </Badge>
                    </button>
                    {parentChildren.map((child) => {
                      const childStatus = getStatus(child);
                      return (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => selectEntry(child)}
                          className={`ml-5 flex w-[calc(100%-1.25rem)] items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/50 ${selectedId === child.id && !editorMode ? "bg-accent/60" : ""}`}
                          aria-current={
                            selectedId === child.id && !editorMode
                              ? "page"
                              : undefined
                          }
                        >
                          <IconArrowRight className="mt-1 size-3.5 shrink-0 text-muted" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {child.name}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted">
                              {child.slug}
                            </span>
                          </span>
                          {!child.selectable ? (
                            <Badge
                              variant={childStatus.variant}
                              size="sm"
                              className="max-w-36 truncate"
                            >
                              {childStatus.label}
                            </Badge>
                          ) : null}
                        </button>
                      );
                    })}
                    {parentChildren.length === 0 ? (
                      <Text className="ml-12 py-1 text-xs text-muted">
                        No specializations
                      </Text>
                    ) : null}
                  </div>
                );
              })}
              {entries.length === 0 ? (
                <Text className="p-3 text-sm text-muted">
                  No matching catalog entries.
                </Text>
              ) : null}
            </div>
          </CardBody>
        </Card>

        <Stack spacing="md">
          {editorMode || selectedEntry ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>
                    {editorMode === "parent"
                      ? "Add competition"
                      : editorMode === "specialization"
                        ? "Add specialization"
                        : selectedEntry?.name}
                  </CardTitle>
                  <Text className="mt-1 text-sm text-muted">
                    {editorMode
                      ? "New records use an immutable slug."
                      : selectedEntry?.slug}
                  </Text>
                </div>
                <CardHeaderAction>
                  {selectedEntry && !editorMode ? (
                    <Badge variant={getStatus(selectedEntry).variant}>
                      {getStatus(selectedEntry).label}
                    </Badge>
                  ) : null}
                </CardHeaderAction>
              </CardHeader>
              <CardBody className="p-5 sm:p-6">
                {selectedEntry && !editorMode ? (
                  <>
                    {!selectedEntry.rateConfigured ? (
                      <div
                        role="status"
                        className="mb-4 rounded-lg border border-warning-border bg-warning/10 p-3 text-sm text-warning"
                      >
                        Draft: no rate is configured for this competition yet.
                        Public tutor and booking selections remain disabled
                        until a rate is added in Economy settings.
                      </div>
                    ) : null}
                    <div className="mb-5 flex flex-wrap gap-2">
                      {selectedEntry.isActive ? (
                        <Button
                          variant="secondary"
                          onClick={() => openAction(selectedEntry, "archive")}
                        >
                          <IconArchive /> Archive
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() => openAction(selectedEntry, "restore")}
                          disabled={
                            !selectedEntry.rateConfigured ||
                            (selectedEntry.parentId !== null &&
                              selectedEntry.parent?.isActive !== true)
                          }
                        >
                          <IconRestore /> Restore
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        onClick={() => openAction(selectedEntry, "delete")}
                      >
                        <IconTrash /> Delete
                      </Button>
                      {selectedEntry.parentId === null ? (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            startCreateSpecialization(selectedEntry.id)
                          }
                        >
                          <IconCirclePlus /> Add specialization
                        </Button>
                      ) : null}
                    </div>
                  </>
                ) : null}

                {editorMode === "specialization" ? (
                  <Field className="mb-4">
                    <FieldLabel htmlFor="catalog-parent">
                      Competition
                    </FieldLabel>
                    <Select
                      value={draft.parentId}
                      onValueChange={(value) =>
                        updateDraft("parentId", String(value ?? ""))
                      }
                      items={parentEntries.map((parent) => ({
                        value: parent.id,
                        label: parent.name,
                      }))}
                    >
                      <SelectTrigger id="catalog-parent">
                        <SelectValue placeholder="Choose a competition" />
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectList>
                          {parentEntries.map((parent) => (
                            <SelectItem key={parent.id} value={parent.id}>
                              {parent.name}
                            </SelectItem>
                          ))}
                        </SelectList>
                      </SelectPopup>
                    </Select>
                  </Field>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="catalog-name">
                      Name (English) *
                    </FieldLabel>
                    <Input
                      id="catalog-name"
                      value={draft.name}
                      onChange={(event) =>
                        updateDraft("name", event.target.value)
                      }
                      aria-required="true"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="catalog-name-id">
                      Name (Indonesian)
                    </FieldLabel>
                    <Input
                      id="catalog-name-id"
                      value={draft.nameId}
                      onChange={(event) =>
                        updateDraft("nameId", event.target.value)
                      }
                    />
                  </Field>
                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor="catalog-description">
                      Description (English)
                    </FieldLabel>
                    <Textarea
                      id="catalog-description"
                      value={draft.description}
                      onChange={(event) =>
                        updateDraft("description", event.target.value)
                      }
                    />
                  </Field>
                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor="catalog-description-id">
                      Description (Indonesian)
                    </FieldLabel>
                    <Textarea
                      id="catalog-description-id"
                      value={draft.descriptionId}
                      onChange={(event) =>
                        updateDraft("descriptionId", event.target.value)
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="catalog-sort">
                      Display order
                    </FieldLabel>
                    <SeliaNumberField
                      id="catalog-sort"
                      allowOutOfRange
                      format={{ useGrouping: false }}
                      min={0}
                      step={1}
                      value={
                        draft.sortOrder === "" ? null : Number(draft.sortOrder)
                      }
                      onValueChange={(nextValue) =>
                        updateDraft(
                          "sortOrder",
                          nextValue === null ? "" : String(nextValue),
                        )
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="catalog-slug">Slug</FieldLabel>
                    <Input
                      id="catalog-slug"
                      value={draft.slug}
                      disabled={!editorMode}
                      placeholder={
                        editorMode ? "lowercase-kebab-case" : undefined
                      }
                      onChange={(event) =>
                        updateDraft("slug", event.target.value)
                      }
                      aria-describedby="catalog-slug-help"
                    />
                    <FieldDescription id="catalog-slug-help">
                      {editorMode
                        ? "Unique and immutable after creation."
                        : "Slugs cannot be changed after creation."}
                    </FieldDescription>
                  </Field>
                </div>

                {editorMode === "parent" ||
                (!editorMode && selectedEntry?.parentId === null) ? (
                  <section
                    className="mt-7 border-t border-border pt-6"
                    aria-labelledby="catalog-palette-title"
                  >
                    <div className="mb-4 flex items-center gap-2">
                      <IconPalette className="size-5 text-muted" />
                      <div>
                        <Heading
                          id="catalog-palette-title"
                          level={2}
                          className="text-base"
                        >
                          Display palette
                        </Heading>
                        <Text className="text-sm text-muted">
                          Specializations inherit these four opaque color
                          values.
                        </Text>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {paletteFields.map(({ key, label }) => (
                        <Field key={key}>
                          <FieldLabel htmlFor={`palette-${key}`}>
                            {label} *
                          </FieldLabel>
                          <Input
                            id={`palette-${key}`}
                            spellCheck={false}
                            autoCapitalize="off"
                            autoCorrect="off"
                            value={draft[key]}
                            onChange={(event) =>
                              updateDraft(key, event.target.value)
                            }
                            aria-invalid={
                              draft[key].length > 0 && !isValidColor(draft[key])
                            }
                            placeholder="oklch(0.5 0.02 250)"
                          />
                          <FieldDescription>
                            Enter opaque <code>oklch(L C H)</code>.
                          </FieldDescription>
                        </Field>
                      ))}
                    </div>
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <PalettePreview title="Light theme" palette={palette} />
                      <PalettePreview
                        title="Dark theme"
                        palette={palette}
                        dark
                      />
                    </div>
                    {!paletteIsValid && editorMode === "parent" ? (
                      <Text role="alert" className="mt-3 text-sm text-danger">
                        Enter all four valid OKLCH values before saving.
                      </Text>
                    ) : null}
                    {contrastWarnings.length > 0 ? (
                      <Text role="status" className="mt-3 text-sm text-warning">
                        Contrast warning:{" "}
                        {contrastWarnings
                          .map(
                            ({ theme, ratio }) =>
                              `${theme} pair ${formatRatio(ratio)}`,
                          )
                          .join("; ")}{" "}
                        is below 4.5:1. This is advisory and does not block
                        saving.
                      </Text>
                    ) : null}
                    {editorMode !== "parent" ? (
                      <Text className="mt-3 text-sm text-muted">
                        This specialization uses its parent’s current palette.
                      </Text>
                    ) : null}
                  </section>
                ) : selectedEntry ? (
                  <section
                    className="mt-7 border-t border-border pt-6"
                    aria-labelledby="inherited-palette-title"
                  >
                    <Heading
                      id="inherited-palette-title"
                      level={2}
                      className="mb-4 text-base"
                    >
                      Inherited competition palette
                    </Heading>
                    <div className="grid gap-4 md:grid-cols-2">
                      <PalettePreview title="Light theme" palette={palette} />
                      <PalettePreview
                        title="Dark theme"
                        palette={palette}
                        dark
                      />
                    </div>
                  </section>
                ) : null}

                {selectedEntry &&
                !editorMode &&
                selectedEntry.parentId !== null ? (
                  <div className="mt-7 border-t border-border pt-6">
                    <Heading level={2} className="mb-3 text-base">
                      Move specialization
                    </Heading>
                    <Text className="mb-3 text-sm text-muted">
                      Unused specializations can move between competitions. The
                      server checks current references before moving.
                    </Text>
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <Field>
                        <FieldLabel htmlFor="move-parent">
                          Destination
                        </FieldLabel>
                        <Select
                          value={moveTargetId}
                          onValueChange={(value) =>
                            setMoveTargetId(String(value ?? ""))
                          }
                          items={parentEntries
                            .filter(
                              (parent) => parent.id !== selectedEntry.parentId,
                            )
                            .map((parent) => ({
                              value: parent.id,
                              label: parent.name,
                            }))}
                        >
                          <SelectTrigger id="move-parent">
                            <SelectValue placeholder="Choose destination" />
                          </SelectTrigger>
                          <SelectPopup>
                            <SelectList>
                              {parentEntries
                                .filter(
                                  (parent) =>
                                    parent.id !== selectedEntry.parentId,
                                )
                                .map((parent) => (
                                  <SelectItem key={parent.id} value={parent.id}>
                                    {parent.name}
                                  </SelectItem>
                                ))}
                            </SelectList>
                          </SelectPopup>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="move-reason">Reason</FieldLabel>
                        <Input
                          id="move-reason"
                          value={moveReason}
                          onChange={(event) =>
                            setMoveReason(event.target.value)
                          }
                        />
                      </Field>
                      <Button
                        variant="secondary"
                        onClick={move}
                        progress={moveSpecialization.isPending}
                        disabled={
                          !moveTargetId ||
                          !moveReason.trim() ||
                          moveSpecialization.isPending
                        }
                      >
                        Move
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-7 border-t border-border pt-6">
                  <Field>
                    <FieldLabel htmlFor="catalog-reason">
                      Change reason *
                    </FieldLabel>
                    <Textarea
                      id="catalog-reason"
                      value={draft.reason}
                      onChange={(event) =>
                        updateDraft("reason", event.target.value)
                      }
                      placeholder="Required for the audit record"
                    />
                    <FieldDescription>
                      Every catalog write is recorded with this reason.
                    </FieldDescription>
                  </Field>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      onClick={save}
                      progress={isSaving}
                      disabled={
                        isSaving ||
                        (!editorMode && !hasCatalogChanges) ||
                        !draft.reason.trim() ||
                        !draft.name.trim() ||
                        (editingParentPalette &&
                          (!draft.slug.trim() || !paletteIsValid)) ||
                        (editorMode === "specialization" &&
                          (!draft.slug.trim() || !draft.parentId))
                      }
                    >
                      <IconDeviceFloppy />{" "}
                      {editorMode ? "Create entry" : "Save changes"}
                    </Button>
                    {selectedEntry && !editorMode ? (
                      <Button
                        variant="plain"
                        onClick={() => {
                          setDraft(draftFromEntry(selectedEntry));
                          setIsDirty(false);
                          setVersionConflict(false);
                        }}
                        disabled={isSaving}
                      >
                        Discard draft
                      </Button>
                    ) : null}
                    {detailQuery.isFetching && selectedId ? (
                      <Text className="text-sm text-muted">
                        Refreshing current version…
                      </Text>
                    ) : null}
                  </div>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card className="min-h-80">
              <CardBody className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
                <IconPalette className="mb-3 size-8 text-muted" />
                <Heading level={2} className="text-xl">
                  Choose a catalog entry
                </Heading>
                <Text className="mt-2 max-w-md text-muted">
                  Select a competition or specialization to review its labels,
                  readiness, colors, and lifecycle actions.
                </Text>
              </CardBody>
            </Card>
          )}

          {selectedEntry &&
          selectedEntry.parentId === null &&
          children.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Specializations</CardTitle>
                <CardHeaderAction>
                  <Button
                    variant="plain"
                    size="sm"
                    onClick={() => startCreateSpecialization(selectedEntry.id)}
                  >
                    <IconCirclePlus /> Add
                  </Button>
                </CardHeaderAction>
              </CardHeader>
              <CardBody className="divide-y divide-border p-0">
                {children.map((child) => {
                  const childStatus = getStatus(child as CatalogEntry);
                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => selectEntry(child as CatalogEntry)}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent/40"
                    >
                      <Item variant="plain" className="min-w-0 flex-1 p-0">
                        <ItemContent>
                          <ItemTitle>{child.name}</ItemTitle>
                          <ItemDescription>{child.slug}</ItemDescription>
                        </ItemContent>
                      </Item>
                      <Badge variant={childStatus.variant}>
                        {childStatus.label}
                      </Badge>
                      <IconChevronRight className="size-4 text-muted" />
                    </button>
                  );
                })}
              </CardBody>
            </Card>
          ) : null}
        </Stack>
      </div>

      <Dialog
        open={Boolean(actionTarget)}
        onOpenChange={(open) => {
          if (!open && !isActionPending) {
            setActionTarget(null);
            setActionReason("");
          }
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <div>
              <DialogTitle>{actionTitle}</DialogTitle>
              <DialogDescription>
                {currentActionEntry?.name} · {currentActionEntry?.slug}
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogBody>
            {impactQuery.isPending ? (
              <Text className="text-muted">Loading reference impact…</Text>
            ) : impactQuery.isError ? (
              <Text role="alert" className="text-danger">
                Impact preview failed. Retry before continuing.
              </Text>
            ) : impactQuery.data ? (
              <ImpactSummary
                impact={impactQuery.data}
                action={actionTarget?.action}
              />
            ) : null}
            <Field className="mt-4">
              <FieldLabel htmlFor="catalog-action-reason">Reason *</FieldLabel>
              <Textarea
                id="catalog-action-reason"
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                placeholder="Required for the audit record"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose disabled={isActionPending}>Cancel</DialogClose>
            <Button
              variant={actionTarget?.action === "delete" ? "danger" : "primary"}
              onClick={submitAction}
              progress={isActionPending}
              disabled={
                !actionTarget ||
                !actionReason.trim() ||
                impactQuery.isPending ||
                impactQuery.isError ||
                isActionPending ||
                (actionTarget.action === "delete" && cannotDelete)
              }
            >
              {actionTarget?.action === "archive"
                ? "Archive"
                : actionTarget?.action === "restore"
                  ? "Restore"
                  : "Delete"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </Stack>
  );
}

function PalettePreview({
  title,
  palette,
  dark = false,
}: {
  title: string;
  palette?: CompetitionPalette | null;
  dark?: boolean;
}) {
  const text = dark ? palette?.darkTextColor : palette?.lightTextColor;
  const background = dark
    ? palette?.darkBackgroundColor
    : palette?.lightBackgroundColor;
  const hasPalette = Boolean(
    palette &&
    text &&
    background &&
    isValidColor(text) &&
    isValidColor(background),
  );
  return (
    <div className="rounded-lg border border-border bg-item p-4">
      <Text className="mb-3 text-sm font-medium text-foreground">{title}</Text>
      <div
        className={`rounded-md border border-border px-4 py-3 text-sm font-medium ${hasPalette ? "" : "bg-accent/30 text-foreground"}`}
        style={
          hasPalette ? { color: text, backgroundColor: background } : undefined
        }
      >
        Competition title · displayed exactly as configured
      </div>
      <div className="mt-3 grid gap-1 text-xs text-muted">
        <span className="break-all">Text: {text || "Not configured"}</span>
        <span className="break-all">
          Background: {background || "Not configured"}
        </span>
      </div>
    </div>
  );
}

function ImpactSummary({
  impact,
  action,
}: {
  impact: CatalogImpact;
  action?: CatalogAction;
}) {
  const references = Object.entries(impact.references).filter(
    ([, count]) => count > 0,
  );
  if (action === "restore") {
    return (
      <div className="rounded-lg border border-info-border bg-info/10 p-4 text-sm">
        Restoring makes this entry available according to its rate and parent
        readiness. New competitions remain draft until rates are configured.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-item p-4 text-sm">
        <p className="font-medium">Impact preview</p>
        <p className="mt-1 text-muted">
          {impact.childCount} specialization{impact.childCount === 1 ? "" : "s"}{" "}
          · {impact.totalReferences} reference
          {impact.totalReferences === 1 ? "" : "s"}
        </p>
        {references.length > 0 ? (
          <ul className="mt-2 list-inside list-disc text-muted">
            {references.map(([name, count]) => (
              <li key={name}>
                {name.replaceAll(/([A-Z])/g, " $1").toLowerCase()}: {count}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 flex items-center gap-1 text-success">
            <IconCheck className="size-4" /> No direct references found.
          </p>
        )}
      </div>
      {action === "archive" && impact.totalReferences > 0 ? (
        <Text className="text-sm text-muted">
          Archived labels, saved bookings, and historical references keep their
          stored values. New selection is disabled.
        </Text>
      ) : null}
      {action === "delete" &&
      (impact.childCount > 0 || impact.totalReferences > 0) ? (
        <Text role="alert" className="text-sm text-danger">
          Delete is unavailable while children or references remain. Archive
          this entry to preserve history.
        </Text>
      ) : null}
    </div>
  );
}
