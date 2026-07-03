import { firstValueFrom } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import { DEALERS_CATALOG, DealerSimulator } from "./DealerSimulator.js";

describe("DealerSimulator", () => {
  it("emits the dealers catalog and completes", async () => {
    const service = new DealerSimulator();
    const emissions = await firstValueFrom(
      service.getDealers().pipe(toArray()),
    );
    expect(emissions).toHaveLength(1);
    expect(emissions[0]).toHaveLength(9);
    expect(emissions[0]).toEqual(DEALERS_CATALOG);
  });

  it("includes Adaptive Bank as dealer id 0 (the user's own bank)", () => {
    expect(DEALERS_CATALOG[0]).toEqual({ id: 0, name: "Adaptive Bank" });
  });

  it("includes expected dealers", () => {
    const names = DEALERS_CATALOG.map((d) => {
      return d.name;
    });
    expect(names).toContain("Citi");
    expect(names).toContain("Goldman Sachs");
    expect(names).toContain("Deutsche Bank");
  });

  it("carries the PROTO dealer catalogue in order, Adaptive Bank first", async () => {
    expect(
      DEALERS_CATALOG.map((d) => {
        return d.name;
      }),
    ).toEqual([
      "Adaptive Bank",
      "Citi",
      "JP Morgan",
      "Goldman Sachs",
      "Morgan Stanley",
      "Barclays",
      "RBC",
      "HSBC",
      "Deutsche Bank",
    ]);
  });
});
