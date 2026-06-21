import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { Trade } from "../fx/trade.js";
import type { BlotterPort } from "../ports/blotterPort.js";
import { TradeBlotterUseCase } from "./TradeBlotterUseCase.js";

describe("TradeBlotterUseCase", () => {
  it("delegates to BlotterPort.getTradeStream", async () => {
    const trades: readonly Trade[] = [];
    const port: BlotterPort = { getTradeStream: () => of(trades) };
    const useCase = new TradeBlotterUseCase(port);
    expect(await firstValueFrom(useCase.execute())).toBe(trades);
  });
});
