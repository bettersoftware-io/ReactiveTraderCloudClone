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
    expect(emissions[0]).toHaveLength(8);
    expect(emissions[0]).toEqual(INSTRUMENTS_CATALOG);
  });

  it("instruments have required fields", () => {
    const aapl = INSTRUMENTS_CATALOG[0];
    expect(aapl.ticker).toBe("AAPL");
    expect(aapl.cusip).toBe("037833DX5");
    expect(aapl.interestRate).toBe(2.4);
    expect(aapl.maturity).toBe("20300815");
    expect(aapl.refPrice).toBe(98.4);
  });

  it("carries the PROTO instrument catalogue", async () => {
    expect(
      INSTRUMENTS_CATALOG.map((i) => {
        return [i.name, i.cusip, i.refPrice];
      }),
    ).toEqual([
      ["AAPL 2.4 08/30", "037833DX5", 98.4],
      ["MSFT 3.3 02/27", "594918BV5", 99.8],
      ["AMZN 4.05 08/47", "023135BW5", 96.2],
      ["GOOGL 1.1 08/30", "02079KAC1", 91.5],
      ["TSLA 5.3 08/25", "88160RAG6", 100.6],
      ["UST 4.0 11/34", "91282CFP1", 98.9],
      ["VZ 4.5 08/33", "92343VGE9", 97.3],
      ["KO 1.45 06/27", "191216DA5", 93.7],
    ]);
  });
});
