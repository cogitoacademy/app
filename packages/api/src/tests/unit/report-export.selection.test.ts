import { describe, expect, test } from "bun:test";
import {
  ReportSelectionError,
  selectReports,
} from "../../modules/report-export/report-export.selection";

describe("bulk report selection", () => {
  const reports = [{ id: "private:a" }, { id: "class:a" }, { id: "class:b" }];
  test("includes exactly the requested reports in server date order", () => {
    expect(selectReports(reports, ["class:b", "private:a"])).toEqual([
      reports[0],
      reports[2],
    ]);
  });
  test("rejects an unavailable or other student's report without exporting a subset", () => {
    expect(() =>
      selectReports(reports, ["private:a", "class:foreign"]),
    ).toThrow(ReportSelectionError);
    expect(() => selectReports([], ["private:a"])).toThrow(
      ReportSelectionError,
    );
  });
  test("rejects empty, duplicate and oversized selections", () => {
    expect(() => selectReports(reports, [])).toThrow(ReportSelectionError);
    expect(() => selectReports(reports, ["private:a", "private:a"])).toThrow(
      ReportSelectionError,
    );
    const oversized = Array.from({ length: 101 }, (_, index) => ({
      id: String(index),
    }));
    expect(() =>
      selectReports(
        oversized,
        oversized.map((report) => report.id),
      ),
    ).toThrow(ReportSelectionError);
  });
  test("supports source-specific keys without changing the stored PDF report id", () => {
    const sources = [
      { id: "a", key: "private:a" },
      { id: "a", key: "class:a" },
    ];
    expect(selectReports(sources, ["class:a"], (report) => report.key)).toEqual(
      [sources[1]],
    );
  });
});
