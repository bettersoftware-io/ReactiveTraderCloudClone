import { describe, expect, it } from "vitest";

import type { TileExecutionState } from "@rtc/core-api";
import {
  CONFIRMATION_DISMISS_MS,
  Direction,
  EXECUTION_TIMEOUT_MS,
  ExecutionStatus,
  TOO_LONG_THRESHOLD_MS,
  TradeStatus,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import { createPrice, createTrade, EURUSD } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";

const PRICE = createPrice("EURUSD", 1.1);

function statuses(values: readonly TileExecutionState[]): string[] {
  return values.map((state) => {
    return state.status;
  });
}

export function describeTileExecutionContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts ready; execute() → started with one pending request; a Done result → finished{Done, trade}; ready again CONFIRMATION_DISMISS_MS later", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.tileExecution(EURUSD);

        try {
          const c = collect(m.state$);
          expect(c.values).toEqual([{ status: "ready" }]);
          m.intents.execute(Direction.Buy, PRICE, 1_000_000);
          await clock.settle();
          expect(statuses(c.values)).toEqual(["ready", "started"]);
          expect(h.driver.pendingExecutions()).toHaveLength(1);
          expect(h.driver.pendingExecutions()[0]?.currencyPair).toBe("EURUSD");
          const trade = createTrade({ tradeId: 9 });
          h.driver.resolveExecution(trade);
          await clock.settle();
          expect(c.values.at(-1)).toEqual({
            status: "finished",
            executionStatus: ExecutionStatus.Done,
            trade,
          });
          await clock.advance(CONFIRMATION_DISMISS_MS - 1);
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("finished");
          await clock.advance(1);
          await clock.settle();
          expect(statuses(c.values)).toEqual([
            "ready",
            "started",
            "finished",
            "ready",
          ]);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a Rejected trade lands as finished{Rejected}; a failing command as finished{Timeout} (not the timeout state)", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.tileExecution(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.execute(Direction.Buy, PRICE, 1);
          await clock.settle();
          h.driver.resolveExecution(
            createTrade({ status: TradeStatus.Rejected }),
          );
          await clock.settle();
          const rejected = c.values.at(-1);

          if (rejected?.status === "finished") {
            expect(rejected.executionStatus).toBe(ExecutionStatus.Rejected);
          } else {
            expect.fail("expected a finished state");
          }

          m.intents.dismiss();
          await clock.settle();
          m.intents.execute(Direction.Sell, PRICE, 1);
          await clock.settle();
          h.driver.failExecution(new Error("bust"));
          await clock.settle();
          expect(c.values.at(-1)).toEqual({
            status: "finished",
            executionStatus: ExecutionStatus.Timeout,
          });
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("escalates to tooLong at TOO_LONG_THRESHOLD_MS, to timeout at EXECUTION_TIMEOUT_MS, then ready; a late result is dropped", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.tileExecution(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.execute(Direction.Buy, PRICE, 1);
          await clock.settle();
          await clock.advance(TOO_LONG_THRESHOLD_MS - 1);
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("started");
          await clock.advance(1);
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("tooLong");
          await clock.advance(EXECUTION_TIMEOUT_MS - TOO_LONG_THRESHOLD_MS);
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("timeout");
          h.driver.resolveExecution(createTrade());
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("timeout");
          await clock.advance(CONFIRMATION_DISMISS_MS);
          await clock.settle();
          expect(statuses(c.values)).toEqual([
            "ready",
            "started",
            "tooLong",
            "timeout",
            "ready",
          ]);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("finishing cancels the escalation: no tooLong after a result", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.tileExecution(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.execute(Direction.Buy, PRICE, 1);
          await clock.settle();
          h.driver.resolveExecution(createTrade());
          await clock.settle();
          await clock.advance(TOO_LONG_THRESHOLD_MS);
          await clock.settle();
          expect(statuses(c.values)).toEqual(["ready", "started", "finished"]);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("dismiss() returns to ready and cancels every pending timer; a fresh run works afterwards", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.tileExecution(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.execute(Direction.Buy, PRICE, 1);
          await clock.settle();
          m.intents.dismiss();
          await clock.settle();
          expect(statuses(c.values)).toEqual(["ready", "started", "ready"]);
          await clock.advance(EXECUTION_TIMEOUT_MS + CONFIRMATION_DISMISS_MS);
          await clock.settle();
          expect(statuses(c.values)).toEqual(["ready", "started", "ready"]);
          m.intents.execute(Direction.Buy, PRICE, 1);
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("started");
          h.driver.resolveExecution(createTrade());
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("finished");
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a new execute() supersedes the in-flight run: the first request is withdrawn, the second's result lands", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.tileExecution(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.execute(Direction.Buy, PRICE, 1);
          await clock.settle();
          m.intents.execute(Direction.Buy, PRICE, 2);
          await clock.settle();
          expect(
            h.driver.pendingExecutions().map((r) => {
              return r.notional;
            }),
          ).toEqual([2]);
          const trade = createTrade({ notional: 2 });
          h.driver.resolveExecution(trade);
          await clock.settle();
          expect(c.values.at(-1)).toEqual({
            status: "finished",
            executionStatus: ExecutionStatus.Done,
            trade,
          });
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("dispose() makes intents inert", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.tileExecution(EURUSD);

        try {
          const c = collect(m.state$);
          m.dispose();
          m.intents.execute(Direction.Buy, PRICE, 1);
          await clock.settle();
          expect(statuses(c.values)).toEqual(["ready"]);
          expect(h.driver.pendingExecutions()).toEqual([]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
