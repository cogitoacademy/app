export type TermsBlock = {
  type: "title" | "section" | "paragraph";
  text: string;
};

/** Convert the supplied terms' headings and paragraphs to semantic blocks. */
export function parseTermsDocument(source: string): TermsBlock[] {
  return source
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((text) => text.trim())
    .filter((text) => text && text !== "---")
    .map((text) => {
      if (text.startsWith("# ")) return { type: "title", text: text.slice(2) };
      if (text.startsWith("## "))
        return { type: "section", text: text.slice(3) };
      if (text.startsWith("### "))
        return { type: "section", text: text.slice(4) };
      return { type: "paragraph", text };
    });
}

export function splitTermsEmphasis(text: string) {
  return text.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g).map((part) => {
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__")))
      return { text: part.slice(2, -2), emphasis: "strong" as const };
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_")))
      return { text: part.slice(1, -1), emphasis: "em" as const };
    return { text: part, emphasis: null };
  });
}
