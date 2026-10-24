import { describe, expect, it } from "vitest";

import { createRevocationLedger } from "#/accounts/revocationLedger";

describe("revocationLedger", () => {
  it("answers null for an account it holds no stamp for", () => {
    expect(createRevocationLedger(5).notBefore("acc-1")).toBeNull();
  });

  it("keeps the later of two stamps, whichever order they arrive in", () => {
    const ledger = createRevocationLedger(5);

    ledger.record("acc-1", 500);
    ledger.record("acc-1", 300);
    expect(ledger.notBefore("acc-1")).toBe(500);

    ledger.record("acc-1", 900);
    expect(ledger.notBefore("acc-1")).toBe(900);
  });

  it("drops the oldest entry past its cap", () => {
    const ledger = createRevocationLedger(2);

    ledger.record("acc-1", 100);
    ledger.record("acc-2", 200);
    ledger.record("acc-3", 300);

    expect(ledger.notBefore("acc-1")).toBeNull();
    expect(ledger.notBefore("acc-2")).toBe(200);
    expect(ledger.notBefore("acc-3")).toBe(300);
  });

  it("a re-recorded account becomes the newest, not the next dropped", () => {
    const ledger = createRevocationLedger(2);

    ledger.record("acc-1", 100);
    ledger.record("acc-2", 200);
    ledger.record("acc-1", 150);
    ledger.record("acc-3", 300);

    expect(ledger.notBefore("acc-1")).toBe(150);
    expect(ledger.notBefore("acc-2")).toBeNull();
  });

  it("re-recording a held account at the cap evicts nobody", () => {
    const ledger = createRevocationLedger(2);

    ledger.record("acc-1", 100);
    ledger.record("acc-2", 200);
    ledger.record("acc-2", 250);

    expect(ledger.notBefore("acc-1")).toBe(100);
    expect(ledger.notBefore("acc-2")).toBe(250);
  });
});
