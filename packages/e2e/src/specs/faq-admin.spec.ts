import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../fixtures/test-accounts";

type FaqAnswerBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; style: "ordered" | "unordered"; items: string[] };

type FaqEntry = {
  id: string;
  questionEn: string;
  questionId: string | null;
  answerEn: FaqAnswerBlock[];
  answerId: FaqAnswerBlock[] | null;
  sortOrder: number;
  isActive: boolean;
  showOnLanding: boolean;
  version: number;
};

function assertDedicatedTestDatabase() {
  let databaseUrl: URL | undefined;
  try {
    if (process.env.DATABASE_URL)
      databaseUrl = new URL(process.env.DATABASE_URL);
  } catch {
    databaseUrl = undefined;
  }

  if (
    process.env.NODE_ENV !== "test" ||
    databaseUrl?.pathname.replace(/^\/+/, "") !== "cogito-test" ||
    !["localhost", "127.0.0.1", "::1"].includes(
      databaseUrl?.hostname.toLowerCase() ?? "",
    )
  ) {
    throw new Error(
      "FAQ browser coverage requires NODE_ENV=test and the local cogito-test database.",
    );
  }
}

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator("input#email").fill(ADMIN_EMAIL);
  await page.locator("input#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL(/\/(dashboard|profile)(?:$|\/)/);
}

async function createAdminApiContext() {
  const context = await request.newContext({
    baseURL: process.env.SERVER_URL ?? "http://localhost:3101",
  });
  try {
    const response = await context.post("/api/auth/sign-in/email", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    if (!response.ok()) {
      throw new Error(`Admin API sign-in returned ${response.status()}`);
    }
    return context;
  } catch (error) {
    await context.dispose();
    throw error;
  }
}

async function adminFaqRpc<T>(context: APIRequestContext, input: unknown) {
  const response = await context.post("/rpc/adminFaq/update", {
    data: { json: input },
  });
  if (!response.ok()) {
    throw new Error(
      `FAQ update returned ${response.status()}: ${await response.text()}`,
    );
  }
  return ((await response.json()) as { json: T }).json;
}

test("FAQ is admin-only and admins can create and edit ordered localized entries", async ({
  page,
}) => {
  assertDedicatedTestDatabase();

  await page.goto("/admin-faq");
  await page.waitForURL(/\/dashboard(?:$|\/)/);

  const browser = page.context().browser();
  if (!browser) throw new Error("FAQ browser coverage needs a browser context");
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const fixtureIds: string[] = [];
  let adminApi: APIRequestContext | undefined;

  try {
    await loginAsAdmin(adminPage);
    adminApi = await createAdminApiContext();
    await adminPage.goto("/admin-faq");
    await expect(
      adminPage.getByRole("heading", { name: "FAQ", exact: true }),
    ).toBeVisible();

    const suffix = randomUUID().slice(0, 8);
    const englishQuestion = `E2E FAQ question ${suffix}`;
    const indonesianQuestion = `Pertanyaan E2E ${suffix}`;
    const englishAnswer = `English answer ${suffix}`;
    const indonesianAnswer = `Jawaban Indonesia ${suffix}`;
    const englishAnswerParagraph = adminPage
      .getByRole("group", { name: "Answer (English)" })
      .getByLabel("Paragraph 1");

    await adminPage
      .getByRole("button", { name: "Add FAQ", exact: true })
      .click();
    await englishAnswerParagraph.fill(englishAnswer);
    await adminPage
      .getByRole("button", { name: "Save FAQ", exact: true })
      .click();
    await expect(
      adminPage.getByText("Enter an English question.", { exact: true }),
    ).toBeVisible();
    await expect(adminPage.locator("#faq-question-en")).toBeFocused();
    await expect(adminPage.locator("#faq-question-en")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(adminPage.locator("#faq-question-en")).toHaveAttribute(
      "aria-describedby",
      "faq-question-en-error",
    );

    await adminPage
      .getByLabel("Question (English)", { exact: true })
      .fill(englishQuestion);
    await englishAnswerParagraph.fill("");
    await adminPage
      .getByRole("button", { name: "Save FAQ", exact: true })
      .click();
    await expect(
      adminPage.getByText("Add at least one English answer block.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(englishAnswerParagraph).toBeFocused();
    await expect(englishAnswerParagraph).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(englishAnswerParagraph).toHaveAttribute(
      "aria-describedby",
      "answer-english-description faq-answer-en-error",
    );
    await englishAnswerParagraph.fill(englishAnswer);
    await adminPage
      .getByLabel("Question (Indonesian, optional)", { exact: true })
      .fill(indonesianQuestion);
    await adminPage
      .getByRole("button", { name: "Add paragraph", exact: true })
      .nth(1)
      .click();
    await adminPage
      .getByRole("group", { name: "Answer (Indonesian, optional)" })
      .getByLabel("Paragraph 1")
      .fill(indonesianAnswer);
    await adminPage.locator('[role="checkbox"]').nth(0).click();
    await adminPage.locator('[role="checkbox"]').nth(1).click();
    const sortOrderInput = adminPage.getByLabel("Sort order", { exact: true });
    await sortOrderInput.fill("20.5");
    await adminPage
      .getByRole("button", { name: "Save FAQ", exact: true })
      .click();
    await expect(
      adminPage.getByText(
        "Sort order must be a whole number greater than or equal to zero.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(sortOrderInput).toBeFocused();
    await expect(sortOrderInput).toHaveAttribute("aria-invalid", "true");
    await expect(sortOrderInput).toHaveAttribute(
      "aria-describedby",
      "faq-sort-order-error",
    );
    await sortOrderInput.fill("20");

    const createResponsePromise = adminPage.waitForResponse(
      (response) =>
        response.url().includes("/rpc/adminFaq/create") &&
        response.request().method() === "POST",
    );
    await adminPage
      .getByRole("button", { name: "Save FAQ", exact: true })
      .click();
    const createResponse = await createResponsePromise;
    expect(createResponse.ok()).toBe(true);
    const created = (await createResponse.json()) as { json: FaqEntry };
    fixtureIds.push(created.json.id);

    const entry = adminPage
      .locator('[data-slot="item"]')
      .filter({ hasText: englishQuestion });
    await expect(entry).toBeVisible();
    await expect(entry.getByText("Inactive", { exact: true })).toBeVisible();
    await expect(entry.getByText("Landing", { exact: true })).toBeVisible();
    await expect(
      entry.getByText("Order 20 · Version 1", { exact: true }),
    ).toBeVisible();
    expect(created.json).toMatchObject({
      questionEn: englishQuestion,
      questionId: indonesianQuestion,
      answerEn: [{ type: "paragraph", text: englishAnswer }],
      answerId: [{ type: "paragraph", text: indonesianAnswer }],
      sortOrder: 20,
      isActive: false,
      showOnLanding: true,
      version: 1,
    });

    const concurrent = await adminFaqRpc<FaqEntry>(adminApi!, {
      id: created.json.id,
      expectedVersion: created.json.version,
      questionEn: created.json.questionEn,
      questionId: created.json.questionId ?? undefined,
      answerEn: created.json.answerEn,
      answerId: created.json.answerId,
      sortOrder: 21,
      isActive: created.json.isActive,
      showOnLanding: created.json.showOnLanding,
    });
    expect(concurrent.version).toBe(2);

    await entry.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(
      adminPage.getByRole("heading", { name: "Edit FAQ", exact: true }),
    ).toBeVisible();
    await adminPage
      .getByLabel("Question (English)", { exact: true })
      .fill(`${englishQuestion} updated`);
    await adminPage
      .getByRole("group", { name: "Answer (English)" })
      .getByLabel("Paragraph 1")
      .fill(`${englishAnswer} updated`);
    await adminPage.getByLabel("Sort order", { exact: true }).fill("40");
    await adminPage.locator('[role="checkbox"]').nth(0).click();
    await adminPage.locator('[role="checkbox"]').nth(1).click();

    const updateResponsePromise = adminPage.waitForResponse(
      (response) =>
        response.url().includes("/rpc/adminFaq/update") &&
        response.request().method() === "POST",
    );
    await adminPage
      .getByRole("button", { name: "Save FAQ", exact: true })
      .click();
    const updateResponse = await updateResponsePromise;
    expect(updateResponse.status()).toBe(409);
    const updateInput = (
      updateResponse.request().postDataJSON() as {
        json: { id: string; expectedVersion: number };
      }
    ).json;

    await expect(adminPage.getByRole("alert")).toHaveText(
      "FAQ changed in another admin session. Reload and review it.",
    );
    await expect(
      adminPage.getByLabel("Question (English)", { exact: true }),
    ).toHaveValue(`${englishQuestion} updated`);
    await expect(
      adminPage.getByLabel("Sort order", { exact: true }),
    ).toHaveValue("40");
    expect(updateInput).toMatchObject({
      id: created.json.id,
      expectedVersion: 1,
    });
    await expect(
      adminPage
        .locator('[data-slot="item"]')
        .filter({ hasText: englishQuestion })
        .getByText("Order 21 · Version 2", { exact: true }),
    ).toBeVisible();

    await adminPage
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    const refreshedEntry = adminPage
      .locator('[data-slot="item"]')
      .filter({ hasText: englishQuestion });
    await expect(refreshedEntry).toBeVisible();
    await refreshedEntry
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await adminPage
      .getByLabel("Question (English)", { exact: true })
      .fill(`${englishQuestion} updated`);
    await adminPage
      .getByRole("group", { name: "Answer (English)" })
      .getByLabel("Paragraph 1")
      .fill(`${englishAnswer} updated`);
    await adminPage.getByLabel("Sort order", { exact: true }).fill("40");
    await adminPage.locator('[role="checkbox"]').nth(0).click();
    await adminPage.locator('[role="checkbox"]').nth(1).click();

    const successfulUpdatePromise = adminPage.waitForResponse(
      (response) =>
        response.url().includes("/rpc/adminFaq/update") &&
        response.request().method() === "POST",
    );
    await adminPage
      .getByRole("button", { name: "Save FAQ", exact: true })
      .click();
    const successfulUpdate = await successfulUpdatePromise;
    expect(successfulUpdate.ok()).toBe(true);
    const updated = (await successfulUpdate.json()) as { json: FaqEntry };
    expect(updated.json).toMatchObject({
      id: created.json.id,
      questionEn: `${englishQuestion} updated`,
      questionId: indonesianQuestion,
      answerEn: [{ type: "paragraph", text: `${englishAnswer} updated` }],
      answerId: [{ type: "paragraph", text: indonesianAnswer }],
      sortOrder: 40,
      isActive: true,
      showOnLanding: false,
      version: 3,
    });
    const successfulUpdateInput = (
      successfulUpdate.request().postDataJSON() as {
        json: { id: string; expectedVersion: number };
      }
    ).json;
    expect(successfulUpdateInput).toMatchObject({
      id: created.json.id,
      expectedVersion: 2,
    });
    const updatedEntry = adminPage
      .locator('[data-slot="item"]')
      .filter({ hasText: `${englishQuestion} updated` });
    await expect(updatedEntry).toBeVisible();
    await expect(
      updatedEntry.getByText("Active", { exact: true }),
    ).toBeVisible();
    await expect(
      updatedEntry.getByText("Landing", { exact: true }),
    ).toHaveCount(0);
    await expect(
      updatedEntry.getByText("Order 40 · Version 3", { exact: true }),
    ).toBeVisible();
  } finally {
    try {
      if (fixtureIds.length > 0) {
        assertDedicatedTestDatabase();
        const serverDir = path.resolve(process.cwd(), "../../apps/server");
        const cleanupOutput = execFileSync(
          "bun",
          [
            "--env-file=.env.test",
            "run",
            "src/seed/cleanup-e2e-faq.ts",
            ...fixtureIds,
          ],
          {
            cwd: serverDir,
            env: { ...process.env, NODE_ENV: "test" },
            encoding: "utf8",
          },
        );
        console.log(cleanupOutput.trim());
      }
    } finally {
      try {
        await adminApi?.dispose();
      } finally {
        await adminContext.close();
      }
    }
  }
});
