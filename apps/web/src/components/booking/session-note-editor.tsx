"use client";

import { useRef, useState } from "react";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Text } from "@cogito-app/ui/components/selia/text";

import { sanitizeSessionNoteHtml } from "./session-note-sanitizer";

const TEXTAREA_CLASS =
  "min-h-32 w-full resize-y rounded-lg border border-input-border bg-background px-3 py-2 text-foreground outline-none placeholder:text-dimmed focus:border-input-accent-border focus-visible:ring-2 focus-visible:ring-ring/30";

type SessionNoteEditorProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
};

export function SessionNoteEditor({
  id,
  value,
  onChange,
  maxLength = 10_000,
  disabled = false,
}: SessionNoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [linkUrl, setLinkUrl] = useState("");

  function replaceSelection(replacement: string, selectionLength: number) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
    if (nextValue.length > maxLength) return;
    onChange(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + selectionLength);
    });
  }

  function wrapSelection(open: string, close: string, placeholder: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const selected = value.slice(
      textarea.selectionStart,
      textarea.selectionEnd,
    );
    const text = selected || placeholder;
    replaceSelection(`${open}${text}${close}`, text.length);
  }

  function wrapLines(listTag: "ul" | "ol") {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const selected = value.slice(
      textarea.selectionStart,
      textarea.selectionEnd,
    );
    const lines = (selected || "List item")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const replacement = `<${listTag}>${lines
      .map((line) => `<li>${line}</li>`)
      .join("")}</${listTag}>`;
    replaceSelection(replacement, replacement.length);
  }

  function insertLink() {
    const url = linkUrl.trim();
    if (!url || !/^(?:https?:|mailto:)/i.test(url)) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const selected = value.slice(
      textarea.selectionStart,
      textarea.selectionEnd,
    );
    const label = selected || "Open link";
    const safeLabel = label
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    const safeUrl = url
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    const replacement = `<a href="${safeUrl}">${safeLabel}</a>`;
    replaceSelection(replacement, replacement.length);
    setLinkUrl("");
  }

  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-accent/30 p-1"
        role="toolbar"
        aria-label="Session note formatting"
      >
        <Button
          type="button"
          size="sm"
          variant="plain"
          onClick={() => wrapSelection("<strong>", "</strong>", "bold text")}
          disabled={disabled}
          aria-label="Bold"
        >
          <strong>B</strong>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="plain"
          onClick={() => wrapSelection("<em>", "</em>", "italic text")}
          disabled={disabled}
          aria-label="Italic"
        >
          <em>I</em>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="plain"
          onClick={() => wrapSelection("<h2>", "</h2>", "Heading")}
          disabled={disabled}
        >
          Heading
        </Button>
        <Button
          type="button"
          size="sm"
          variant="plain"
          onClick={() => wrapSelection("<p>", "</p>", "Paragraph")}
          disabled={disabled}
        >
          Paragraph
        </Button>
        <Button
          type="button"
          size="sm"
          variant="plain"
          onClick={() => wrapLines("ul")}
          disabled={disabled}
        >
          Bullets
        </Button>
        <Button
          type="button"
          size="sm"
          variant="plain"
          onClick={() => wrapLines("ol")}
          disabled={disabled}
        >
          Numbered
        </Button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="url"
          value={linkUrl}
          onChange={(event) => setLinkUrl(event.target.value)}
          placeholder="https://example.com"
          aria-label="Link URL"
          disabled={disabled}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={insertLink}
          disabled={disabled || !linkUrl.trim()}
        >
          Insert link
        </Button>
      </div>
      <textarea
        ref={textareaRef}
        id={id}
        className={TEXTAREA_CLASS}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Share progress, follow-up topics, or useful resources."
        aria-describedby={`${id}-help`}
      />
      <div className="flex items-center justify-between gap-3">
        <Text id={`${id}-help`} className="text-xs text-muted">
          Use the toolbar for headings, lists, emphasis, and links.
        </Text>
        <Text className="shrink-0 text-xs text-dimmed">
          {value.length.toLocaleString()} / {maxLength.toLocaleString()}
        </Text>
      </div>
      {value.trim() ? (
        <div className="rounded-lg border border-border bg-item p-3">
          <Text className="text-xs font-medium text-muted">Preview</Text>
          <div
            className="mt-2 space-y-2 text-sm [&_a]:text-info [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{
              __html: sanitizeSessionNoteHtml(value),
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
