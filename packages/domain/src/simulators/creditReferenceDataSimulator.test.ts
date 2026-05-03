import { describe, it, expect } from "vitest";
import { InstrumentSimulator, DealerSimulator, INSTRUMENTS_CATALOG, DEALERS_CATALOG } from "./creditReferenceDataSimulator.js";

describe("InstrumentSimulator", () => {
  it("emits 11 instruments", async () => {
    const service = new InstrumentSimulator();
    for await (const instruments of service.subscribe()) {
      expect(instruments).toHaveLength(11);
      break;
    }
  });

  it("instruments have required fields", () => {
    const orcl = INSTRUMENTS_CATALOG[0];
    expect(orcl.ticker).toBe("ORCL");
    expect(orcl.cusip).toBe("68389X105");
    expect(orcl.interestRate).toBe(4.755);
    expect(orcl.maturity).toBe("20250815");
  });
});

describe("DealerSimulator", () => {
  it("emits 10 dealers", async () => {
    const service = new DealerSimulator();
    for await (const dealers of service.subscribe()) {
      expect(dealers).toHaveLength(10);
      break;
    }
  });

  it("does not include Adaptive Bank", () => {
    const names = DEALERS_CATALOG.map((d) => d.name);
    expect(names).not.toContain("Adaptive Bank");
  });

  it("includes expected dealers", () => {
    const names = DEALERS_CATALOG.map((d) => d.name);
    expect(names).toContain("J.P. Morgan");
    expect(names).toContain("Goldman Sachs");
    expect(names).toContain("Capital One");
  });
});
