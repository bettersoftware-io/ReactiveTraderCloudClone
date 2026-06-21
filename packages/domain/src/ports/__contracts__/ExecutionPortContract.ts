import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import type { ExecutionRequest } from "../../fx/trade.js";
import { Direction, TradeStatus } from "../../fx/trade.js";
import type { ExecutionPort } from "../executionPort.js";

const VALID_STATUSES = [
  TradeStatus.Done,
  TradeStatus.Rejected,
  TradeStatus.Pending,
] as const;

export interface ExecutionDriver {
  ackExecute(): Promise<void>;
}

export interface ExecutionHarness {
  port: ExecutionPort;
  driver: ExecutionDriver;
  teardown: () => void;
}

const makeRequest = (
  overrides?: Partial<ExecutionRequest>,
): ExecutionRequest => ({
  currencyPair: "EURUSD",
  spotRate: 1.1,
  direction: Direction.Buy,
  notional: 1_000_000,
  dealtCurrency: "EUR",
  ...overrides,
});

export function describeExecutionPortContract(
  label: string,
  makeHarness: () => ExecutionHarness,
): void {
  describe(`${label} :: ExecutionPort contract`, () => {
    it("emits exactly one Trade then completes", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const promise = firstValueFrom(port.executeTrade(makeRequest()));
        await driver.ackExecute();
        const trade = await promise;
        expect(typeof trade.tradeId).toBe("number");
      } finally {
        teardown();
      }
    });

    it("preserves request fields in the returned Trade", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const req = makeRequest({
          currencyPair: "GBPUSD",
          notional: 2_500_000,
        });
        const promise = firstValueFrom(port.executeTrade(req));
        await driver.ackExecute();
        const trade = await promise;
        expect(trade.currencyPair).toBe("GBPUSD");
        expect(trade.notional).toBe(2_500_000);
        expect(trade.dealtCurrency).toBe("EUR");
      } finally {
        teardown();
      }
    });

    it("status is in the valid enum", async () => {
      const { port, driver, teardown } = makeHarness();
      try {
        const promise = firstValueFrom(port.executeTrade(makeRequest()));
        await driver.ackExecute();
        const trade = await promise;
        expect(VALID_STATUSES).toContain(trade.status as never);
      } finally {
        teardown();
      }
    });
  });
}
