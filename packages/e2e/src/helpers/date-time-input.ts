import { expect, type Page } from "@playwright/test";

export function toDateTimeLocal(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export async function fillDateTimeInput(page: Page, id: string, date: Date) {
  const [dateValue, timeValue] = toDateTimeLocal(date).split("T") as [
    string,
    string,
  ];
  await page.locator(`#${id}`).click();

  await page.getByRole("combobox", { name: "Choose the Month" }).click();
  await page
    .getByRole("option", {
      name: new Intl.DateTimeFormat("en-US", { month: "long" }).format(date),
      exact: true,
    })
    .click();

  await page.getByRole("combobox", { name: "Choose the Year" }).click();
  await page
    .getByRole("option", { name: String(date.getFullYear()), exact: true })
    .click();

  await page.locator(`[data-day="${dateValue}"]`).getByRole("button").click();
  const timeInput = page.locator(`#${id}-time`);
  await timeInput.fill(timeValue);
  await expect(timeInput).toHaveValue(timeValue);
  await expect(page.locator(`#${id}`)).not.toContainText("Pick a date");
}
