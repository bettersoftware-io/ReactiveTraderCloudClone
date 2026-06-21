import {
  Direction,
  ExecutionStatus,
  type Trade,
  TradeStatus,
} from "@rtc/domain";
import { TileConfirmation } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";
import type { TileExecutionState as TileState } from "../../../../../../../src/app/presenters/TileExecutionMachine";

const doneTrade: Trade = {
  tradeId: 9001,
  tradeName: "Trader",
  currencyPair: "EURUSD",
  notional: 2_500_000,
  dealtCurrency: "EUR",
  direction: Direction.Buy,
  spotRate: 1.09221,
  status: TradeStatus.Done,
  tradeDate: "2026-06-13",
  valueDate: "2026-06-15",
};

describe("TileConfirmation", () => {
  it("renders nothing while the tile is ready", () => {
    const c = mount(TileConfirmation, {
      props: { state: { status: "ready" } as TileState, onDismiss: () => {} },
    });
    expect(c.isVisible()).toBe(false);
  });

  it("shows an executing message and a non-dismissible overlay while started", () => {
    const c = mount(TileConfirmation, {
      props: { state: { status: "started" } as TileState, onDismiss: () => {} },
    });
    expect(c.text()).toMatch(/executing/i);
    expect(c.cursor()).toBe("default");
  });

  it("warns when execution is taking too long", () => {
    const c = mount(TileConfirmation, {
      props: { state: { status: "tooLong" } as TileState, onDismiss: () => {} },
    });
    expect(c.text()).toMatch(/longer than expected/i);
  });

  it("reports a timed-out execution", () => {
    const c = mount(TileConfirmation, {
      props: { state: { status: "timeout" } as TileState, onDismiss: () => {} },
    });
    expect(c.text()).toMatch(/timed out/i);
  });

  it("confirms a completed buy with the trade details", () => {
    const c = mount(TileConfirmation, {
      props: {
        state: {
          status: "finished",
          executionStatus: ExecutionStatus.Done,
          trade: doneTrade,
        } as TileState,
        onDismiss: () => {},
      },
    });
    expect(c.text()).toMatch(/you bought/i);
    expect(c.text()).toContain("EUR 2,500,000");
    expect(c.text()).toContain("EURUSD @ 1.09221");
    expect(c.text()).toMatch(/trade id: 9001/i);
    expect(c.backgroundColor()).toBe("var(--accent-positive)");
  });

  it("confirms a completed sell with the sell verb", () => {
    const c = mount(TileConfirmation, {
      props: {
        state: {
          status: "finished",
          executionStatus: ExecutionStatus.Done,
          trade: {
            ...doneTrade,
            direction: Direction.Sell,
            dealtCurrency: "USD",
          },
        } as TileState,
        onDismiss: () => {},
      },
    });
    expect(c.text()).toMatch(/you sold/i);
  });

  it("reports a rejected trade", () => {
    const c = mount(TileConfirmation, {
      props: {
        state: {
          status: "finished",
          executionStatus: ExecutionStatus.Rejected,
        } as TileState,
        onDismiss: () => {},
      },
    });
    expect(c.text()).toMatch(/has been rejected/i);
    expect(c.backgroundColor()).toBe("var(--accent-negative)");
  });

  it("reports a finished-with-timeout status", () => {
    const c = mount(TileConfirmation, {
      props: {
        state: {
          status: "finished",
          executionStatus: ExecutionStatus.Timeout,
        } as TileState,
        onDismiss: () => {},
      },
    });
    expect(c.text()).toMatch(/timed out/i);
  });

  it("reports a credit-exceeded status", () => {
    const c = mount(TileConfirmation, {
      props: {
        state: {
          status: "finished",
          executionStatus: ExecutionStatus.CreditExceeded,
        } as TileState,
        onDismiss: () => {},
      },
    });
    expect(c.text()).toMatch(/credit limit exceeded/i);
    expect(c.backgroundColor()).toBe("var(--accent-aware)");
  });

  it("renders an empty overlay when a Done status carries no trade", () => {
    const c = mount(TileConfirmation, {
      props: {
        state: {
          status: "finished",
          executionStatus: ExecutionStatus.Done,
        } as TileState,
        onDismiss: () => {},
      },
    });
    // Done-without-trade falls through to null content but the overlay still renders.
    expect(c.isVisible()).toBe(true);
    expect(c.text()).toBe("");
  });

  it("dismisses a finished confirmation on click", async () => {
    let dismissed = 0;
    const c = mount(TileConfirmation, {
      props: {
        state: {
          status: "finished",
          executionStatus: ExecutionStatus.Done,
          trade: doneTrade,
        } as TileState,
        onDismiss: () => (dismissed += 1),
      },
    });
    await c.clickOverlay();
    expect(dismissed).toBe(1);
  });

  it("does not dismiss while still executing", async () => {
    let dismissed = 0;
    const c = mount(TileConfirmation, {
      props: {
        state: { status: "started" } as TileState,
        onDismiss: () => (dismissed += 1),
      },
    });
    await c.clickOverlay();
    expect(dismissed).toBe(0);
  });
});
