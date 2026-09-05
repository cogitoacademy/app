import { describe, expect, test } from "bun:test";
import {
  emitTraceparent,
  enterTrace,
  parseTraceparent,
  runWithTrace,
  getTrace,
  traceJobData,
} from "../../lib/trace";

describe("trace", () => {
  test("round-trips W3C traceparent", () => {
    const header = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    expect(emitTraceparent(parseTraceparent(header)!)).toBe(header);
  });
  test("scope survives await", async () => {
    await runWithTrace({ traceId: "req_abc", userId: "u1" }, async () => {
      await Bun.sleep(1);
      expect(getTrace()).toEqual({ traceId: "req_abc", userId: "u1" });
    });
  });
  test("parseTraceparent returns null for malformed headers", () => {
    expect(parseTraceparent("not-a-traceparent")).toBeNull();
    expect(parseTraceparent("00-short-00f067aa0ba902b7-01")).toBeNull();
    expect(parseTraceparent("")).toBeNull();
  });
  test("getTrace is undefined outside a scope", () => {
    expect(getTrace()).toBeUndefined();
  });
  test("enterTrace seeds the current context without leaking outward", () => {
    runWithTrace({ traceId: "outer" }, () => {
      enterTrace({ traceId: "inner", userId: "u9" });
      expect(getTrace()).toEqual({ traceId: "inner", userId: "u9" });
    });
    expect(getTrace()).toBeUndefined();
  });
  test("traceJobData stamps the active scope", () => {
    runWithTrace({ traceId: "req_job", userId: "u7" }, () => {
      expect(traceJobData()).toEqual({ traceId: "req_job", userId: "u7" });
    });
  });
  test("traceJobData omits a missing userId", () => {
    runWithTrace({ traceId: "req_nouser" }, () => {
      expect(traceJobData()).toEqual({ traceId: "req_nouser" });
    });
  });
  test("traceJobData is empty with no active scope", () => {
    expect(traceJobData()).toEqual({});
  });
});
