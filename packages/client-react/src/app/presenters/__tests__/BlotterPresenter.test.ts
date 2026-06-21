import type { BlotterPort, Trade } from "@rtc/domain";
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import { BlotterPresenter } from "../BlotterPresenter";

describe("BlotterPresenter", () => {
  it("exposes the trade stream", async () => {
    const trades: readonly Trade[] = [];
    const port: BlotterPort = { getTradeStream: () => of(trades) };
    const presenter = new BlotterPresenter(port);
    expect(await firstValueFrom(presenter.trades$)).toBe(trades);
  });
});
