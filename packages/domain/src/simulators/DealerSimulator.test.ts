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
    expect(emissions[0]).toHaveLength(10);
    expect(emissions[0]).toEqual(DEALERS_CATALOG);
  });

  it("does not include Adaptive Bank", () => {
    const names = DEALERS_CATALOG.map((d) => {
      return d.name;
    });
    expect(names).not.toContain("Adaptive Bank");
  });

  it("includes expected dealers", () => {
    const names = DEALERS_CATALOG.map((d) => {
      return d.name;
    });
    expect(names).toContain("J.P. Morgan");
    expect(names).toContain("Goldman Sachs");
    expect(names).toContain("Capital One");
  });
});
