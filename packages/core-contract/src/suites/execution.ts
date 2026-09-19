import { describe, expect, it } from "vitest";

import { Direction, ExecutionStatus, TradeStatus } from "@rtc/domain";

import { collect } from "#/harness/collect";
import { createPrice, createTrade, EURUSD } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeExecutionContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("execute() is lazy — the port sees a request only once the result is subscribed — and the request carries ask for Buy, bid for Sell, the base currency as dealt", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.execution;
        const price = createPrice("EURUSD", 1.1);
        const buy = p.execute({
          pair: EURUSD,
          direction: Direction.Buy,
          price,
          notional: 1_000_000,
        });
        expect(h.driver.pendingExecutions()).toEqual([]);
        const c = collect(buy);
        await settle();
        expect(h.driver.pendingExecutions()).toEqual([
          {
            currencyPair: "EURUSD",
            spotRate: price.ask,
            direction: Direction.Buy,
            notional: 1_000_000,
            dealtCurrency: "EUR",
          },
        ]);
        c.unsubscribe();
        await settle();
        expect(h.driver.pendingExecutions()).toEqual([]);
        const sell = collect(
          p.execute({
            pair: EURUSD,
            direction: Direction.Sell,
            price,
            notional: 5,
          }),
        );
        await settle();
        expect(h.driver.pendingExecutions()[0]?.spotRate).toBe(price.bid);
        sell.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a Done trade lands as the result and as an outcome on executions$", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.execution;
        const outcomes = collect(p.executions$);
        await settle();
        const c = collect(
          p.execute({
            pair: EURUSD,
            direction: Direction.Buy,
            price: createPrice("EURUSD", 1.1),
            notional: 1,
          }),
        );
        await settle();
        const trade = createTrade({ tradeId: 7, status: TradeStatus.Done });
        h.driver.resolveExecution(trade);
        await settle();
        expect(c.values).toEqual([{ trade, status: ExecutionStatus.Done }]);
        expect(c.errors).toEqual([]);
        expect(outcomes.values).toEqual([
          { symbol: "EURUSD", status: ExecutionStatus.Done },
        ]);
        c.unsubscribe();
        outcomes.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a Rejected trade lands as Rejected on both", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.execution;
        const outcomes = collect(p.executions$);
        await settle();
        const c = collect(
          p.execute({
            pair: EURUSD,
            direction: Direction.Buy,
            price: createPrice("EURUSD", 1.1),
            notional: 1,
          }),
        );
        await settle();
        h.driver.resolveExecution(
          createTrade({ status: TradeStatus.Rejected }),
        );
        await settle();
        expect(c.values[0]?.status).toBe(ExecutionStatus.Rejected);
        expect(outcomes.values).toEqual([
          { symbol: "EURUSD", status: ExecutionStatus.Rejected },
        ]);
        c.unsubscribe();
        outcomes.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a failing execution errors the result; executions$ hears nothing", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.execution;
        const outcomes = collect(p.executions$);
        await settle();
        const c = collect(
          p.execute({
            pair: EURUSD,
            direction: Direction.Buy,
            price: createPrice("EURUSD", 1.1),
            notional: 1,
          }),
        );
        await settle();
        h.driver.failExecution(new Error("bust"));
        await settle();
        expect(c.errors).toHaveLength(1);
        expect(c.values).toEqual([]);
        expect(outcomes.values).toEqual([]);
        outcomes.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("executions$ does not replay: a subscriber joining after an outcome hears nothing", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.execution;
        const c = collect(
          p.execute({
            pair: EURUSD,
            direction: Direction.Buy,
            price: createPrice("EURUSD", 1.1),
            notional: 1,
          }),
        );
        await settle();
        h.driver.resolveExecution(createTrade());
        await settle();
        const late = collect(p.executions$);
        await settle();
        expect(late.values).toEqual([]);
        c.unsubscribe();
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
