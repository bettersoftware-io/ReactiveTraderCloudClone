import { firstValueFrom } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import {
  INSTRUMENTS_CATALOG,
  InstrumentSimulator,
} from "./InstrumentSimulator.js";

describe("InstrumentSimulator", () => {
  it("emits the instruments catalog and completes", async () => {
    const service = new InstrumentSimulator();
    const emissions = await firstValueFrom(
      service.getInstruments().pipe(toArray()),
    );
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
