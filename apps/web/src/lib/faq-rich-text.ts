import type { JSONContent } from "@tiptap/react";
import type {
  FaqRichTextDocument,
  FaqRichTextRun,
} from "@cogito-app/api/modules/faq/faq.types";

function isAllowedFaqHref(href: string) {
  if (
    Array.from(href).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return false;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  if (href.startsWith("#") && href.length > 1) return true;
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

export function normalizeFaqHref(value: string) {
  const href = value.trim();
  if (!href) return null;
  if (
    /^[a-z][a-z\d+.-]*:/i.test(href) ||
    href.startsWith("/") ||
    href.startsWith("#")
  ) {
    return isAllowedFaqHref(href) ? href : null;
  }
  const normalized = `https://${href}`;
  return isAllowedFaqHref(normalized) ? normalized : null;
}

export function normalizeFaqRichTextDocument(
  document: FaqRichTextDocument | null | undefined,
  fallbackText = "",
): FaqRichTextDocument {
  if (
    document?.type === "doc" &&
    Array.isArray(document.blocks) &&
    document.blocks.length > 0
  ) {
    return document;
  }

  return {
    type: "doc",
    blocks: [
      {
        type: "paragraph",
        content: fallbackText ? [{ text: fallbackText }] : [],
      },
    ],
  };
}

export function faqRichTextToPlainText(document: FaqRichTextDocument) {
  return normalizeFaqRichTextDocument(document)
    .blocks.flatMap((block) =>
      block.type === "paragraph"
        ? [block.content.map(({ text }) => text).join("")]
        : block.items.map((item) => item.map(({ text }) => text).join("")),
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

function runsToTiptap(runs: FaqRichTextRun[]): JSONContent[] | undefined {
  const content = runs.flatMap((run) => {
    if (!run.text) return [];
    const marks: NonNullable<JSONContent["marks"]> = [];
    if (run.bold) marks.push({ type: "bold" });
    if (run.italic) marks.push({ type: "italic" });
    if (run.href) marks.push({ type: "link", attrs: { href: run.href } });
    return [
      { type: "text", text: run.text, ...(marks.length ? { marks } : {}) },
    ];
  });
  return content.length ? content : undefined;
}

function paragraphToTiptap(runs: FaqRichTextRun[]): JSONContent {
  const content = runsToTiptap(runs);
  return { type: "paragraph", ...(content ? { content } : {}) };
}

export function faqRichTextToTiptap(
  document: FaqRichTextDocument | null | undefined,
): JSONContent {
  const normalizedDocument = normalizeFaqRichTextDocument(document);
  return {
    type: "doc",
    content: normalizedDocument.blocks.map((block) =>
      block.type === "paragraph"
        ? paragraphToTiptap(block.content)
        : {
            type: block.style === "ordered" ? "orderedList" : "bulletList",
            content: block.items.map((item) => ({
              type: "listItem",
              content: [paragraphToTiptap(item)],
            })),
          },
    ),
  };
}

function readRuns(content: JSONContent[] | undefined): FaqRichTextRun[] {
  return (content ?? []).flatMap((node) => {
    if (node.type !== "text" || typeof node.text !== "string" || !node.text) {
      return [];
    }
    const marks = node.marks ?? [];
    const href = marks.find((mark) => mark.type === "link")?.attrs?.href;
    return [
      {
        text: node.text,
        ...(marks.some((mark) => mark.type === "bold") ? { bold: true } : {}),
        ...(marks.some((mark) => mark.type === "italic")
          ? { italic: true }
          : {}),
        ...(typeof href === "string" && isAllowedFaqHref(href) ? { href } : {}),
      },
    ];
  });
}

function readListItems(list: JSONContent): FaqRichTextRun[][] {
  return (list.content ?? []).flatMap((node) => {
    if (node.type !== "listItem") return [];
    const runs = (node.content ?? []).flatMap((child) =>
      child.type === "paragraph" ? readRuns(child.content) : [],
    );
    const nestedItems = (node.content ?? [])
      .filter(
        (child) => child.type === "bulletList" || child.type === "orderedList",
      )
      .flatMap(readListItems);
    return [...(runs.length ? [runs] : []), ...nestedItems];
  });
}

export function tiptapToFaqRichText(content: JSONContent): FaqRichTextDocument {
  const blocks: FaqRichTextDocument["blocks"] = [];
  for (const node of content.content ?? []) {
    if (node.type === "paragraph") {
      blocks.push({ type: "paragraph", content: readRuns(node.content) });
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      const items = readListItems(node);
      if (items.length) {
        blocks.push({
          type: "list",
          style: node.type === "orderedList" ? "ordered" : "unordered",
          items,
        });
      }
    }
  }

  return {
    type: "doc",
    blocks: blocks.length ? blocks : [{ type: "paragraph", content: [] }],
  };
}
