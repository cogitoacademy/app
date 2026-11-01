import { expect, type Locator, type Page } from "@playwright/test";

export async function fillReasonPrompt(
  page: Page,
  label: string,
  value: string,
  scope: Page | Locator = page,
) {
  await scope
    .getByRole("button", {
      name: `Add ${label.toLowerCase()} (required)`,
      exact: true,
    })
    .click();
  const prompt = page.getByRole("dialog", { name: label, exact: true });
  await prompt.getByRole("textbox", { name: label, exact: true }).fill(value);
  await prompt.getByRole("button", { name: "Use reason", exact: true }).click();
  await expect(prompt).not.toBeVisible();
}
