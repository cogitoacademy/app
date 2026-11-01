"use client";

import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";

import type {
  BlogBlock,
  BlogMediaDto,
} from "@cogito-app/api/modules/blog/blog.types";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
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

type BlockType = BlogBlock["type"];

const EMPTY_BLOCKS: Record<BlockType, () => BlogBlock> = {
  heading: () => ({ type: "heading", level: 2, text: "Heading" }),
  paragraph: () => ({ type: "paragraph", runs: [{ text: "" }] }),
  list: () => ({ type: "list", style: "unordered", items: [[{ text: "" }]] }),
  quote: () => ({ type: "quote", runs: [{ text: "" }] }),
  callout: () => ({ type: "callout", title: "Note", runs: [{ text: "" }] }),
  image: () => ({ type: "image", mediaId: "", alt: "" }),
  embed: () => ({ type: "embed", provider: "instagram", url: "" }),
};

function textOf(block: BlogBlock) {
  if (block.type === "heading") return block.text;
  if (block.type === "paragraph" || block.type === "quote") {
    return block.runs.map((run) => run.text).join("");
  }
  if (block.type === "callout")
    return block.runs.map((run) => run.text).join("");
  return "";
}

export function BlogBodyEditor({
  blocks,
  onChange,
  media,
}: {
  blocks: BlogBlock[];
  onChange: (blocks: BlogBlock[]) => void;
  media: BlogMediaDto[];
}) {
  function replace(index: number, block: BlogBlock) {
    onChange(
      blocks.map((current, position) => (position === index ? block : current)),
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const current = next[index];
    const other = next[target];
    if (!current || !other) return;
    next[index] = other;
    next[target] = current;
    onChange(next);
  }

  return (
    <Stack spacing="sm">
      {blocks.map((block, index) => (
        <div
          className="space-y-2 rounded-md border border-border p-3"
          key={index}
        >
          <Stack direction="row" className="items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              {block.type}
            </span>
            <Stack direction="row" className="gap-1">
              <Button
                variant="plain"
                size="sm"
                onClick={() => move(index, -1)}
                aria-label="Move up"
              >
                <IconArrowUp />
              </Button>
              <Button
                variant="plain"
                size="sm"
                onClick={() => move(index, 1)}
                aria-label="Move down"
              >
                <IconArrowDown />
              </Button>
              <Button
                variant="plain"
                size="sm"
                onClick={() =>
                  onChange(blocks.filter((_, position) => position !== index))
                }
                aria-label="Remove block"
              >
                <IconTrash />
              </Button>
            </Stack>
          </Stack>

          {block.type === "heading" ? (
            <Stack direction="row" className="items-end gap-2">
              <Field className="flex-1">
                <FieldLabel>Heading</FieldLabel>
                <Input
                  value={block.text}
                  onChange={(event) =>
                    replace(index, { ...block, text: event.target.value })
                  }
                />
              </Field>
              <Field className="w-24">
                <FieldLabel>Level</FieldLabel>
                <Select
                  value={String(block.level)}
                  onValueChange={(value) =>
                    replace(index, { ...block, level: value === "3" ? 3 : 2 })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectList>
                      <SelectItem value="2">H2</SelectItem>
                      <SelectItem value="3">H3</SelectItem>
                    </SelectList>
                  </SelectPopup>
                </Select>
              </Field>
            </Stack>
          ) : null}

          {block.type === "paragraph" || block.type === "quote" ? (
            <Textarea
              rows={4}
              value={textOf(block)}
              onChange={(event) =>
                replace(index, {
                  ...block,
                  runs: [{ text: event.target.value }],
                })
              }
            />
          ) : null}

          {block.type === "quote" ? (
            <Field>
              <FieldLabel>Attribution</FieldLabel>
              <Input
                value={block.attribution ?? ""}
                onChange={(event) =>
                  replace(index, {
                    ...block,
                    attribution: event.target.value || undefined,
                  })
                }
              />
            </Field>
          ) : null}

          {block.type === "list" ? (
            <Stack direction="row" className="items-start gap-2">
              <Field className="w-28">
                <FieldLabel>Style</FieldLabel>
                <Select
                  value={block.style}
                  onValueChange={(value) =>
                    replace(index, {
                      ...block,
                      style: value === "ordered" ? "ordered" : "unordered",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectList>
                      <SelectItem value="unordered">Bullets</SelectItem>
                      <SelectItem value="ordered">Numbers</SelectItem>
                    </SelectList>
                  </SelectPopup>
                </Select>
              </Field>
              <Field className="flex-1">
                <FieldLabel>One item per line</FieldLabel>
                <Textarea
                  rows={4}
                  value={block.items
                    .map((item) => item.map((run) => run.text).join(""))
                    .join("\n")}
                  onChange={(event) =>
                    replace(index, {
                      ...block,
                      items: event.target.value
                        .split("\n")
                        .map((line) => [{ text: line }]),
                    })
                  }
                />
              </Field>
            </Stack>
          ) : null}

          {block.type === "callout" ? (
            <Stack spacing="sm">
              <Field>
                <FieldLabel>Title</FieldLabel>
                <Input
                  value={block.title}
                  onChange={(event) =>
                    replace(index, { ...block, title: event.target.value })
                  }
                />
              </Field>
              <Textarea
                rows={3}
                value={textOf(block)}
                onChange={(event) =>
                  replace(index, {
                    ...block,
                    runs: [{ text: event.target.value }],
                  })
                }
              />
            </Stack>
          ) : null}

          {block.type === "image" ? (
            <Stack spacing="sm">
              <Field>
                <FieldLabel>Image</FieldLabel>
                <Select
                  value={block.mediaId}
                  onValueChange={(value) =>
                    replace(index, { ...block, mediaId: String(value ?? "") })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an uploaded image" />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectList>
                      {media.map((image) => (
                        <SelectItem key={image.id} value={image.id}>
                          {image.filename}
                        </SelectItem>
                      ))}
                    </SelectList>
                  </SelectPopup>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Alt text</FieldLabel>
                <Input
                  value={block.alt}
                  onChange={(event) =>
                    replace(index, { ...block, alt: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Caption</FieldLabel>
                <Input
                  value={block.caption ?? ""}
                  onChange={(event) =>
                    replace(index, {
                      ...block,
                      caption: event.target.value || undefined,
                    })
                  }
                />
              </Field>
            </Stack>
          ) : null}

          {block.type === "embed" ? (
            <Stack spacing="sm">
              <Stack direction="row" className="items-end gap-2">
                <Field className="w-36">
                  <FieldLabel>Provider</FieldLabel>
                  <Select
                    value={block.provider}
                    onValueChange={(value) =>
                      replace(index, {
                        ...block,
                        provider: value === "tiktok" ? "tiktok" : "instagram",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectList>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                      </SelectList>
                    </SelectPopup>
                  </Select>
                </Field>
                <Field className="flex-1">
                  <FieldLabel>Post URL</FieldLabel>
                  <Input
                    value={block.url}
                    onChange={(event) =>
                      replace(index, { ...block, url: event.target.value })
                    }
                  />
                </Field>
              </Stack>
              <Field>
                <FieldLabel>Poster image (optional)</FieldLabel>
                <Select
                  value={block.posterMediaId ?? ""}
                  onValueChange={(value) =>
                    replace(index, {
                      ...block,
                      posterMediaId: value ? String(value) : undefined,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No poster" />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectList>
                      {media.map((image) => (
                        <SelectItem key={image.id} value={image.id}>
                          {image.filename}
                        </SelectItem>
                      ))}
                    </SelectList>
                  </SelectPopup>
                </Select>
              </Field>
            </Stack>
          ) : null}
        </div>
      ))}

      <Stack direction="row" className="flex-wrap items-end gap-2">
        <Field className="w-40">
          <FieldLabel>Add block</FieldLabel>
          <Select
            value=""
            onValueChange={(value) => {
              const type = value as BlockType | null;
              if (type && type in EMPTY_BLOCKS) {
                onChange([...blocks, EMPTY_BLOCKS[type]()]);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a block" />
            </SelectTrigger>
            <SelectPopup>
              <SelectList>
                <SelectItem value="heading">Heading</SelectItem>
                <SelectItem value="paragraph">Paragraph</SelectItem>
                <SelectItem value="list">List</SelectItem>
                <SelectItem value="quote">Quote</SelectItem>
                <SelectItem value="callout">Callout</SelectItem>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="embed">Embed</SelectItem>
              </SelectList>
            </SelectPopup>
          </Select>
        </Field>
        <span className="text-xs text-muted">
          <IconPlus className="inline size-3" /> Blocks save as structured JSON,
          never HTML.
        </span>
      </Stack>
    </Stack>
  );
}
