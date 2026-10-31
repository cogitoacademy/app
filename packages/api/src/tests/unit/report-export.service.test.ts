import { expect, test } from "bun:test";
import type { DbType } from "../../lib/db";
import { createReportExportService } from "../../modules/report-export/report-export.service";

function database(results: unknown[][]): DbType {
  const tx = {
    execute: async () => {},
    select: () => {
      const rows = results.shift() ?? [];
      const query = {
        from: () => query,
        where: () => query,
        limit: () => query,
        innerJoin: () => query,
        leftJoin: () => query,
        orderBy: () => query,
        // eslint-disable-next-line unicorn/no-thenable -- Drizzle query builders are PromiseLike.
        then: (resolve: (value: unknown[]) => unknown) =>
          Promise.resolve(rows).then(resolve),
      };
      return query;
    },
  };
  return {
    transaction: async (run: (tx: unknown) => unknown) => run(tx),
  } as unknown as DbType;
}

test("all export operations return null for an absent student", async () => {
  const service = createReportExportService({ db: database([[], [], []]) });
  expect(await service.getSummary("missing")).toBeNull();
  expect(await service.listReports("missing")).toBeNull();
  expect(await service.generatePdf("missing", ["class:missing"])).toBeNull();
});

test.each([
  {
    bookingType: "solo",
    sessionId: null,
    sessions: [],
    topic: null,
    modality: "online",
  },
  {
    bookingType: "group",
    sessionId: null,
    sessions: [],
    topic: { categoryName: "Debate", subcategoryName: " " },
    modality: "offline",
  },
  {
    bookingType: "series",
    sessionId: "session",
    sessions: [
      { id: "session", bookingId: "booking" },
      { id: "second", bookingId: "booking" },
    ],
    topic: null,
    modality: "online",
  },
  {
    bookingType: "series",
    sessionId: "not-listed",
    sessions: [{ id: "other", bookingId: "booking" }],
    topic: { categoryName: " ", subcategoryName: "Topic" },
    modality: "online",
  },
  {
    bookingType: "series",
    sessionId: "session",
    sessions: [],
    topic: null,
    modality: "online",
  },
  {
    bookingType: "series",
    sessionId: null,
    sessions: [],
    topic: null,
    modality: "online",
  },
])(
  "private export maps $bookingType feedback and session numbering",
  async ({ bookingType, sessionId, sessions, topic, modality }) => {
    const start = new Date("2040-01-01T00:00:00Z");
    const row = {
      id: "feedback",
      version: 1,
      bookingId: "booking",
      bookingNumber: 12,
      bookingType,
      targetGroupSize: 1,
      sessionId,
      bookingStartAt: start,
      bookingEndAt: new Date("2040-01-01T01:00:00Z"),
      childStartAt: sessionId ? start : null,
      childEndAt: null,
      tutorName: " ",
      modality,
      learningGoal: " ",
      sessionTopic: topic,
      priceSnapshot:
        bookingType === "solo" ? { engine: "v3", competition: "Debate" } : null,
      discussion: ["Discussed"],
      strengths: ["Strong"],
      improvements: [],
    };
    const results: unknown[][] = [
      [{ id: "student", name: "Student" }],
      [row],
      [{ role: "student" }],
      [{ id: "deduction" }],
    ];
    if (bookingType === "series") results.push(sessions);
    results.push([]);
    let rendered: unknown;
    const service = createReportExportService({
      db: database(results),
      clock: () => new Date("2040-01-03T00:00:00Z"),
      pdfRenderer: async (model) => {
        rendered = model;
        return new Uint8Array([1, 2]);
      },
    });
    expect(await service.generatePdf("student", ["private:feedback"])).toEqual(
      new Uint8Array([1, 2]),
    );
    expect(rendered).toMatchObject({
      studentName: "Student",
      reports: [
        {
          id: "feedback",
          type: "private",
          sections: [
            { label: "Session discussion", bullets: ["Discussed"] },
            { label: "Strengths observed", bullets: ["Strong"] },
            { label: "Areas for improvement", bullets: [] },
          ],
        },
      ],
    });
    const model = rendered as {
      reports: { metadata: { label: string; value: string }[] }[];
    };
    const metadata = model.reports[0]!.metadata;
    expect(metadata.find((item) => item.label === "Tutor")?.value).toBe(
      "Tutor",
    );
    expect(metadata.find((item) => item.label === "Session")?.value).toBe(
      bookingType === "series"
        ? `Session 1 of ${sessions.length || 1}`
        : bookingType === "group"
          ? "Group session"
          : "Private session",
    );
  },
);

test("summary uses the current clock by default and accepts no completed reports", async () => {
  const before = Date.now();
  const service = createReportExportService({
    db: database([[{ id: "student", name: "Student" }], [], []]),
  });
  const summary = await service.getSummary("student");
  expect(summary?.reportCount).toBe(0);
  expect(summary?.generatedAt.getTime()).toBeGreaterThanOrEqual(before);
  expect(summary?.generatedAt.getTime()).toBeLessThanOrEqual(Date.now());
});

test("class reports sort by descending date then ascending id for tied dates", async () => {
  const startAt = new Date("2040-01-01T00:00:00Z");
  const row = {
    startAt,
    endAt: new Date("2040-01-01T01:00:00Z"),
    classTitle: "Class",
    sessionTitle: "Session",
    classKind: "cohort",
    competition: "Debate",
    mode: "online",
    tutorName: "Tutor",
    classNumber: 1,
    sequenceNumber: 1,
    discussion: [],
    strengths: [],
    improvements: [],
  };
  const rows = [
    { ...row, id: "c" },
    { ...row, id: "a" },
    { ...row, id: "b" },
    { ...row, id: "b" },
    {
      ...row,
      id: "new",
      classKind: "masterclass",
      mode: "offline",
      startAt: new Date("2040-01-02T00:00:00Z"),
    },
  ];
  const service = createReportExportService({
    db: database([[{ id: "student", name: "Student" }], [], rows]),
    clock: () => new Date("2040-01-03T00:00:00Z"),
  });
  const data = await service.listReports("student");
  expect(data?.reports.map((report) => report.id)).toEqual([
    "class:new",
    "class:a",
    "class:b",
    "class:b",
    "class:c",
  ]);
  expect(data?.reports[0]?.type).toBe("masterclass");
});
