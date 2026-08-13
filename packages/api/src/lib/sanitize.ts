/**
 * Minimal HTML sanitizer for session notes.
 *
 * Phase 0 scope is plain text + markdown-safe content. We do not run a
 * rich-text editor, so a lightweight whitelist sanitizer is sufficient:
 *   - strips <script>/<style> blocks (with their content)
 *   - drops disallowed/embedded tags (iframe, object, embed, img, ...)
 *   - strips `on*` event handler attributes
 *   - neutralizes javascript:/vbscript:/data:text/html URLs
 *   - allows a small safe set of block/inline tags and strips unknown tags
 */
const ALLOWED_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "a",
  "strong",
  "b",
  "em",
  "i",
  "br",
  "blockquote",
  "code",
  "pre",
]);

const REMOVE_WITH_CONTENT = new Set(["script", "style"]);

const DISALLOWED_TAGS = new Set([
  "iframe",
  "object",
  "embed",
  "img",
  "image",
  "video",
  "audio",
  "source",
  "track",
  "canvas",
  "svg",
  "math",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "optgroup",
  "label",
  "template",
  "slot",
]);

const DANGEROUS_URL = /^\s*(?:javascript:|vbscript:|data:\s*text\/html)/i;

function sanitizeAttributeValue(prefix: string, rawValue: string): string {
  const value = rawValue.trim().replace(/^["']|["']$/g, "");
  if (DANGEROUS_URL.test(value)) {
    // `prefix` already ends with `=`, so empty the attribute value directly.
    return `${prefix}""`;
  }
  return prefix + rawValue;
}

function sanitizeTag(raw: string, tagName: string): string {
  const stripped = raw.replace(
    /\s+on[a-zA-Z][a-zA-Z0-9]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi,
    "",
  );
  const cleaned = stripped.replace(
    /(\s+(?:href|src|xlink:href)\s*=\s*)("[^"]*"|'[^']*'|[^\s>]*)/gi,
    (_match, prefix: string, value: string) =>
      sanitizeAttributeValue(prefix, value),
  );
  if (!ALLOWED_TAGS.has(tagName)) return "";
  return cleaned;
}

export function sanitizeHtml(input: string): string {
  if (!input) return "";
  let result = "";
  let index = 0;

  while (index < input.length) {
    const open = input.indexOf("<", index);
    if (open === -1) {
      result += input.slice(index);
      break;
    }
    result += input.slice(index, open);

    if (input.startsWith("<!--", open)) {
      const end = input.indexOf("-->", open + 4);
      if (end !== -1) {
        index = end + 3;
      } else {
        result += "&lt;!--";
        index = open + 4;
      }
      continue;
    }

    const close = input.indexOf(">", open);
    if (close === -1) {
      result += "&lt;";
      index = open + 1;
      continue;
    }

    const raw = input.slice(open, close + 1);
    const tagMatch = /^<\/?\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(raw);
    if (!tagMatch) {
      result += "&lt;";
      index = open + 1;
      continue;
    }

    const tagName = tagMatch[1]!.toLowerCase();

    if (REMOVE_WITH_CONTENT.has(tagName)) {
      const endTag = input.toLowerCase().indexOf(`</${tagName}>`, close + 1);
      if (endTag !== -1) {
        index = endTag + tagName.length + 3;
      } else {
        index = close + 1;
      }
      continue;
    }

    if (DISALLOWED_TAGS.has(tagName) || !ALLOWED_TAGS.has(tagName)) {
      index = close + 1;
      continue;
    }

    if (raw.trimStart().startsWith("</")) {
      result += `</${tagName}>`;
    } else {
      result += sanitizeTag(raw, tagName);
    }
    index = close + 1;
  }

  return result;
}
