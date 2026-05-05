import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { Dealer, DealerPort } from "@rtc/domain";
import { DealersPresenter } from "../DealersPresenter";

describe("DealersPresenter", () => {
  it("exposes dealers", async () => {
    const dealers: readonly Dealer[] = [];
    const port: DealerPort = { getDealers: () => of(dealers) };
    expect(await firstValueFrom(new DealersPresenter(port).list$)).toBe(dealers);
  });
});
