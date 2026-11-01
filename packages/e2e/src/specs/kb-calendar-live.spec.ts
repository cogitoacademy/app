import { randomUUID } from "node:crypto";
import {
  expect,
  request,
  test,
  type APIRequestContext,
} from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TUTOR_EMAIL,
  TUTOR_PASSWORD,
} from "../fixtures/test-accounts";

type Row = { id: string; version: number; title: string };
async function rpc<T>(
  api: APIRequestContext,
  procedure: string,
  input: unknown,
): Promise<T> {
  const response = await api.post(`/rpc/${procedure}`, {
    data: { json: input },
  });
  expect(response.ok(), `${procedure}: ${await response.text()}`).toBe(true);
  return (await response.json()).json as T;
}

test("live KB/calendar persistence, stale edits and private PDF access", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const target = new URL(process.env.DATABASE_URL ?? "");
  expect(target.hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  expect(target.port).toBe("6769");
  expect(target.pathname).toBe("/cogito-test");
  expect(process.env.KB_SOURCE).toBe("database");
  expect(process.env.CC_SOURCE).toBe("database");
  expect(process.env.CONTENT_ADMIN_ENABLED).toBe("true");
  const baseURL = process.env.SERVER_URL!;
  const admin = await request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const student = await request.newContext({
    baseURL,
    storageState: ".auth/student.json",
  });
  const tutor = await request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const anonymous = await request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const suffix = randomUUID();
  const owned: Array<{ kind: "resource" | "event"; id: string }> = [];
  try {
    expect(
      (
        await admin.post("/api/auth/sign-in/email", {
          data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await tutor.post("/api/auth/sign-in/email", {
          data: { email: TUTOR_EMAIL, password: TUTOR_PASSWORD },
        })
      ).ok(),
    ).toBe(true);
    const pdf = Buffer.from(
      `%PDF-1.4\n% Synthetic acceptance ${suffix}\n%%EOF\n`,
    );
    const upload = await rpc<{ fileId: string }>(
      admin,
      "adminContent/uploadPdf",
      { fileName: "synthetic-acceptance.pdf", base64: pdf.toString("base64") },
    );
    const resource = {
      kind: "resource",
      values: {
        title: `KB acceptance ${suffix}`,
        description: null,
        category: "guide",
        fileId: upload.fileId,
        isActive: true,
        sortOrder: 0,
      },
    };
    const created = await rpc<Row>(admin, "adminContent/create", {
      entry: resource,
      reason: "Create synthetic acceptance fixture",
    });
    owned.push({ kind: "resource", id: created.id });
    const event = {
      kind: "event",
      values: {
        title: `Calendar acceptance ${suffix}`,
        description: null,
        location: null,
        startDate: "2026-11-01T17:00:00Z",
        endDate: "2026-11-02T17:00:00Z",
        categoryIds: [],
        educationLevels: [],
        scale: null,
        organizer: null,
        registrationDeadline: null,
        registrationLink: null,
        socialMediaLink: null,
        isActive: true,
        sortOrder: 0,
      },
    };
    const createdEvent = await rpc<Row>(admin, "adminContent/create", {
      entry: event,
      reason: "Create synthetic calendar fixture",
    });
    owned.push({ kind: "event", id: createdEvent.id });
    const updatedEvent = {
      ...event,
      values: { ...event.values, title: `${event.values.title} updated` },
    };
    await rpc(admin, "adminContent/update", {
      id: createdEvent.id,
      expectedVersion: 1,
      entry: updatedEvent,
      reason: "Update calendar fixture",
    });
    expect(
      await rpc<Row[]>(admin, "adminContent/list", { kind: "event" }),
    ).toContainEqual(
      expect.objectContaining({
        id: createdEvent.id,
        version: 2,
        title: updatedEvent.values.title,
      }),
    );
    const staleEvent = await admin.post("/rpc/adminContent/update", {
      data: {
        json: {
          id: createdEvent.id,
          expectedVersion: 1,
          entry: event,
          reason: "Reject stale calendar edit",
        },
      },
    });
    expect(staleEvent.status()).toBe(409);

    await page.context().clearCookies();
    await page.context().addCookies((await admin.storageState()).cookies);
    await page.goto("/knowledge-bank");
    await page
      .getByRole("button", { name: "Manage resources", exact: true })
      .click();
    await page
      .getByRole("button", { name: new RegExp(resource.values.title) })
      .click();
    const title = page.getByLabel("Title", { exact: true });
    await title.fill(`${resource.values.title} saved`);
    await page
      .getByLabel("Reason for change")
      .fill("Save live browser fixture");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Changes saved live." }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "Manage resources", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: new RegExp(`${resource.values.title} saved`),
      })
      .click();
    await expect(title).toHaveValue(`${resource.values.title} saved`);
    await rpc(admin, "adminContent/update", {
      id: created.id,
      expectedVersion: 2,
      entry: {
        ...resource,
        values: {
          ...resource.values,
          title: `${resource.values.title} concurrent`,
        },
      },
      reason: "Concurrent admin update",
    });
    await title.fill(`${resource.values.title} unsaved`);
    await page
      .getByLabel("Reason for change")
      .fill("Reject stale browser edit");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "draft is retained" }),
    ).toBeVisible();
    await expect(title).toHaveValue(`${resource.values.title} unsaved`);

    const filePath = `/content/knowledge-bank/${created.id}/file`;
    expect(
      await (await anonymous.get("/api/auth/get-session")).json(),
    ).toBeNull();
    expect((await anonymous.get(filePath)).status()).toBe(401);
    for (const reader of [admin, student, tutor]) {
      const response = await reader.get(filePath);
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toBe("private, no-store");
      expect(await response.body()).toEqual(pdf);
    }
    expect(
      (await anonymous.get(`/uploads/${upload.fileId}.pdf`)).status(),
    ).toBe(404);
    for (const reader of [student, tutor]) {
      expect(
        (
          await reader.post("/rpc/adminContent/list", {
            data: { json: { kind: "resource" } },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await reader.post("/rpc/adminContent/remove", {
            data: {
              json: {
                kind: "resource",
                id: created.id,
                expectedVersion: 3,
                reason: "Reject unauthorized removal",
              },
            },
          })
        ).status(),
      ).toBe(403);
    }
  } finally {
    try {
      for (const item of owned.reverse()) {
        const rows = await rpc<Row[]>(admin, "adminContent/list", {
          kind: item.kind,
        });
        const row = rows.find((candidate) => candidate.id === item.id);
        if (row)
          await rpc(admin, "adminContent/remove", {
            ...item,
            expectedVersion: row.version,
            reason: "Clean synthetic acceptance fixture",
          });
      }
    } finally {
      await Promise.all([
        admin.dispose(),
        student.dispose(),
        tutor.dispose(),
        anonymous.dispose(),
      ]);
    }
  }
});
