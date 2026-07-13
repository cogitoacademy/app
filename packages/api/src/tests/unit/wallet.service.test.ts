import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";

describe("Wallet Service (unit)", () => {
  describe("atomic operation signatures", () => {
    test("repo file exports all atomic methods", () => {
      const repoPath = path.resolve(
        __dirname,
        "../../modules/wallet/wallet.repo.ts",
      );
      const source = fs.readFileSync(repoPath, "utf-8");
      const methodNames = [
        "atomicHold",
        "atomicRelease",
        "atomicDeduct",
        "atomicCredit",
        "atomicCompensateCredit",
        "atomicCompensateDeduct",
      ];
      for (const method of methodNames) {
        expect(source).toContain(method);
      }
    });
  });
});
