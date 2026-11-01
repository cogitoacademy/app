import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Calendar } from "@cogito-app/ui/components/selia/calendar";
import { DatePicker } from "@cogito-app/ui/components/selia/date-picker";

test("calendar dropdown displays the month name before its menu mounts", () => {
  const html = renderToStaticMarkup(<Calendar month={new Date(2026, 9, 22)} />);
  expect(html).toMatch(/Choose the Month[\s\S]*?>October</);
});

test("date picker treats an invalid stored date as empty", () => {
  const html = renderToStaticMarkup(
    <DatePicker value="invalid" required onChange={() => {}} />,
  );
  expect(html).toContain("Pick a date");
  expect(html).toContain('value=""');
});
