import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { user, auditLog } from "@cogito-app/db/schema";

import { cleanTestUser } from "../helpers/factories";

const SERVER_URL = process.env.VITE_SERVER_URL || "http://localhost:3001";

async function rpc(method: string, input: unknown, cookie: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cookie) headers.Cookie = cookie;
  const init: RequestInit = { method: "POST", headers };
  if (input !== undefined) {
    init.body = JSON.stringify({ json: input });
  }
  const res = await fetch(`${SERVER_URL}/rpc/${method}`, init);
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (data && typeof data === "object" && "json" in data) {
    return { status: res.status, data: data.json };
  }
  return { status: res.status, data };
}

async function signUp(email: string, password: string, name: string) {
  const res = await fetch(`${SERVER_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  return res.json() as Promise<{ user?: { id: string } }>;
}

async function signIn(email: string, password: string) {
  const res = await fetch(`${SERVER_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie();
  const sessionCookie = setCookie.find((c: string) =>
    c.includes("better-auth.session_token"),
  );
  return { data: await res.json(), cookie: sessionCookie?.split(";")[0] || "" };
}

async function setUserRole(userId: string, role: string) {
  await db.update(user).set({ role }).where(eq(user.id, userId));
}

describe("Admin setRole audit + last-admin guard", () => {
  const ts = Date.now();
  const adminEmail = `audit-admin.${ts}@cogito.test`;
  const studentEmail = `audit-student.${ts}@cogito.test`;
  let adminCookie: string;
  let adminId: string;
  let studentId: string;

  beforeAll(async () => {
    const adminRes = await signUp(adminEmail, "Test1234!", "Audit Admin");
    adminId = adminRes.user!.id;
    await setUserRole(adminId, "admin");
    const adminSession = await signIn(adminEmail, "Test1234!");
    adminCookie = adminSession.cookie;

    const studentRes = await signUp(studentEmail, "Test1234!", "Audit Student");
    studentId = studentRes.user!.id;
  });

  afterAll(async () => {
    await cleanTestUser(adminEmail);
    await cleanTestUser(studentEmail);
  });

  test("setRole writes an audit log entry", async () => {
    const res = await rpc(
      "admin/setRole",
      {
        userId: studentId,
        role: "tutor",
      },
      adminCookie,
    );

    expect(res.status).toBe(200);
    expect(res.data.role).toBe("tutor");

    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.targetId, studentId));

    const roleLog = logs.find((l) => l.action === "user_role_changed");
    expect(roleLog).toBeDefined();
    expect(roleLog!.actorId).toBe(adminId);
    expect(roleLog!.actorType).toBe("admin");
    expect(roleLog!.beforeState).toEqual({ role: "student" });
    expect(roleLog!.afterState).toEqual({ role: "tutor" });
  });

  test("cannot demote the last admin", async () => {
    const res = await rpc(
      "admin/setRole",
      {
        userId: adminId,
        role: "student",
      },
      adminCookie,
    );

    expect(res.status).toBe(409);
  });
});
