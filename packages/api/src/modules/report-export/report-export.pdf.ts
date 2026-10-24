import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import fontBase64 from "./font.json";
import headerBase64 from "./assets/student-report-header.json";

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
const SIDE_MARGIN = 70;
const CONTENT_WIDTH = PAGE_WIDTH - SIDE_MARGIN * 2;
const MIN_CONTENT_Y = 64;
const SECTION_GAP = 8;
const LINE_HEIGHT = 11.2;
const BODY_SIZE = 8.7;
const INK = rgb(0, 0, 0);
const ORANGE = rgb(1, 0.4, 0);

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

function addPage(
  pdf: PDFDocument,
  bold: PDFFont,
  header: PDFImage,
  continuationLabel?: string,
): PageCursor {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const headerWidth = PAGE_WIDTH - 12;
  const headerHeight = (headerWidth * header.height) / header.width;
  page.drawImage(header, {
    x: 6,
    y: PAGE_HEIGHT - 6 - headerHeight,
    width: headerWidth,
    height: headerHeight,
  });
  const title = "STUDENT REPORT";
  page.drawText(title, {
    x: PAGE_WIDTH - SIDE_MARGIN - bold.widthOfTextAtSize(title, 9),
    y: PAGE_HEIGHT - 99,
    size: 9,
    font: bold,
    color: ORANGE,
  });
  if (continuationLabel) {
    page.drawText(continuationLabel, {
      x: SIDE_MARGIN,
      y: PAGE_HEIGHT - 120,
      size: 7,
      font: bold,
      color: ORANGE,
    });
    return { page, y: PAGE_HEIGHT - 140 };
  }
  return { page, y: PAGE_HEIGHT - 128 };
}

function drawMetadata(
  cursor: PageCursor,
  studentName: string,
  entry: StudentReportPdfEntry,
  font: PDFFont,
  bold: PDFFont,
  onNewPage: () => PageCursor,
) {
  const labels: Record<string, string> = {
    Date: "Session Date",
    Topic: "Class Topic",
    "Cohort / class": "Cohort / class",
  };
  const ordered = [
    "Tutor",
    "Competition",
    "Date",
    "Mode",
    "Topic",
    "Class type",
    "Cohort / class",
    "Session",
    "Time",
  ];
  const remaining = [...entry.metadata];
  const cells = [{ label: "Student", value: studentName }];
  for (const label of ordered) {
    const index = remaining.findIndex((cell) => cell.label === label);
    if (index >= 0) cells.push(remaining.splice(index, 1)[0]!);
  }
  cells.push(...remaining);
  const gap = 16;
  const columnWidth = (CONTENT_WIDTH - gap) / 2;
  const labelWidth = 75;
  const valueWidth = columnWidth - labelWidth - 9;
  for (let index = 0; index < cells.length; index += 2) {
    const pair = cells.slice(index, index + 2);
    const values = pair.map((cell) =>
      wrapText(cell.value, font, BODY_SIZE, valueWidth),
    );
    const labelLines = pair.map((cell) =>
      wrapText(
        labels[cell.label] ?? cell.label,
        bold,
        BODY_SIZE,
        labelWidth - 5,
      ),
    );
    const count = Math.max(
      ...values.map((lines) => lines.length),
      ...labelLines.map((lines) => lines.length),
    );
    for (let offset = 0; offset < count; offset++) {
      if (cursor.y - LINE_HEIGHT < MIN_CONTENT_Y) cursor = onNewPage();
      pair.forEach((_cell, column) => {
        const x = SIDE_MARGIN + column * (columnWidth + gap);
        const labelLine = labelLines[column]![offset];
        const valueLine = values[column]![offset];
        if (labelLine)
          cursor.page.drawText(labelLine, {
            x,
            y: cursor.y,
            size: BODY_SIZE,
            font: bold,
            color: INK,
          });
        if (offset === 0)
          cursor.page.drawText(":", {
            x: x + labelWidth,
            y: cursor.y,
            size: BODY_SIZE,
            font,
            color: INK,
          });
        if (valueLine)
          cursor.page.drawText(valueLine, {
            x: x + labelWidth + 9,
            y: cursor.y,
            size: BODY_SIZE,
            font,
            color: INK,
          });
      });
      cursor.y -= LINE_HEIGHT;
    }
    cursor.y -= 3;
  }
  return cursor;
}

function drawFeedback(
  cursor: PageCursor,
  entry: StudentReportPdfEntry,
  font: PDFFont,
  bold: PDFFont,
  onNewPage: () => PageCursor,
) {
  const labelWidth = 145;
  const bodyX = SIDE_MARGIN + labelWidth + 15;
  const bodyWidth = CONTENT_WIDTH - labelWidth - 15;
  const labels: Record<string, string> = {
    "Session discussion": "Session focus",
    "Strengths observed": "Positive observations",
    "Areas for improvement": "Points of improvement",
  };
  if (cursor.y - 30 < MIN_CONTENT_Y) cursor = onNewPage();
  cursor.page.drawText("TUTOR FEEDBACK", {
    x: SIDE_MARGIN,
    y: cursor.y,
    size: 9,
    font: bold,
    color: ORANGE,
  });
  cursor.y -= 17;
  const bulletIndent = font.widthOfTextAtSize("• ", BODY_SIZE);
  const regular = entry.sections.map((section) =>
    section.bullets.flatMap((bullet) =>
      wrapText(bullet, font, BODY_SIZE, bodyWidth - bulletIndent).map(
        (text, index) => ({ text, first: index === 0 }),
      ),
    ),
  );
  for (const [sectionIndex, section] of entry.sections.entries()) {
    const lines = regular[sectionIndex]!;
    const labelLines = wrapText(
      labels[section.label] ?? section.label,
      bold,
      BODY_SIZE,
      labelWidth - 8,
    );
    const count = Math.max(lines.length, labelLines.length);
    for (let index = 0; index < count; index++) {
      const continued = cursor.y - LINE_HEIGHT < MIN_CONTENT_Y;
      if (continued) {
        cursor = onNewPage();
        // Repeat the section label on continuation pages so the prose has context.
        for (const [labelIndex, line] of labelLines.entries())
          cursor.page.drawText(line, {
            x: SIDE_MARGIN,
            y: cursor.y - labelIndex * LINE_HEIGHT,
            size: BODY_SIZE,
            font: bold,
            color: INK,
          });
      }
      const label = labelLines[index];
      if (label && !continued)
        cursor.page.drawText(label, {
          x: SIDE_MARGIN,
          y: cursor.y,
          size: BODY_SIZE,
          font: bold,
          color: INK,
        });
      if (index === 0 || continued)
        cursor.page.drawText(":", {
          x: SIDE_MARGIN + labelWidth,
          y: cursor.y,
          size: BODY_SIZE,
          font,
          color: INK,
        });
      const line = lines[index];
      if (line) {
        if (line.first)
          cursor.page.drawText("•", {
            x: bodyX,
            y: cursor.y,
            size: BODY_SIZE,
            font,
            color: INK,
          });
        cursor.page.drawText(line.text, {
          x: bodyX + bulletIndent,
          y: cursor.y,
          size: BODY_SIZE,
          font,
          color: INK,
        });
      }
      cursor.y -= LINE_HEIGHT;
    }
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
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const header = await pdf.embedPng(Buffer.from(headerBase64, "base64"));
  const pages: PDFPage[] = [];
  for (const entry of model.reports) {
    let cursor = addPage(pdf, bold, header);
    pages.push(cursor.page);
    const newContinuationPage = () => {
      cursor = addPage(
        pdf,
        bold,
        header,
        entry.isLegacy
          ? "LEGACY REPORT - CONTINUATION"
          : "SESSION REPORT - CONTINUATION",
      );
      pages.push(cursor.page);
      return cursor;
    };
    cursor = drawMetadata(
      cursor,
      model.studentName,
      entry,
      font,
      bold,
      newContinuationPage,
    );
    cursor.y -= 12;
    drawFeedback(cursor, entry, font, bold, newContinuationPage);
  }
  pages.forEach((page, index) => {
    page.drawText(
      `Generated ${formatDate(model.generatedAt, { dateStyle: "long" })} by Cogito Academy`,
      { x: SIDE_MARGIN, y: 31, size: 8, font, color: INK },
    );
    if (pages.length > 1) {
      const pagination = `${index + 1} / ${pages.length}`;
      page.drawText(pagination, {
        x: PAGE_WIDTH - SIDE_MARGIN - font.widthOfTextAtSize(pagination, 7),
        y: 31,
        size: 7,
        font,
        color: INK,
      });
    }
  });
  return pdf.save({ useObjectStreams: true });
}
