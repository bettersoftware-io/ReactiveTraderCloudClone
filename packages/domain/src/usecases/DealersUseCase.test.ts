import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";

import type { Dealer } from "../credit/dealer.js";
import type { DealerPort } from "../ports/dealerPort.js";
import { DealersUseCase } from "./DealersUseCase.js";

describe("DealersUseCase", () => {
  it("delegates to DealerPort.getDealers", async () => {
    const dealers: readonly Dealer[] = [];
    const port: DealerPort = { getDealers: () => of(dealers) };
    const useCase = new DealersUseCase(port);
    expect(await firstValueFrom(useCase.execute())).toBe(dealers);
  });
});
