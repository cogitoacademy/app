import { describe, test, expect } from "bun:test";

describe("Wallet Service (unit)", () => {
  describe("atomic operation signatures", () => {
    test("repo has all atomic methods", () => {
      const { createWalletRepo } = require("../../modules/wallet/wallet.repo");
      const repo = createWalletRepo({} as never);
      const methods = Object.keys(repo);
      expect(methods).toContain("atomicHold");
      expect(methods).toContain("atomicRelease");
      expect(methods).toContain("atomicDeduct");
      expect(methods).toContain("atomicCredit");
      expect(methods).toContain("atomicCompensateCredit");
      expect(methods).toContain("atomicCompensateDeduct");
    });
  });
});
