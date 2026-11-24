import { normalizeFaqHref } from "./faq-rich-text";
import type { JSONContent } from "@tiptap/react";
import type {
  BlogBlock,
  BlogRun,
} from "@cogito-app/api/modules/blog/blog.types";

function inline(textRuns: BlogRun[]): JSONContent[] {
  return textRuns
    .filter((run) => run.text)
    .map((run) => ({
      type: "text",
      text: run.text,
      marks: [
        ...(run.bold ? [{ type: "bold" }] : []),
        ...(run.italic ? [{ type: "italic" }] : []),
        ...(run.href ? [{ type: "link", attrs: { href: run.href } }] : []),
      ],
    }));
}
function runs(node: JSONContent): BlogRun[] {
  if (node.type === "text")
    return [
      {
        text: node.text ?? "",
        ...(node.marks?.some((m) => m.type === "bold") ? { bold: true } : {}),
        ...(node.marks?.some((m) => m.type === "italic")
          ? { italic: true }
          : {}),
        ...(node.marks?.find((m) => m.type === "link")
          ? { href: node.marks.find((m) => m.type === "link")!.attrs!.href }
          : {}),
      },
    ];
  if (node.type === "hardBreak") return [{ text: "\n" }];
  return (node.content ?? []).flatMap(runs);
}
function tableRow(cells: BlogRun[][], cellType: "tableHeader" | "tableCell") {
  return {
    type: "tableRow" as const,
    content: cells.map((cell) => ({
      type: cellType,
      content: [{ type: "paragraph" as const, content: inline(cell) }],
    })),
  };
}
export function blogBlocksToTiptap(blocks: BlogBlock[]): JSONContent {
  return {
    type: "doc",
    content: blocks.length
      ? blocks.map((block): JSONContent => {
          switch (block.type) {
            case "heading":
              return {
                type: "heading",
                attrs: { level: block.level },
                content: inline([{ text: block.text }]),
              };
            case "paragraph":
              return { type: "paragraph", content: inline(block.runs) };
            case "list":
              return {
                type: block.style === "ordered" ? "orderedList" : "bulletList",
                content: block.items.map((item) => ({
                  type: "listItem",
                  content: [{ type: "paragraph", content: inline(item) }],
                })),
              };
            case "quote":
              return {
                type: "blockquote",
                attrs: { attribution: block.attribution ?? "" },
                content: [{ type: "paragraph", content: inline(block.runs) }],
              };
            case "callout":
              return {
                type: "blogCallout",
                attrs: { title: block.title },
                content: inline(block.runs),
              };
            case "table":
              return {
                type: "table",
                content: [
                  ...(block.header
                    ? [tableRow(block.header, "tableHeader")]
                    : []),
                  ...block.rows.map((row) => tableRow(row, "tableCell")),
                ],
              };
            case "image":
              return { type: "blogImage", attrs: { ...block } };
            case "embed":
              return { type: "blogEmbed", attrs: { ...block } };
          }
        })
      : [{ type: "paragraph" }],
  };
}
export function tiptapToBlogBlocks(doc: JSONContent): BlogBlock[] {
  return (doc.content ?? []).flatMap((node): BlogBlock[] => {
    const content = runs(node);
    switch (node.type) {
      case "heading":
        return content.length
          ? [
              {
                type: "heading",
                level: node.attrs?.level === 3 ? 3 : 2,
                text: content.map((r) => r.text).join(""),
              },
            ]
          : [];
      case "paragraph":
        return content.length ? [{ type: "paragraph", runs: content }] : [];
      case "bulletList":
      case "orderedList":
        return [
          {
            type: "list",
            style: node.type === "orderedList" ? "ordered" : "unordered",
            items: (node.content ?? []).map(runs).filter((item) => item.length),
          },
        ];
      case "blockquote":
        return content.length
          ? [
              {
                type: "quote",
                runs: content,
                ...(node.attrs?.attribution
                  ? { attribution: node.attrs.attribution }
                  : {}),
              },
            ]
          : [];
      case "blogCallout":
        return [
          {
            type: "callout",
            title: node.attrs?.title ?? "Note",
            runs: content,
          },
        ];
      case "table": {
        const rows = (node.content ?? []).map((row) =>
          (row.content ?? []).map((cell) => runs(cell)),
        );
        if (rows.length === 0) return [];
        const firstRow = node.content?.[0]?.content ?? [];
        const hasHeader =
          firstRow.length > 0 &&
          firstRow.every((cell) => cell.type === "tableHeader");
        let header = hasHeader ? rows[0] : undefined;
        let body = hasHeader ? rows.slice(1) : rows;
        if (body.length === 0 && header) {
          body = [header];
          header = undefined;
        }
        const width = Math.max(...body.map((row) => row.length));
        const padded = body.map((row) => [
          ...row,
          ...Array.from({ length: width - row.length }, () => []),
        ]);
        const paddedHeader = header
          ? [
              ...header,
              ...Array.from({ length: width - header.length }, () => []),
            ]
          : undefined;
        return [
          {
            type: "table",
            ...(paddedHeader ? { header: paddedHeader } : {}),
            rows: padded,
          },
        ];
      }
      case "blogImage":
        return [
          {
            type: "image",
            mediaId: node.attrs!.mediaId,
            alt: node.attrs!.alt,
            ...(node.attrs?.caption ? { caption: node.attrs.caption } : {}),
          },
        ];
      case "blogEmbed":
        return [
          {
            type: "embed",
            provider: node.attrs!.provider,
            url: node.attrs!.url,
            ...(node.attrs?.posterMediaId
              ? { posterMediaId: node.attrs.posterMediaId }
              : {}),
          },
        ];
      default:
        return [];
    }
  });
}

export function normalizeBlogHref(value: string) {
  const href = normalizeFaqHref(value);
  return href && /^https?:\/\//i.test(href) ? href : null;
}
