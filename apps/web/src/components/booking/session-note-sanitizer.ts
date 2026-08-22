"use client";

import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "em",
  "h2",
  "h3",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "ul",
] as const;

/**
 * Applies the same narrow contract as the server sanitizer before a note is
 * rendered in the browser. The API remains the source of truth; this second
 * pass protects previews and stale cached responses from becoming HTML sinks.
 */
export function sanitizeSessionNoteHtml(input: string) {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: ["href", "rel", "target"],
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["style", "script"],
  });
}
