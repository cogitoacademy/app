import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontBase64 from "./font.json";

export type ReportFeedbackSection = {
  label: string;
  bullets: string[];
};

export type StudentReportPdfEntry = {
  id: string;
  scheduledStartAt: Date;
  metadata: Array<{ label: string; value: string }>;
  sections: ReportFeedbackSection[];
  isLegacy: boolean;
};

export type StudentReportPdfModel = {
  studentName: string;
  generatedAt: Date;
  reports: StudentReportPdfEntry[];
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const SIDE_MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - SIDE_MARGIN * 2;
const FOOTER_LIMIT = 48;
const MIN_CONTENT_Y = 64;
const SECTION_GAP = 9;
const LINE_HEIGHT = 11.2;
const BODY_SIZE = 8.7;
const MUTED = rgb(0.36, 0.4, 0.46);
const INK = rgb(0.12, 0.15, 0.2);
const ORANGE = rgb(0.91, 0.32, 0.11);
const PAGE_RULE = rgb(0.87, 0.88, 0.9);

type PageCursor = { page: PDFPage; y: number };

function formatDate(value: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", {
    ...options,
    timeZone: "Asia/Jakarta",
  }).format(value);
}

function wrapLine(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/u).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    let chunk = "";
    for (const character of Array.from(word)) {
      const next = chunk + character;
      if (chunk && font.widthOfTextAtSize(next, size) > width) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk = next;
      }
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .split("\n")
    .flatMap((line) => (line ? wrapLine(line, font, size, width) : [""]));
}

function wrapCompactBullets(
  bullets: string[],
  font: PDFFont,
  size: number,
  width: number,
) {
  const words = bullets.flatMap((bullet) => {
    const parts = bullet
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, "    ")
      .split(/\s+/u)
      .filter(Boolean);
    return parts.length ? [`• ${parts[0]}`, ...parts.slice(1)] : ["•"];
  });
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    let chunk = "";
    for (const character of Array.from(word)) {
      const next = chunk + character;
      if (chunk && font.widthOfTextAtSize(next, size) > width) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk = next;
      }
    }
    line = chunk;
  }

  if (line) lines.push(line);
  return lines;
}

function addPage(
  pdf: PDFDocument,
  font: PDFFont,
  continuationLabel?: string,
): PageCursor {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 82,
    width: PAGE_WIDTH,
    height: 82,
    color: rgb(0.96, 0.97, 0.98),
  });
  page.drawText("COGITO ACADEMY", {
    x: SIDE_MARGIN,
    y: PAGE_HEIGHT - 34,
    size: 10,
    font,
    color: INK,
  });
  page.drawText("PRIVATE SESSION RECORDS", {
    x: SIDE_MARGIN,
    y: PAGE_HEIGHT - 51,
    size: 7,
    font,
    color: MUTED,
  });
  const title = "STUDENT REPORT";
  page.drawText(title, {
    x: PAGE_WIDTH - SIDE_MARGIN - font.widthOfTextAtSize(title, 16),
    y: PAGE_HEIGHT - 48,
    size: 16,
    font,
    color: ORANGE,
  });
  if (continuationLabel) {
    page.drawText(continuationLabel, {
      x: SIDE_MARGIN,
      y: PAGE_HEIGHT - 104,
      size: 9,
      font,
      color: ORANGE,
    });
    return { page, y: PAGE_HEIGHT - 126 };
  }
  return { page, y: PAGE_HEIGHT - 105 };
}

function drawTextLines(
  cursor: PageCursor,
  text: string,
  font: PDFFont,
  options: {
    x: number;
    width: number;
    size: number;
    lineHeight: number;
    color: ReturnType<typeof rgb>;
    onNewPage: () => PageCursor;
  },
) {
  const lines = wrapText(text, font, options.size, options.width);
  for (const line of lines) {
    if (cursor.y - options.lineHeight < MIN_CONTENT_Y) {
      cursor = options.onNewPage();
    }
    if (line) {
      cursor.page.drawText(line, {
        x: options.x,
        y: cursor.y,
        size: options.size,
        font,
        color: options.color,
      });
    }
    cursor.y -= options.lineHeight;
  }
  return cursor;
}

function drawMetadata(
  cursor: PageCursor,
  entry: StudentReportPdfEntry,
  font: PDFFont,
  onNewPage: () => PageCursor,
) {
  const gap = 22;
  const columnWidth = (CONTENT_WIDTH - gap) / 2;
  const labelValueHeight = 17;
  for (let index = 0; index < entry.metadata.length; index += 2) {
    const left = entry.metadata[index]!;
    const right = entry.metadata[index + 1];
    const leftLines = wrapText(left.value, font, 8.5, columnWidth);
    const rightLines = right
      ? wrapText(right.value, font, 8.5, columnWidth)
      : [];
    let leftOffset = 0;
    let rightOffset = 0;

    while (leftOffset < leftLines.length || rightOffset < rightLines.length) {
      let lineCapacity = Math.floor(
        (cursor.y - MIN_CONTENT_Y - labelValueHeight) / 10.5,
      );
      if (lineCapacity < 1) {
        cursor = onNewPage();
        lineCapacity = Math.floor(
          (cursor.y - MIN_CONTENT_Y - labelValueHeight) / 10.5,
        );
      }

      const rowLines = Math.min(
        lineCapacity,
        Math.max(
          leftLines.length - leftOffset,
          rightLines.length - rightOffset,
        ),
      );
      for (const [cell, x, lines, offset] of [
        [left, SIDE_MARGIN, leftLines, leftOffset],
        [right, SIDE_MARGIN + columnWidth + gap, rightLines, rightOffset],
      ] as const) {
        if (!cell || offset >= lines.length) continue;
        cursor.page.drawText(
          `${cell.label.toUpperCase()}${offset ? " (CONTINUED)" : ""}`,
          {
            x,
            y: cursor.y,
            size: 6.5,
            font,
            color: MUTED,
          },
        );
        for (let lineIndex = 0; lineIndex < rowLines; lineIndex += 1) {
          const line = lines[offset + lineIndex];
          if (line) {
            cursor.page.drawText(line, {
              x,
              y: cursor.y - 12 - lineIndex * 10.5,
              size: 8.5,
              font,
              color: INK,
            });
          }
        }
      }

      cursor.y -= labelValueHeight + rowLines * 10.5;
      leftOffset += rowLines;
      rightOffset += rowLines;
    }
  }
  return cursor;
}

function drawFeedback(
  cursor: PageCursor,
  entry: StudentReportPdfEntry,
  font: PDFFont,
  onNewPage: () => PageCursor,
) {
  if (cursor.y - 22 < MIN_CONTENT_Y) cursor = onNewPage();
  cursor.page.drawText("SESSION FEEDBACK", {
    x: SIDE_MARGIN,
    y: cursor.y,
    size: 9,
    font,
    color: INK,
  });
  cursor.y -= 20;

  const regularSections = entry.sections.map((section) =>
    section.bullets.flatMap((bullet) =>
      wrapText(`• ${bullet}`, font, BODY_SIZE, CONTENT_WIDTH - 18),
    ),
  );
  const regularHeight = regularSections.reduce(
    (height, lines) =>
      height + 13 + lines.length * LINE_HEIGHT + 2 + SECTION_GAP,
    0,
  );
  // Dense current-format lists flow inline; legacy reports retain line breaks.
  const compact = !entry.isLegacy && regularHeight > cursor.y - MIN_CONTENT_Y;

  for (const [sectionIndex, section] of entry.sections.entries()) {
    if (cursor.y - 18 < MIN_CONTENT_Y) cursor = onNewPage();
    cursor.page.drawText(section.label.toUpperCase(), {
      x: SIDE_MARGIN,
      y: cursor.y,
      size: 7,
      font,
      color: ORANGE,
    });
    cursor.y -= 13;

    const lines = compact
      ? wrapCompactBullets(section.bullets, font, BODY_SIZE, CONTENT_WIDTH - 18)
      : regularSections[sectionIndex]!;
    for (const line of lines) {
      if (cursor.y - LINE_HEIGHT < MIN_CONTENT_Y) cursor = onNewPage();
      cursor.page.drawText(line, {
        x: SIDE_MARGIN + 14,
        y: cursor.y,
        size: BODY_SIZE,
        font,
        color: INK,
      });
      cursor.y -= LINE_HEIGHT;
    }
    cursor.y -= 2;
    cursor.y -= SECTION_GAP;
  }
  return cursor;
}

export async function createStudentReportPdf(
  model: StudentReportPdfModel,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle("Student session reports");
  pdf.setAuthor("Cogito Academy");
  const font = await pdf.embedFont(Buffer.from(fontBase64, "base64"), {
    subset: true,
  });
  const pages: PDFPage[] = [];

  for (const entry of model.reports) {
    let cursor = addPage(pdf, font);
    pages.push(cursor.page);
    const newContinuationPage = () => {
      const label = entry.isLegacy
        ? "LEGACY REPORT - CONTINUATION"
        : "SESSION REPORT - CONTINUATION";
      cursor = addPage(pdf, font, label);
      pages.push(cursor.page);
      return cursor;
    };

    cursor.page.drawText("STUDENT", {
      x: SIDE_MARGIN,
      y: cursor.y,
      size: 6.5,
      font,
      color: MUTED,
    });
    cursor.y -= 20;
    cursor = drawTextLines(cursor, model.studentName, font, {
      x: SIDE_MARGIN,
      width: CONTENT_WIDTH,
      size: 15,
      lineHeight: 18,
      color: INK,
      onNewPage: newContinuationPage,
    });
    cursor.y -= 8;
    cursor = drawMetadata(cursor, entry, font, newContinuationPage);
    cursor.y -= 4;
    cursor = drawFeedback(cursor, entry, font, newContinuationPage);
  }

  const pageCount = pages.length;
  pages.forEach((page, index) => {
    page.drawLine({
      start: { x: SIDE_MARGIN, y: FOOTER_LIMIT },
      end: { x: PAGE_WIDTH - SIDE_MARGIN, y: FOOTER_LIMIT },
      thickness: 0.6,
      color: PAGE_RULE,
    });
    const footer = `COGITO ACADEMY  |  Generated ${formatDate(model.generatedAt, { dateStyle: "long" })} WIB  |  Page ${index + 1} of ${pageCount}`;
    page.drawText(footer, {
      x: SIDE_MARGIN,
      y: 31,
      size: 7,
      font,
      color: MUTED,
    });
  });

  return pdf.save({ useObjectStreams: true });
}
