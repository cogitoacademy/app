"use client";

import { useEffect, useMemo } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { RichTextEditorSurface } from "./rich-text-editor-surface";
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

  return (
    <Field>
      <FieldLabel id={labelId} htmlFor={id}>
        {label}
      </FieldLabel>
      <RichTextEditorSurface editor={editor} label={label} />
      <FieldDescription id={descriptionId}>{description}</FieldDescription>
      {error ? (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Field>
  );
}
