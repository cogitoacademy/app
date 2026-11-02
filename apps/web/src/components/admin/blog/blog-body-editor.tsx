"use client";

import { useEffect, useRef, useState, useId } from "react";
import {
  Node,
  NodeViewWrapper,
  NodeViewContent,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import {
  IconH2,
  IconH3,
  IconBlockquote,
  IconPhotoPlus,
  IconInfoCircle,
  IconBrandInstagram,
  IconBrandTiktok,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconLoader2,
  IconDots,
} from "@tabler/icons-react";
import type { Transaction } from "@tiptap/pm/state";
import { StarterKit } from "@tiptap/starter-kit";
import type {
  BlogBlock,
  BlogMediaDto,
} from "@cogito-app/api/modules/blog/blog.types";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  RichTextEditorSurface,
  RichTextToolbarDivider,
} from "../rich-text-editor-surface";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator,
} from "@cogito-app/ui/components/selia/menu";
import {
  blogBlocksToTiptap,
  tiptapToBlogBlocks,
  normalizeBlogHref,
} from "@/lib/blog-rich-text";
import { resolveProfileImageUrl } from "@/lib/profile-image-url";
import { uploadBlogImage } from "./blog-api";

function ImageView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: NodeViewProps) {
  const id = useId();
  return (
    <NodeViewWrapper className="my-5" contentEditable={false}>
      {node.attrs.src ? (
        <img
          src={resolveProfileImageUrl(node.attrs.src)}
          alt={node.attrs.alt}
          className={`mx-auto max-h-96 max-w-full rounded-lg object-contain ${
            selected
              ? "ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
              : ""
          }`}
        />
      ) : (
        <p className="text-muted">Image unavailable</p>
      )}
      {!selected && node.attrs.caption ? (
        <p className="mt-2 text-center text-sm text-muted">
          {node.attrs.caption}
        </p>
      ) : null}
      {selected ? (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-card p-3">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <Field className="min-w-0">
              <FieldLabel htmlFor={`${id}-alt`}>Alt text</FieldLabel>
              <Input
                id={`${id}-alt`}
                value={node.attrs.alt}
                onChange={(event) =>
                  updateAttributes({ alt: event.target.value })
                }
              />
            </Field>
            <Field className="min-w-0">
              <FieldLabel htmlFor={`${id}-caption`}>Caption</FieldLabel>
              <Input
                id={`${id}-caption`}
                value={node.attrs.caption}
                onChange={(event) =>
                  updateAttributes({ caption: event.target.value })
                }
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="plain"
              onClick={deleteNode}
            >
              Remove image
            </Button>
          </div>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}
function CalloutView({ node, updateAttributes, selected }: NodeViewProps) {
  const id = useId();
  return (
    <NodeViewWrapper className="my-4 rounded-r-lg border-l-2 border-primary bg-accent px-3 pt-1 pb-2">
      {selected ? (
        <Field className="mb-2" contentEditable={false}>
          <FieldLabel htmlFor={id}>Callout title</FieldLabel>
          <Input
            id={id}
            value={node.attrs.title}
            onChange={(event) =>
              updateAttributes({ title: event.target.value })
            }
          />
        </Field>
      ) : (
        <p className="leading-none font-semibold">{node.attrs.title}</p>
      )}
      <NodeViewContent className="text-sm" />
    </NodeViewWrapper>
  );
}
function EmbedView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: NodeViewProps) {
  const id = useId();
  return (
    <NodeViewWrapper
      contentEditable={false}
      className="my-4 rounded-lg border border-border bg-item p-3"
    >
      {selected ? (
        <div className="space-y-3">
          <Field>
            <FieldLabel htmlFor={id}>
              {node.attrs.provider === "tiktok" ? "TikTok" : "Instagram"} post
              URL
            </FieldLabel>
            <Input
              id={id}
              value={node.attrs.url}
              onChange={(event) =>
                updateAttributes({ url: event.target.value })
              }
            />
          </Field>
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="plain"
              onClick={deleteNode}
            >
              Remove embed
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {node.attrs.provider === "tiktok" ? "TikTok" : "Instagram"} embed
          </p>
          <p className="truncate text-xs text-muted">
            {node.attrs.url || "Select this block to add a link."}
          </p>
        </div>
      )}
    </NodeViewWrapper>
  );
}
const BlogImage = Node.create({
  name: "blogImage",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes: () => ({
    mediaId: { default: "" },
    alt: { default: "" },
    caption: { default: "" },
    src: { default: "" },
  }),
  parseHTML: () => [{ tag: "figure[data-blog-image]" }],
  renderHTML: () => ["figure", { "data-blog-image": "" }],
  addNodeView: () => ReactNodeViewRenderer(ImageView),
});
const BlogCallout = Node.create({
  name: "blogCallout",
  group: "block",
  content: "inline*",
  addAttributes: () => ({ title: { default: "Note" } }),
  parseHTML: () => [{ tag: "aside[data-blog-callout]" }],
  renderHTML: () => ["aside", { "data-blog-callout": "" }, 0],
  addNodeView: () => ReactNodeViewRenderer(CalloutView),
});
const BlogEmbed = Node.create({
  name: "blogEmbed",
  group: "block",
  atom: true,
  addAttributes: () => ({
    provider: { default: "instagram" },
    url: { default: "" },
    posterMediaId: { default: null },
  }),
  parseHTML: () => [{ tag: "div[data-blog-embed]" }],
  renderHTML: () => ["div", { "data-blog-embed": "" }],
  addNodeView: () => ReactNodeViewRenderer(EmbedView),
});
function QuoteView({ node, updateAttributes, selected }: NodeViewProps) {
  const id = useId();
  return (
    <NodeViewWrapper className="my-4 border-l-2 border-border pl-4">
      <NodeViewContent className="italic" />
      {selected ? (
        <Field contentEditable={false} className="mt-2">
          <FieldLabel htmlFor={id}>Attribution</FieldLabel>
          <Input
            id={id}
            value={node.attrs.attribution}
            onChange={(event) =>
              updateAttributes({ attribution: event.target.value })
            }
          />
        </Field>
      ) : node.attrs.attribution ? (
        <cite className="mt-1 block text-sm not-italic text-muted">
          {node.attrs.attribution}
        </cite>
      ) : null}
    </NodeViewWrapper>
  );
}
const BlogQuote = Node.create({
  name: "blockquote",
  group: "block",
  content: "paragraph+",
  defining: true,
  addAttributes: () => ({ attribution: { default: "" } }),
  parseHTML: () => [{ tag: "blockquote" }],
  renderHTML: () => ["blockquote", 0],
  addNodeView: () => ReactNodeViewRenderer(QuoteView),
});
const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    blockquote: false,
    code: false,
    codeBlock: false,
    strike: false,
    underline: false,
    horizontalRule: false,
    link: {
      openOnClick: false,
      autolink: false,
      isAllowedUri: (href) => /^https?:\/\//i.test(href),
    },
  }),
  BlogQuote,
  BlogImage,
  BlogCallout,
  BlogEmbed,
];

export function BlogBodyEditor({
  blocks,
  onChange,
  media,
  label = "Article body",
}: {
  blocks: BlogBlock[];
  onChange: (blocks: BlogBlock[]) => void;
  media: BlogMediaDto[];
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    content: blogBlocksToTiptap(blocks),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        class:
          "min-h-80 w-full px-4 py-6 text-sm leading-6 text-foreground outline-none [&>*]:mx-auto [&>*]:w-full [&>*]:max-w-3xl [&_p]:my-2 [&_p]:leading-6 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_a]:text-primary [&_a]:underline",
      },
    },
    onUpdate: ({ editor: current }) =>
      onChange(tiptapToBlogBlocks(current.getJSON())),
  });
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold"),
      italic: e?.isActive("italic"),
      h2: e?.isActive("heading", { level: 2 }),
      h3: e?.isActive("heading", { level: 3 }),
      bullet: e?.isActive("bulletList"),
      ordered: e?.isActive("orderedList"),
      quote: e?.isActive("blockquote"),
    }),
  });
  useEffect(() => {
    if (!editor) return;
    if (
      JSON.stringify(tiptapToBlogBlocks(editor.getJSON())) !==
      JSON.stringify(blocks)
    )
      editor.commands.setContent(blogBlocksToTiptap(blocks), {
        emitUpdate: false,
      });
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== "blogImage") return;
      const image = media.find((item) => item.id === node.attrs.mediaId);
      if (image && node.attrs.src !== image.url)
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            src: image.url,
          }),
        );
    });
  }, [blocks, editor, media]);
  async function insertImage(file: File) {
    if (!editor) return;
    let insertion = editor.state.selection.getBookmark();
    const mapInsertion = ({ transaction }: { transaction: Transaction }) => {
      insertion = insertion.map(transaction.mapping);
    };
    editor.on("transaction", mapInsertion);
    setUploading(true);
    setError("");
    try {
      const image = await uploadBlogImage(file);
      if (editor.isDestroyed) return;
      const selection = insertion.resolve(editor.state.doc);
      editor
        .chain()
        .focus()
        .setTextSelection(selection.to)
        .insertContent([
          {
            type: "blogImage",
            attrs: { mediaId: image.id, src: image.url, alt: "", caption: "" },
          },
          { type: "paragraph" },
        ])
        .run();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Image could not be uploaded.",
      );
    } finally {
      editor.off("transaction", mapInsertion);
      setUploading(false);
    }
  }
  const actions = [
    {
      label: "Heading 2",
      icon: IconH2,
      active: state?.h2,
      run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Heading 3",
      icon: IconH3,
      active: state?.h3,
      run: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "Quote",
      icon: IconBlockquote,
      active: state?.quote,
      run: () => editor?.chain().focus().toggleWrap("blockquote").run(),
    },
  ];
  return (
    <div className="space-y-2">
      <RichTextEditorSurface
        editor={editor}
        label={label}
        normalizeHref={normalizeBlogHref}
      >
        <RichTextToolbarDivider />
        {actions.map((action) => (
          <Button
            key={action.label}
            type="button"
            size="sm-icon"
            title={action.label}
            aria-label={action.label}
            aria-pressed={action.active ?? false}
            disabled={!editor}
            variant={action.active ? "secondary" : "plain"}
            onMouseDown={(event) => event.preventDefault()}
            onClick={action.run}
          >
            <action.icon aria-hidden="true" />
          </Button>
        ))}
        <RichTextToolbarDivider />
        <Button
          type="button"
          size="sm-icon"
          variant="plain"
          aria-label={uploading ? "Uploading image" : "Add image"}
          title="Add image"
          disabled={!editor || uploading}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <IconLoader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <IconPhotoPlus aria-hidden="true" />
          )}
        </Button>
        <Menu>
          <MenuTrigger
            disabled={!editor}
            render={
              <Button
                type="button"
                variant="plain"
                size="sm-icon"
                aria-label="More article tools"
                title="More article tools"
              />
            }
          >
            <IconDots aria-hidden="true" />
          </MenuTrigger>
          <MenuPopup>
            <MenuItem
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .insertContent({
                    type: "blogCallout",
                    attrs: { title: "Try this" },
                  })
                  .run()
              }
            >
              <IconInfoCircle />
              Callout
            </MenuItem>
            <MenuItem
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .insertContent({ type: "blogEmbed" })
                  .run()
              }
            >
              <IconBrandInstagram />
              Instagram post
            </MenuItem>
            <MenuItem
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .insertContent({
                    type: "blogEmbed",
                    attrs: { provider: "tiktok" },
                  })
                  .run()
              }
            >
              <IconBrandTiktok />
              TikTok video
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={() => editor?.chain().focus().undo().run()}>
              <IconArrowBackUp />
              Undo
            </MenuItem>
            <MenuItem onClick={() => editor?.chain().focus().redo().run()}>
              <IconArrowForwardUp />
              Redo
            </MenuItem>
          </MenuPopup>
        </Menu>
      </RichTextEditorSurface>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Upload article image"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void insertImage(file);
        }}
      />
      {error ? (
        <p role="alert" className="px-4 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
