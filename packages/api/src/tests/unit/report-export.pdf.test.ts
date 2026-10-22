import { describe, expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
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
