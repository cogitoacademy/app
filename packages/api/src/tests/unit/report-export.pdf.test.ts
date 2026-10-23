import { describe, expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { inflateSync } from "node:zlib";
import {
  createStudentReportPdf,
  type StudentReportPdfEntry,
} from "../../modules/report-export/report-export.pdf";

function makeEntry(
  bullets: {
    discussion: string[];
    strengths: string[];
    improvements: string[];
  },
  isLegacy = false,
): StudentReportPdfEntry {
  return {
    id: "report-1",
    scheduledStartAt: new Date("2026-10-20T02:00:00.000Z"),
    metadata: [
      { label: "Competition", value: "Debate" },
      { label: "Mode", value: "Online" },
      { label: "Tutor", value: "Tutor Name" },
      { label: "Date", value: "Tuesday, 20 October 2026" },
      { label: "Time", value: "09:00 - 10:00 WIB" },
      { label: "Class type", value: "Solo" },
      { label: "Topic", value: "Constructive case" },
      { label: "Cohort / class", value: "Private booking" },
      { label: "Session", value: "Private session" },
    ],
    sections: [
      { label: "Session discussion", bullets: bullets.discussion },
      { label: "Strengths observed", bullets: bullets.strengths },
      { label: "Areas for improvement", bullets: bullets.improvements },
    ],
    isLegacy,
  };
}

async function pageCount(bytes: Uint8Array) {
  return (await PDFDocument.load(bytes)).getPageCount();
}

async function textGeometry(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  const baselines: number[] = [];
  let glyphCount = 0;

  for (const page of pdf.getPages()) {
    const contents = page.node.Contents() as unknown as {
      size?: () => number;
      get?: (index: number) => unknown;
    };
    const refs =
      typeof contents.size === "function" && typeof contents.get === "function"
        ? Array.from({ length: contents.size() }, (_, index) =>
            contents.get!(index),
          )
        : [contents];

    for (const ref of refs) {
      const stream = pdf.context.lookup(ref as never) as unknown as {
        getContents(): Uint8Array;
      };
      const content = inflateSync(stream.getContents()).toString("latin1");
      for (const match of content.matchAll(
        /1 0 0 1 [\d.+-]+ ([\d.+-]+) Tm/gu,
      )) {
        baselines.push(Number(match[1]));
      }
      for (const match of content.matchAll(/<([0-9A-F]+)>\s*Tj/gu)) {
        glyphCount += match[1]!.length / 4;
      }
    }
  }

  return { pageCount: pdf.getPageCount(), baselines, glyphCount };
}

describe("student report PDF layout", () => {
  test("fits three 600-character feedback fields on one page", async () => {
    const entry = makeEntry({
      discussion: ["D".repeat(600)],
      strengths: ["S".repeat(600)],
      improvements: ["I".repeat(600)],
    });
    const bytes = await createStudentReportPdf({
      studentName: "Student Name",
      generatedAt: new Date("2026-10-22T04:30:00.000Z"),
      reports: [entry],
    });
    expect(await pageCount(bytes)).toBe(1);
  });

  test("fits three valid fields made from 300 one-character bullets on one page", async () => {
    const bullets = Array.from({ length: 300 }, () => "x");
    const entry = makeEntry({
      discussion: bullets,
      strengths: bullets,
      improvements: bullets,
    });
    expect(entry.sections[0]!.bullets.join("\n").length).toBe(599);

    const bytes = await createStudentReportPdf({
      studentName: "Student Name",
      generatedAt: new Date("2026-10-22T04:30:00.000Z"),
      reports: [entry],
    });
    const geometry = await textGeometry(bytes);

    expect(geometry.pageCount).toBe(1);
    expect(geometry.glyphCount).toBeGreaterThanOrEqual(1800);
  });

  test("keeps short legacy line breaks while dense current feedback stays one page", async () => {
    const bullets = Array.from({ length: 80 }, () => "word");
    expect(bullets[0]!.length * bullets.length + bullets.length - 1).toBe(399);

    const makeModel = (isLegacy: boolean) => ({
      studentName: "Student Name",
      generatedAt: new Date("2026-10-22T04:30:00.000Z"),
      reports: [
        makeEntry(
          {
            discussion: bullets,
            strengths: bullets,
            improvements: bullets,
          },
          isLegacy,
        ),
      ],
    });
    const legacyBytes = await createStudentReportPdf(makeModel(true));
    const currentBytes = await createStudentReportPdf(makeModel(false));

    expect(await pageCount(legacyBytes)).toBeGreaterThan(1);
    expect(await pageCount(currentBytes)).toBe(1);
  });

  test("paginates 5,000-character metadata without clipping or truncating it", async () => {
    const entry = makeEntry({
      discussion: ["A short discussion"],
      strengths: ["A clear strength"],
      improvements: ["One next step"],
    });
    entry.metadata[0]!.value = "M".repeat(5000);

    const bytes = await createStudentReportPdf({
      studentName: "Student Name",
      generatedAt: new Date("2026-10-22T04:30:00.000Z"),
      reports: [entry],
    });
    const geometry = await textGeometry(bytes);

    expect(geometry.pageCount).toBeGreaterThan(1);
    expect(geometry.glyphCount).toBeGreaterThanOrEqual(5000);
    expect(
      geometry.baselines.every(
        (baseline) => baseline >= 64 || Math.abs(baseline - 31) < 0.01,
      ),
    ).toBe(true);
  });

  test("keeps long legacy text across continuation pages and accepts Unicode/newlines", async () => {
    const bytes = await createStudentReportPdf({
      studentName: "Siti Nurhaliza 😀",
      generatedAt: new Date("2026-10-22T04:30:00.000Z"),
      reports: [
        makeEntry(
          {
            discussion: [
              "Legacy café text & escaped <value>\ncontinued ".repeat(100),
            ],
            strengths: ["Murid menunjukkan progress 😀"],
            improvements: ["Keep practising"],
          },
          true,
        ),
      ],
    });
    expect(await pageCount(bytes)).toBeGreaterThan(1);
  });
});
