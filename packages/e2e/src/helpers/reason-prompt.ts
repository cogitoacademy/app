import { expect, type Locator, type Page } from "@playwright/test";

export async function fillReasonPrompt(
  page: Page,
  triggerName: string,
  reasonLabel: string,
  value: string,
  scope: Page | Locator = page,
) {
  await scope.getByRole("button", { name: triggerName, exact: true }).click();
  const prompt = page.getByRole("dialog", { name: triggerName, exact: true });
  await prompt
    .getByRole("textbox", { name: reasonLabel, exact: true })
    .fill(value);
  await prompt.getByRole("button", { name: triggerName, exact: true }).click();
  await expect(prompt).not.toBeVisible();
}
