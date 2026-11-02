"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { EditorContent, useEditorState, type Editor } from "@tiptap/react";
import {
  IconBold,
  IconItalic,
  IconLink,
  IconLinkOff,
  IconList,
  IconListNumbers,
} from "@tabler/icons-react";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { normalizeFaqHref } from "@/lib/faq-rich-text";

type SelectionSnapshot = { from: number; to: number; linkActive: boolean };

function preserveEditorSelection(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

export function RichTextToolbarDivider() {
  return (
    <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />
  );
}

export function RichTextEditorSurface({
  editor,
  label,
  children,
  normalizeHref = normalizeFaqHref,
}: {
  editor: Editor | null;
  label: string;
  children?: ReactNode;
  normalizeHref?: (value: string) => string | null;
}) {
  const id = useId();
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
    const href = normalizeHref(linkHref);
    if (!href) {
      setLinkError("Enter a valid link address.");
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

  return (
    <div className="overflow-hidden rounded-lg border border-input-border bg-background focus-within:border-input-accent-border focus-within:ring-2 focus-within:ring-primary/30">
      <div
        role="toolbar"
        aria-label={`${label} formatting`}
        className="flex flex-wrap items-center gap-0.5 border-b border-border bg-item p-1.5 sm:gap-1"
      >
        <Button
          type="button"
          variant={editorState?.bold ? "secondary" : "plain"}
          size="sm-icon"
          title="Bold"
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
          title="Italic"
          aria-label="Italic"
          aria-pressed={editorState?.italic ?? false}
          disabled={!editor}
          onMouseDown={preserveEditorSelection}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <IconItalic aria-hidden="true" />
        </Button>
        <RichTextToolbarDivider />
        <Button
          type="button"
          variant={editorState?.bulletList ? "secondary" : "plain"}
          size="sm-icon"
          title="Bulleted list"
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
          title="Numbered list"
          aria-label="Numbered list"
          aria-pressed={editorState?.orderedList ?? false}
          disabled={!editor}
          onMouseDown={preserveEditorSelection}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <IconListNumbers aria-hidden="true" />
        </Button>
        <RichTextToolbarDivider />
        <Button
          type="button"
          variant="plain"
          size="sm-icon"
          title="Add or edit link"
          aria-label="Add or edit link"
          aria-expanded={linkOpen}
          aria-controls={linkOpen ? `${id}-link-panel` : undefined}
          disabled={!editor}
          onMouseDown={preserveEditorSelection}
          onClick={openLinkEditor}
        >
          <IconLink aria-hidden="true" />
        </Button>
        {children}
        {linkError && !linkOpen ? (
          <span role="status" className="px-2 text-xs text-danger">
            {linkError}
          </span>
        ) : null}
      </div>
      {linkOpen ? (
        <div
          id={`${id}-link-panel`}
          className="flex flex-col gap-3 border-b border-border bg-card p-3"
        >
          <Field className="min-w-0">
            <FieldLabel htmlFor={`${id}-link-href`}>Link address</FieldLabel>
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
          </Field>
          <div className="flex flex-wrap items-center justify-end gap-2">
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
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
