"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  IconBold,
  IconItalic,
  IconLink,
  IconLinkOff,
  IconList,
  IconListNumbers,
} from "@tabler/icons-react";

import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import type { FaqRichTextDocument } from "@cogito-app/api/modules/faq/faq.types";

import {
  faqRichTextToTiptap,
  normalizeFaqHref,
  tiptapToFaqRichText,
} from "@/lib/faq-rich-text";

const FAQ_EDITOR_EXTENSIONS = [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    dropcursor: false,
    gapcursor: false,
    hardBreak: false,
    heading: false,
    horizontalRule: false,
    listKeymap: false,
    strike: false,
    trailingNode: false,
    underline: false,
    link: {
      autolink: false,
      defaultProtocol: "https",
      linkOnPaste: false,
      openOnClick: false,
      isAllowedUri: (href) => normalizeFaqHref(href) !== null,
    },
  }),
];

type SelectionSnapshot = {
  from: number;
  to: number;
  linkActive: boolean;
};

type FaqRichTextEditorProps = {
  id: string;
  label: string;
  value: FaqRichTextDocument;
  onChange: (value: FaqRichTextDocument) => void;
  description: string;
  error?: string;
  invalid?: boolean;
};

function isSameDocument(left: FaqRichTextDocument, right: FaqRichTextDocument) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function FaqRichTextEditor({
  id,
  label,
  value,
  onChange,
  description,
  error,
  invalid = false,
}: FaqRichTextEditorProps) {
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy = error ? `${descriptionId} ${errorId}` : descriptionId;
  const content = useMemo(() => faqRichTextToTiptap(value), [value]);
  const editor = useEditor({
    extensions: FAQ_EDITOR_EXTENSIONS,
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        "aria-describedby": describedBy,
        "data-faq-editor": id,
        class:
          "min-h-28 px-3 py-2.5 text-sm leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:pl-1 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      onChange(tiptapToFaqRichText(updatedEditor.getJSON()));
    },
  });
  const editorState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive("bold") ?? false,
      italic: currentEditor?.isActive("italic") ?? false,
      bulletList: currentEditor?.isActive("bulletList") ?? false,
      orderedList: currentEditor?.isActive("orderedList") ?? false,
    }),
  });
  const [linkSelection, setLinkSelection] = useState<SelectionSnapshot | null>(
    null,
  );
  const linkInputRef = useRef<HTMLElement | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (linkOpen) linkInputRef.current?.focus();
  }, [linkOpen]);

  useEffect(() => {
    if (!editor) return;
    const current = tiptapToFaqRichText(editor.getJSON());
    if (!isSameDocument(current, value)) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor, value]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    dom.setAttribute("aria-describedby", describedBy);
    if (invalid) dom.setAttribute("aria-invalid", "true");
    else dom.removeAttribute("aria-invalid");
  }, [describedBy, editor, invalid]);

  function openLinkEditor() {
    if (!editor) return;
    const selection = editor.state.selection;
    const linkActive = editor.isActive("link");
    if (selection.empty && !linkActive) {
      setLinkError("Select the text you want to link first.");
      return;
    }
    setLinkSelection({
      from: selection.from,
      to: selection.to,
      linkActive,
    });
    setLinkHref(editor.getAttributes("link").href ?? "");
    setLinkError(null);
    setLinkOpen(true);
  }

  function closeLinkEditor() {
    setLinkOpen(false);
    setLinkError(null);
    setLinkSelection(null);
    editor?.commands.focus();
  }

  function applyLink() {
    if (!editor) return;
    const selection = linkSelection;
    const href = normalizeFaqHref(linkHref);
    if (!href) {
      setLinkError("Enter a valid web address, email link, or page anchor.");
      return;
    }
    if (!selection) return;

    const chain = editor.chain().focus();
    if (selection.from !== selection.to) {
      chain.setTextSelection({ from: selection.from, to: selection.to });
    } else {
      chain.extendMarkRange("link");
    }
    chain.setLink({ href }).run();
    closeLinkEditor();
  }

  function removeLink() {
    if (!editor) return;
    const selection = linkSelection;
    if (!selection) return;
    const chain = editor.chain().focus();
    if (selection.from !== selection.to) {
      chain.setTextSelection({ from: selection.from, to: selection.to });
    } else {
      chain.extendMarkRange("link");
    }
    chain.unsetLink().run();
    closeLinkEditor();
  }

  function preserveEditorSelection(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  return (
    <Field>
      <FieldLabel id={labelId} htmlFor={id}>
        {label}
      </FieldLabel>
      <FieldDescription id={descriptionId}>{description}</FieldDescription>
      <div className="overflow-hidden rounded-lg border border-input-border bg-background focus-within:border-input-accent-border focus-within:ring-2 focus-within:ring-primary/30">
        <div
          role="toolbar"
          aria-label={`${label} formatting`}
          className="flex flex-wrap items-center gap-1 border-b border-border bg-item p-1.5"
        >
          <Button
            type="button"
            variant={editorState?.bold ? "secondary" : "plain"}
            size="sm-icon"
            aria-label="Bold"
            aria-pressed={editorState?.bold ?? false}
            disabled={!editor}
            onMouseDown={preserveEditorSelection}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <IconBold aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant={editorState?.italic ? "secondary" : "plain"}
            size="sm-icon"
            aria-label="Italic"
            aria-pressed={editorState?.italic ?? false}
            disabled={!editor}
            onMouseDown={preserveEditorSelection}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <IconItalic aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant={editorState?.bulletList ? "secondary" : "plain"}
            size="sm-icon"
            aria-label="Bulleted list"
            aria-pressed={editorState?.bulletList ?? false}
            disabled={!editor}
            onMouseDown={preserveEditorSelection}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <IconList aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant={editorState?.orderedList ? "secondary" : "plain"}
            size="sm-icon"
            aria-label="Numbered list"
            aria-pressed={editorState?.orderedList ?? false}
            disabled={!editor}
            onMouseDown={preserveEditorSelection}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <IconListNumbers aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="plain"
            size="sm-icon"
            aria-label="Add or edit link"
            aria-expanded={linkOpen}
            aria-controls={linkOpen ? `${id}-link-panel` : undefined}
            disabled={!editor}
            onMouseDown={preserveEditorSelection}
            onClick={openLinkEditor}
          >
            <IconLink aria-hidden="true" />
          </Button>
          {linkError && !linkOpen ? (
            <span role="status" className="px-2 text-xs text-danger">
              {linkError}
            </span>
          ) : null}
        </div>
        {linkOpen ? (
          <div
            id={`${id}-link-panel`}
            className="flex flex-wrap items-end gap-2 border-b border-border bg-card p-3"
          >
            <div className="min-w-52 flex-1">
              <label
                htmlFor={`${id}-link-href`}
                className="mb-1 block text-xs font-medium text-muted"
              >
                Link address
              </label>
              <Input
                id={`${id}-link-href`}
                ref={linkInputRef}
                value={linkHref}
                placeholder="https://example.com"
                aria-invalid={Boolean(linkError) || undefined}
                aria-describedby={linkError ? `${id}-link-error` : undefined}
                onChange={(event) => {
                  setLinkHref(event.target.value);
                  setLinkError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyLink();
                  }
                  if (event.key === "Escape") closeLinkEditor();
                }}
              />
              {linkError ? (
                <p id={`${id}-link-error`} className="mt-1 text-xs text-danger">
                  {linkError}
                </p>
              ) : null}
            </div>
            <Button type="button" size="sm" onClick={applyLink}>
              Apply link
            </Button>
            {linkSelection?.linkActive ? (
              <Button
                type="button"
                variant="plain"
                size="sm"
                onClick={removeLink}
              >
                <IconLinkOff aria-hidden="true" />
                Remove link
              </Button>
            ) : null}
            <Button
              type="button"
              variant="plain"
              size="sm"
              onClick={closeLinkEditor}
            >
              Cancel
            </Button>
          </div>
        ) : null}
        <EditorContent editor={editor} />
      </div>
      {error ? (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Field>
  );
}
