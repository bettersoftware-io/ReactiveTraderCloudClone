import { describe, it, expect } from "vitest";
import { MockInstrumentService, MockDealerService, MOCK_INSTRUMENTS, MOCK_DEALERS } from "./credit-reference-data-mock.js";

describe("MockInstrumentService", () => {
  it("emits 11 instruments", async () => {
    const service = new MockInstrumentService();
    for await (const instruments of service.subscribe()) {
      expect(instruments).toHaveLength(11);
      break;
    }
  });

  it("instruments have required fields", () => {
    const orcl = MOCK_INSTRUMENTS[0];
    expect(orcl.ticker).toBe("ORCL");
    expect(orcl.cusip).toBe("68389X105");
    expect(orcl.interestRate).toBe(4.755);
    expect(orcl.maturity).toBe("20250815");
  });
});

describe("MockDealerService", () => {
  it("emits 10 dealers", async () => {
    const service = new MockDealerService();
    for await (const dealers of service.subscribe()) {
      expect(dealers).toHaveLength(10);
      break;
    }
  });

  it("does not include Adaptive Bank", () => {
    const names = MOCK_DEALERS.map((d) => d.name);
    expect(names).not.toContain("Adaptive Bank");
  });

  it("includes expected dealers", () => {
    const names = MOCK_DEALERS.map((d) => d.name);
    expect(names).toContain("J.P. Morgan");
    expect(names).toContain("Goldman Sachs");
    expect(names).toContain("Capital One");
  });
});
