import { afterEach, vi } from "vitest";
import { describeBlotterPortContract } from "../ports/__contracts__/BlotterPortContract.js";
import { TradeStoreSimulator } from "./TradeStoreSimulator.js";
import { ExecutionSimulator } from "./ExecutionSimulator.js";
import { Direction } from "../fx/trade.js";
import { firstValueFrom } from "rxjs";

const NORMAL_MAX_DELAY_MS = 2_000;

afterEach(() => vi.useRealTimers());

describeBlotterPortContract("TradeStoreSimulator", () => {
  vi.useFakeTimers();
  const execution = new ExecutionSimulator();
  const store = new TradeStoreSimulator(execution);
  return {
    port: store,
    driver: {
      emitInitialBlotter: async () => {
        // TradeStoreSimulator emits an initial snapshot synchronously via concat(of(snapshot), updates$).
        // Flush microtasks so the Observable machinery delivers it.
        await vi.advanceTimersByTimeAsync(0);
      },
      appendTrade: async () => {
        const tradePromise = firstValueFrom(
          execution.executeTrade({
            currencyPair: "EURUSD",
            spotRate: 1.1,
            direction: Direction.Buy,
            notional: 1_000_000,
            dealtCurrency: "EUR",
          }),
        );
        // Advance past NORMAL_MAX_DELAY_MS so the timer inside ExecutionSimulator fires.
        await vi.advanceTimersByTimeAsync(NORMAL_MAX_DELAY_MS);
        await tradePromise;
      },
    },
    teardown: () => vi.useRealTimers(),
  };
});
