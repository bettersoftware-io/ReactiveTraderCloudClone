import { describe, it, expect } from "vitest";
import { firstValueFrom } from "rxjs";
import { toArray } from "rxjs/operators";
import { InstrumentSimulator, DealerSimulator, INSTRUMENTS_CATALOG, DEALERS_CATALOG } from "./creditReferenceDataSimulator.js";

describe("InstrumentSimulator", () => {
  it("emits the instruments catalog and completes", async () => {
    const service = new InstrumentSimulator();
    const emissions = await firstValueFrom(service.getInstruments().pipe(toArray()));
    expect(emissions).toHaveLength(1);
    expect(emissions[0]).toHaveLength(11);
    expect(emissions[0]).toEqual(INSTRUMENTS_CATALOG);
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
  it("emits the dealers catalog and completes", async () => {
    const service = new DealerSimulator();
    const emissions = await firstValueFrom(service.getDealers().pipe(toArray()));
    expect(emissions).toHaveLength(1);
    expect(emissions[0]).toHaveLength(10);
    expect(emissions[0]).toEqual(DEALERS_CATALOG);
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
