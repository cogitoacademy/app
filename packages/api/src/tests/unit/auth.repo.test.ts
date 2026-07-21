import { describe, test, expect, mock } from "bun:test";
import { createAuthRepo } from "../../modules/auth/auth.repo";

function makeQueryConn(profile: any = null) {
  const findFirst = mock(async () => profile);
  return {
    query: { studentProfile: { findFirst }, tutorProfile: { findFirst } },
  };
}

function makeUpdateConn(returned: any[] = [{}]) {
  const returning = mock(async () => returned);
  const where = mock(() => ({ returning }));
  const set = mock(() => ({ where }));
  const update = mock(() => ({ set }));
  return { update, set, where, returning };
}

function makeInsertConn(returned: any[] = [{}]) {
  const returning = mock(async () => returned);
  const values = mock(() => ({ returning }));
  const insert = mock(() => ({ values }));
  return { insert, values, returning };
}

const repo = createAuthRepo();

describe("getStudentProfile", () => {
  test("returns student profile when found", async () => {
    const profile = { userId: "u1", phoneNumber: "123" };
    const conn = makeQueryConn(profile) as any;

    const result = await repo.getStudentProfile(conn, "u1");

    expect(result).toEqual(profile);
    expect(conn.query.studentProfile.findFirst).toHaveBeenCalledTimes(1);
  });

  test("returns null when not found", async () => {
    const conn = makeQueryConn(null) as any;

    const result = await repo.getStudentProfile(conn, "missing");

    expect(result).toBeNull();
  });
});

describe("getTutorProfile", () => {
  test("returns tutor profile when found", async () => {
    const profile = { userId: "t1", schoolName: "Sch" };
    const conn = makeQueryConn(profile) as any;

    const result = await repo.getTutorProfile(conn, "t1");

    expect(result).toEqual(profile);
    expect(conn.query.tutorProfile.findFirst).toHaveBeenCalledTimes(1);
  });

  test("returns null when not found", async () => {
    const conn = makeQueryConn(null) as any;

    const result = await repo.getTutorProfile(conn, "missing");

    expect(result).toBeNull();
  });
});

describe("upsertProfile", () => {
  test("updates profile and returns it", async () => {
    const updated = { userId: "u1", phoneNumber: "999" };
    const conn = { ...makeUpdateConn([updated]) } as any;

    const result = await repo.upsertProfile(conn, "u1", { phoneNumber: "999" });

    expect(result).toEqual(updated);
    expect(conn.update).toHaveBeenCalledTimes(1);
    expect(conn.set).toHaveBeenCalledTimes(1);
    expect(conn.where).toHaveBeenCalledTimes(1);
    expect(conn.returning).toHaveBeenCalledTimes(1);
  });

  test("passes all input fields to set", async () => {
    const input = { phoneNumber: "111", schoolName: "Sch", gradeLevel: "10" };
    const conn = { ...makeUpdateConn([{ userId: "u1", ...input }]) } as any;

    await repo.upsertProfile(conn, "u1", input);

    expect(conn.set).toHaveBeenCalledWith(input);
  });
});

describe("createProfile", () => {
  test("inserts and returns new profile", async () => {
    const created = { userId: "u2", phoneNumber: "555" };
    const conn = { ...makeInsertConn([created]) } as any;

    const result = await repo.createProfile(conn, "u2", { phoneNumber: "555" });

    expect(result).toEqual(created);
    expect(conn.insert).toHaveBeenCalledTimes(1);
    expect(conn.values).toHaveBeenCalledTimes(1);
    expect(conn.returning).toHaveBeenCalledTimes(1);
  });

  test("passes userId along with input to values", async () => {
    const conn = { ...makeInsertConn([{ userId: "u3" }]) } as any;

    await repo.createProfile(conn, "u3", { schoolName: "HS" });

    expect(conn.values).toHaveBeenCalledWith({
      userId: "u3",
      schoolName: "HS",
    });
  });
});

describe("createAuthRepo", () => {
  test("returns object with all repo methods", () => {
    const r = createAuthRepo();

    expect(r).toHaveProperty("getStudentProfile");
    expect(r).toHaveProperty("getTutorProfile");
    expect(r).toHaveProperty("upsertProfile");
    expect(r).toHaveProperty("createProfile");
    expect(typeof r.getStudentProfile).toBe("function");
    expect(typeof r.getTutorProfile).toBe("function");
    expect(typeof r.upsertProfile).toBe("function");
    expect(typeof r.createProfile).toBe("function");
  });
});
