import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CogitoMarks } from "./cogito-marks";

test("loading Marks exposes a busy label and hides the placeholder balance", () => {
  const html = renderToStaticMarkup(<CogitoMarks value={98765} loading />);
  expect(html).toContain('aria-label="Loading Marks"');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain("/cogito-mark.png");
  expect(html).toContain('data-slot="spinner"');
  expect(html).not.toContain("98765");
});

test("zero Marks remains a real balance after loading", () => {
  const html = renderToStaticMarkup(<CogitoMarks value={0} />);
  expect(html).toContain('aria-label="0 Marks"');
  expect(html).toContain(">0</span>");
});
