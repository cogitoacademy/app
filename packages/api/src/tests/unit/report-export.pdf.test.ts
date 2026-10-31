import { describe, expect, test } from "bun:test";
import { PDFDocument, PDFName } from "pdf-lib";
import { inflateSync } from "node:zlib";
import {
  createStudentReportPdf,
  type StudentReportPdfEntry,
} from "../../modules/report-export/report-export.pdf";

function makeEntry(bullets: {
  discussion: string[];
  strengths: string[];
  improvements: string[];
}): StudentReportPdfEntry {
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
  test("embeds the supplied header on every report and continuation page", async () => {
    const bytes = await createStudentReportPdf({
      studentName: "Sample Student",
      generatedAt: new Date("2026-10-24T05:00:00Z"),
      reports: [
        makeEntry(
          {
            discussion: ["Detailed legacy feedback. ".repeat(1000)],
            strengths: ["A strength"],
            improvements: ["Next step"],
          },
          true,
        ),
      ],
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    for (const page of pdf.getPages()) {
      const objects = page.node.Resources()!.lookup(PDFName.of("XObject")) as {
        keys(): unknown[];
      };
      expect(objects.keys().length).toBeGreaterThan(0);
    }
  });
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

  test("renders unknown feedback labels and metadata while normalizing tabs and line endings", async () => {
    const entry = makeEntry({
      discussion: ["first\tline\r\nsecond line"],
      strengths: [],
      improvements: ["Next step"],
    });
    entry.metadata.push({ label: "Custom field", value: "Custom value" });
    entry.sections[0]!.label = "Tutor note";
    const bytes = await createStudentReportPdf({
      studentName: "Student Name",
      generatedAt: new Date("2026-10-22T04:30:00.000Z"),
      reports: [entry],
    });
    expect(await pageCount(bytes)).toBe(1);
  });

  test("paginates dense bullet fields within the reference layout without dropping text", async () => {
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

    expect(geometry.pageCount).toBeGreaterThan(1);
    expect(geometry.glyphCount).toBeGreaterThanOrEqual(1800);
  });

  test("keeps each bullet separate and paginates dense current feedback", async () => {
    const bullets = Array.from({ length: 80 }, () => "word");
    expect(bullets[0]!.length * bullets.length + bullets.length - 1).toBe(399);
    const bytes = await createStudentReportPdf({
      studentName: "Student Name",
      generatedAt: new Date("2026-10-22T04:30:00.000Z"),
      reports: [
        makeEntry({
          discussion: bullets,
          strengths: bullets,
          improvements: bullets,
        }),
      ],
    });
    expect(await pageCount(bytes)).toBeGreaterThan(1);
    expect((await textGeometry(bytes)).glyphCount).toBeGreaterThanOrEqual(960);
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

  test("keeps overflow text across continuation pages and accepts Unicode/newlines", async () => {
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

test("sparse metadata and blank feedback remain renderable without losing later text", async () => {
  const entry = makeEntry({
    discussion: ["   ", "\n", "Visible follow-up"],
    strengths: [],
    improvements: [],
  });
  entry.metadata = [{ label: "Custom", value: "   " }];
  const geometry = await textGeometry(
    await createStudentReportPdf({
      studentName: "Student",
      generatedAt: new Date("2026-10-22"),
      reports: [entry],
    }),
  );
  expect(geometry.pageCount).toBe(1);
  expect(geometry.glyphCount).toBeGreaterThan(20);
});

test("feedback heading moves to the next page when metadata fills the first page", async () => {
  const entry = makeEntry({
    discussion: ["Feedback survives"],
    strengths: [],
    improvements: [],
  });
  entry.metadata = Array.from({ length: 86 }, (_, cell) => ({
    label: `Field ${cell}`,
    value: "Metadata value",
  }));
  const geometry = await textGeometry(
    await createStudentReportPdf({
      studentName: "Student",
      generatedAt: new Date("2026-10-22"),
      reports: [entry],
    }),
  );
  expect(geometry.pageCount).toBe(2);
  expect(geometry.glyphCount).toBeGreaterThan(1000);
  expect(
    geometry.baselines.every((y) => y >= 64 || Math.abs(y - 31) < 0.01),
  ).toBe(true);
});
