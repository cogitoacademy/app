import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  expect,
  request,
  test,
  type APIRequestContext,
} from "@playwright/test";

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  STUDENT_EMAIL,
  STUDENT_PASSWORD,
  TUTOR_EMAIL,
  TUTOR_PASSWORD,
} from "../fixtures/test-accounts";
import { resolveE2eEnvFile } from "../fixtures/e2e-environment";
import { resetE2eAuthRateLimit } from "../fixtures/auth-rate-limit";
type FaqRichTextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  href?: string;
};

type FaqRichTextDocument = {
  type: "doc";
  blocks: Array<
    | { type: "paragraph"; content: FaqRichTextRun[] }
    | {
        type: "list";
        style: "ordered" | "unordered";
        items: FaqRichTextRun[][];
      }
  >;
};

type FaqAnswerBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; style: "ordered" | "unordered"; items: string[] };

type AdminFaqDto = {
  id: string;
  questionEn: string;
  questionId: string | null;
  answerEn: FaqAnswerBlock[];
  answerId: FaqAnswerBlock[] | null;
  questionEnRich: FaqRichTextDocument;
  questionIdRich: FaqRichTextDocument | null;
  answerEnRich: FaqRichTextDocument;
  answerIdRich: FaqRichTextDocument | null;
  isActive: boolean;
  showOnLanding: boolean;
  version: number;
  modifiedAt: string;
};

function paragraph(text: string): FaqRichTextDocument {
  return {
    type: "doc",
    blocks: [{ type: "paragraph", content: text ? [{ text }] : [] }],
  };
}

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

async function createAdminApiContext() {
  return createApiContext(ADMIN_EMAIL, ADMIN_PASSWORD);
}

async function createApiContext(email: string, password: string) {
  resetE2eAuthRateLimit();
  const context = await request.newContext({
    baseURL: process.env.SERVER_URL ?? "http://localhost:3101",
  });
  try {
    const response = await context.post("/api/auth/sign-in/email", {
      data: { email, password },
    });
    if (!response.ok()) {
      throw new Error(`API sign-in returned ${response.status()}`);
    }
    return context;
  } catch (error) {
    await context.dispose();
    throw error;
  }
}

async function adminFaqRpc<T>(
  context: APIRequestContext,
  procedure: "create" | "update",
  input: unknown,
) {
  const response = await context.post(`/rpc/adminFaq/${procedure}`, {
    data: { json: input },
  });
  if (!response.ok()) {
    throw new Error(
      `FAQ ${procedure} returned ${response.status()}: ${await response.text()}`,
    );
  }
  return ((await response.json()) as { json: T }).json;
}

test("students and tutors can read FAQ entries but cannot edit them", async ({
  browser,
}) => {
  assertDedicatedTestDatabase();

  const accounts = [
    { email: STUDENT_EMAIL, password: STUDENT_PASSWORD },
    { email: TUTOR_EMAIL, password: TUTOR_PASSWORD },
  ];

  const sessions = await Promise.all(
    accounts.map(async (account) => {
      const api = await createApiContext(account.email, account.password);
      return {
        api,
        storageState: await api.storageState(),
      };
    }),
  );

  // Reuse one browser context for both authenticated roles; the checks run
  // sequentially against the shared test server without creating test data.
  for (const { api, storageState } of sessions) {
    const context = await browser.newContext({ storageState });
    try {
      const rolePage = await context.newPage();
      await rolePage.goto("/faq");
      await expect(rolePage).toHaveURL(/\/faq$/);
      await expect(
        rolePage.getByRole("heading", { name: "FAQ", exact: true }),
      ).toBeVisible();
      await expect(
        rolePage.getByText("There are no FAQs available yet.", { exact: true }),
      ).toBeVisible();
      await expect(
        rolePage.getByRole("button", { name: "Add FAQ", exact: true }),
      ).toHaveCount(0);
      await expect(
        rolePage.getByRole("link", { name: "FAQ", exact: true }),
      ).toBeVisible();
    } finally {
      await context.close();
      await api.dispose();
    }
  }
});

test("admins can create and edit rich, alphabetized FAQs", async ({ page }) => {
  assertDedicatedTestDatabase();

  await page.goto("/admin-faq");
  await page.waitForURL(/\/(dashboard|login)(?:$|\/)/);

  const browser = page.context().browser();
  if (!browser) throw new Error("FAQ browser coverage needs a browser context");
  const fixtureIds: string[] = [];
  let adminApi: APIRequestContext | undefined;
  let adminContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;

  try {
    adminApi = await createAdminApiContext();
    adminContext = await browser.newContext({
      storageState: await adminApi.storageState(),
    });
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/admin-faq");
    await expect(
      adminPage.getByRole("heading", { name: "FAQ", exact: true }),
    ).toBeVisible();

    const suffix = randomUUID().slice(0, 8);
    const englishQuestion = `E2E FAQ question ${suffix}`;
    const indonesianQuestion = `Pertanyaan E2E ${suffix}`;
    const englishAnswer = `English answer ${suffix}`;
    const indonesianAnswer = `Jawaban Indonesia ${suffix}`;
    const questionEditor = adminPage.locator(
      '[data-faq-editor="faq-question-en-rich"]',
    );
    const answerEditor = adminPage.locator(
      '[data-faq-editor="faq-answer-en-rich"]',
    );
    const questionToolbar = adminPage.getByRole("toolbar", {
      name: "Question (English) formatting",
    });
    const answerToolbar = adminPage.getByRole("toolbar", {
      name: "Answer (English) formatting",
    });

    await adminPage
      .getByRole("button", { name: "Add FAQ", exact: true })
      .click();
    await expect(
      adminPage.getByRole("textbox", { name: "Question (Indonesian)" }),
    ).toHaveCount(0);
    await answerEditor.fill(englishAnswer);
    await adminPage
      .getByRole("button", { name: "Save FAQ", exact: true })
      .click();
    await expect(
      adminPage.getByText("Enter an English question.", { exact: true }),
    ).toBeVisible();
    await expect(questionEditor).toBeFocused();
    await expect(questionEditor).toHaveAttribute("aria-invalid", "true");
    await expect(questionEditor).toHaveAttribute(
      "aria-describedby",
      "faq-question-en-rich-description faq-question-en-rich-error",
    );

    await questionEditor.fill(englishQuestion);
    await answerEditor.press("Control+A");
    await answerEditor.press("Backspace");
    await expect(answerEditor).toHaveText("");
    await adminPage
      .getByRole("button", { name: "Save FAQ", exact: true })
      .click();
    await expect(
      adminPage.getByText("Add English answer content before saving.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(answerEditor).toBeFocused();
    await expect(answerEditor).toHaveAttribute("aria-invalid", "true");
    await answerEditor.fill(englishAnswer);

    await questionEditor.press("Control+A");
    await questionToolbar.getByRole("button", { name: "Bold" }).click();
    await questionToolbar
      .getByRole("button", { name: "Add or edit link" })
      .click();
    const linkInput = adminPage.locator("#faq-question-en-rich-link-href");
    await expect(linkInput).toBeVisible();
    await linkInput.fill("https://example.com/faq");
    await expect(linkInput).toHaveValue("https://example.com/faq");
    await linkInput.press("Enter");
    await expect(linkInput).toHaveCount(0);

    await answerEditor.press("End");
    await answerEditor.press("Enter");
    await answerToolbar.getByRole("button", { name: "Bulleted list" }).click();
    await answerEditor.type("First step");
    await answerEditor.press("Enter");
    await answerEditor.type("Second step");
    await answerEditor.press("Enter");
    await answerEditor.press("Enter");

    await adminPage
      .getByRole("button", { name: "Add Indonesian version" })
      .click();
    await adminPage
      .getByRole("textbox", { name: "Question (Indonesian)" })
      .fill(indonesianQuestion);
    await adminPage
      .getByRole("textbox", { name: "Answer (Indonesian)" })
      .fill(indonesianAnswer);
    await adminPage
      .getByRole("checkbox", { name: "Show on landing page" })
      .check();

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
    const created = (await createResponse.json()) as { json: AdminFaqDto };
    fixtureIds.push(created.json.id);

    expect(created.json).toMatchObject({
      questionEn: englishQuestion,
      questionId: indonesianQuestion,
      answerEn: [
        { type: "paragraph", text: englishAnswer },
        {
          type: "list",
          style: "unordered",
          items: ["First step", "Second step"],
        },
      ],
      answerId: [{ type: "paragraph", text: indonesianAnswer }],
      isActive: true,
      showOnLanding: true,
      version: 1,
    });
    expect(created.json.questionEnRich.blocks[0]).toMatchObject({
      type: "paragraph",
      content: [
        {
          text: englishQuestion,
          bold: true,
          href: "https://example.com/faq",
        },
      ],
    });
    expect(created.json.answerEnRich.blocks[1]).toMatchObject({
      type: "list",
      style: "unordered",
      items: [[{ text: "First step" }], [{ text: "Second step" }]],
    });

    const earlierQuestion = `AAA E2E FAQ ${suffix}`;
    const earlier = await adminFaqRpc<AdminFaqDto>(adminApi!, "create", {
      questionEnRich: paragraph(earlierQuestion),
      answerEnRich: paragraph("Alphabetical fixture."),
      isActive: true,
      showOnLanding: false,
    });
    fixtureIds.push(earlier.id);
    await adminPage.reload();
    const entriesCard = adminPage.locator('[data-slot="card"]').filter({
      has: adminPage.getByRole("heading", {
        name: "FAQ entries",
        exact: true,
      }),
    });
    await expect(
      entriesCard.locator(
        '[data-slot="card-body"] > div > [data-slot="stack"]',
      ),
    ).toHaveCSS("margin-left", "0px");
    const earlierItem = adminPage
      .locator('[data-slot="item"]')
      .filter({ hasText: earlierQuestion });
    const createdItem = adminPage
      .locator('[data-slot="item"]')
      .filter({ hasText: englishQuestion });
    await expect(earlierItem).toBeVisible();
    await expect(createdItem).toBeVisible();
    expect((await earlierItem.boundingBox())!.y).toBeLessThan(
      (await createdItem.boundingBox())!.y,
    );
    await expect(
      createdItem.getByText("Landing", { exact: true }),
    ).toBeVisible();
    const rowNumber = createdItem.locator('[data-slot="item-media"]');
    await expect(rowNumber).toHaveText(/^#\d+$/);
    await expect(rowNumber).toHaveCSS("font-size", "12px");
    expect(
      await rowNumber.evaluate(
        (element) => getComputedStyle(element).fontFamily,
      ),
    ).toBe(
      await adminPage
        .locator("body")
        .evaluate((element) => getComputedStyle(element).fontFamily),
    );
    await expect(createdItem.getByText(/^Updated /)).toBeVisible();

    const concurrent = await adminFaqRpc<AdminFaqDto>(adminApi!, "update", {
      id: created.json.id,
      expectedVersion: created.json.version,
      questionEnRich: created.json.questionEnRich,
      questionIdRich: created.json.questionIdRich,
      answerEnRich: created.json.answerEnRich,
      answerIdRich: created.json.answerIdRich,
      isActive: created.json.isActive,
      showOnLanding: created.json.showOnLanding,
    });
    expect(concurrent.version).toBe(2);

    await createdItem
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await expect(
      adminPage.getByRole("heading", { name: "Edit FAQ", exact: true }),
    ).toBeVisible();
    await questionEditor.fill(`${englishQuestion} updated`);
    await answerEditor.fill(`${englishAnswer} updated`);

    const conflictResponsePromise = adminPage.waitForResponse(
      (response) =>
        response.url().includes("/rpc/adminFaq/update") &&
        response.request().method() === "POST",
    );
    await adminPage
      .getByRole("button", { name: "Save FAQ", exact: true })
      .click();
    const conflictResponse = await conflictResponsePromise;
    expect(conflictResponse.status()).toBe(409);
    const conflictInput = (
      conflictResponse.request().postDataJSON() as {
        json: { id: string; expectedVersion: number };
      }
    ).json;

    await expect(adminPage.getByRole("alert")).toHaveText(
      "FAQ changed in another admin session. Reload and review it.",
    );
    await expect(questionEditor).toContainText(`${englishQuestion} updated`);
    expect(conflictInput).toMatchObject({
      id: created.json.id,
      expectedVersion: 1,
    });
    await expect(
      adminPage
        .locator('[data-slot="item"]')
        .filter({ hasText: englishQuestion })
        .getByText("Version 2", { exact: false }),
    ).toBeVisible();

    await adminPage
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    const refreshedItem = adminPage
      .locator('[data-slot="item"]')
      .filter({ hasText: englishQuestion });
    await expect(refreshedItem).toBeVisible();
    await refreshedItem
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await questionEditor.fill(`${englishQuestion} updated`);
    await answerEditor.fill(`${englishAnswer} updated`);

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
    const updated = (await successfulUpdate.json()) as { json: AdminFaqDto };
    expect(updated.json).toMatchObject({
      id: created.json.id,
      questionEn: `${englishQuestion} updated`,
      questionId: indonesianQuestion,
      answerEn: [{ type: "paragraph", text: `${englishAnswer} updated` }],
      answerId: [{ type: "paragraph", text: indonesianAnswer }],
      isActive: true,
      showOnLanding: true,
      version: 3,
    });
    const updatedItem = adminPage
      .locator('[data-slot="item"]')
      .filter({ hasText: `${englishQuestion} updated` });
    await expect(updatedItem).toBeVisible();
    await expect(
      updatedItem.getByText("Active", { exact: true }),
    ).toBeVisible();
    await expect(
      updatedItem.getByText("Landing", { exact: true }),
    ).toBeVisible();
  } finally {
    try {
      if (fixtureIds.length > 0) {
        assertDedicatedTestDatabase();
        const serverDir = path.resolve(process.cwd(), "../../apps/server");
        const selectedEnvFile = resolveE2eEnvFile(process.cwd(), process.env);
        const cleanupOutput = execFileSync(
          "bun",
          [
            `--env-file=${selectedEnvFile}`,
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
        await adminContext?.close();
      }
    }
  }
});
