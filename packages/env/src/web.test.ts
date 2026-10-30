import { expect, test } from "bun:test";
import { absoluteOrSameOriginRelativeUrl, env } from "./web";

test("web server URL accepts same-origin paths and absolute URLs", () => {
  expect(absoluteOrSameOriginRelativeUrl.parse("/rpc")).toBe("/rpc");
  expect(
    absoluteOrSameOriginRelativeUrl.parse("https://api.example.test/rpc"),
  ).toBe("https://api.example.test/rpc");
  expect(env.VITE_SERVER_URL).toBeUndefined();
});

test("web server URL rejects malformed and empty values", () => {
  expect(() => absoluteOrSameOriginRelativeUrl.parse("not a URL")).toThrow(
    "VITE_SERVER_URL must be an absolute URL",
  );
  expect(() => absoluteOrSameOriginRelativeUrl.parse("")).toThrow();
});
