import { describe, test, expect } from "bun:test";
import { sanitizeHtml } from "../../lib/sanitize";

describe("sanitizeHtml", () => {
  test("strips script tags with their content", () => {
    expect(sanitizeHtml("<script>alert(1)</script>hello")).toBe("hello");
    expect(
      sanitizeHtml("<SCRIPT>alert(1)</SCRIPT>hello <script>bad()</script>"),
    ).toBe("hello ");
  });

  test("strips on* event handler attributes", () => {
    const out = sanitizeHtml(
      '<a href="https://x.test" onclick="alert(1)" onmouseover="x()">click</a>',
    );
    expect(out).toBe('<a href="https://x.test">click</a>');
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onmouseover");
  });

  test("neutralizes javascript: and vbscript: URLs", () => {
    const out = sanitizeHtml(
      '<a href="javascript:alert(1)">x</a><a href="vbscript:msgbox(1)">y</a>',
    );
    expect(out).toBe('<a href="">x</a><a href="">y</a>');
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("vbscript:");
  });

  test("neutralizes data:text/html URLs", () => {
    const out = sanitizeHtml(
      '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    );
    expect(out).toBe('<a href="">x</a>');
    expect(out).not.toContain("data:");
  });

  test("neutralizes data:text/html URLs that embed markup", () => {
    const out = sanitizeHtml(
      '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    );
    expect(out).not.toContain("data:");
    expect(out).not.toContain("<script>");
    expect(out).toMatch(/^<a href="">/);
  });

  test("drops disallowed embed/image tags", () => {
    const out = sanitizeHtml(
      '<img src="x" onerror="alert(1)"><iframe src="http://evil"></iframe>text',
    );
    expect(out).toBe("text");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<iframe");
  });

  test("strips style blocks with content", () => {
    expect(sanitizeHtml("<style>body{display:none}</style>ok")).toBe("ok");
  });

  test("keeps safe markup", () => {
    expect(
      sanitizeHtml("<p>Hello <strong>world</strong> <em>today</em></p>"),
    ).toBe("<p>Hello <strong>world</strong> <em>today</em></p>");
  });

  test("removes unknown tags but keeps text", () => {
    expect(sanitizeHtml("<marquee>hi</marquee> there")).toBe("hi there");
  });

  test("escapes unclosed tag markers", () => {
    expect(sanitizeHtml("2 < 3 and <")).toBe("2 &lt; 3 and &lt;");
  });

  test("handles comments", () => {
    expect(sanitizeHtml("<!-- hidden -->visible")).toBe("visible");
  });

  test("returns empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("");
  });
});
