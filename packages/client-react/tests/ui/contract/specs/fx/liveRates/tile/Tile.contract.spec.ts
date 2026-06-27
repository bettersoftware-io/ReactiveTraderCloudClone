import { Tile } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ConnectionStatus,
  type CurrencyPair,
  Direction,
  type ExecuteTradeResult,
  ExecutionStatus,
  KNOWN_CURRENCY_PAIRS,
  type Price,
  PriceMovementType,
  type PriceTick,
  type RfqQuoteResult,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

const _eurusd = KNOWN_CURRENCY_PAIRS.find((p) => {
  return p.symbol === "EURUSD";
});
if (!_eurusd) throw new Error("EURUSD not found in KNOWN_CURRENCY_PAIRS");
const eurusd: CurrencyPair = _eurusd;
// NZDUSD's defaultNotional is 10,000,000 (>= RFQ threshold) → starts in RFQ mode.
const _nzdusd = KNOWN_CURRENCY_PAIRS.find((p) => {
  return p.symbol === "NZDUSD";
});
if (!_nzdusd) throw new Error("NZDUSD not found in KNOWN_CURRENCY_PAIRS");
const nzdusd: CurrencyPair = _nzdusd;

function price(over: Partial<Price> = {}): Price {
  return {
    symbol: "EURUSD",
    bid: 1.0921,
    ask: 1.0925,
    mid: 1.0923,
    valueDate: "2026-06-15",
    creationTimestamp: 1_700_000_000_000,
    movementType: PriceMovementType.NONE,
    spread: "4.0",
    ...over,
  };
}

const history: readonly PriceTick[] = [
  {
    symbol: "EURUSD",
    bid: 1.09,
    ask: 1.091,
    mid: 1.0905,
    valueDate: "2026-06-15",
    creationTimestamp: 1,
  },
  {
    symbol: "EURUSD",
    bid: 1.092,
    ask: 1.093,
    mid: 1.0925,
    valueDate: "2026-06-15",
    creationTimestamp: 2,
  },
];

function tradeResult(over: Partial<Trade> = {}): ExecuteTradeResult {
  return {
    status: ExecutionStatus.Done,
    trade: {
      tradeId: 5001,
      tradeName: "Trader",
      currencyPair: "EURUSD",
      notional: 1_000_000,
      dealtCurrency: "EUR",
      direction: Direction.Buy,
      spotRate: 1.0925,
      status: TradeStatus.Done,
      tradeDate: "2026-06-13",
      valueDate: "2026-06-15",
      ...over,
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Tile", () => {
  it("shows a loading state until a price arrives", () => {
    const tile = mount(Tile, { props: { pair: eurusd, showChart: false } });
    expect(tile.isPriceLoading()).toBe(true);
    // Execution controls render but are disabled while loading.
    expect(tile.isSellDisabled()).toBe(true);
    expect(tile.isBuyDisabled()).toBe(true);
  });

  it("renders the header, price and spread once a price streams in", () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: price() } },
    });
    expect(tile.headerText()).toBe("EUR/USD");
    expect(tile.isPriceLoading()).toBe(false);
    expect(tile.hasPriceButtons()).toBe(true);
    expect(tile.spreadText()).toBe("4.0");
  });

  it("renders a chart only in chart view", () => {
    const charted = mount(Tile, {
      props: { pair: eurusd, showChart: true },
      parametric: {
        prices: { EURUSD: price() },
        histories: { EURUSD: history },
      },
    });
    expect(charted.hasChart()).toBe(true);

    const flat = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: {
        prices: { EURUSD: price() },
        histories: { EURUSD: history },
      },
    });
    expect(flat.hasChart()).toBe(false);
  });

  it("transitions from loading to live when a price is pushed", () => {
    const tile = mount(Tile, { props: { pair: eurusd, showChart: false } });
    expect(tile.isPriceLoading()).toBe(true);
    tile.setPrice("EURUSD", price());
    expect(tile.isPriceLoading()).toBe(false);
    expect(tile.hasPriceButtons()).toBe(true);
  });

  it("enables execution once a price is present and records the executed trade", async () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: price() } },
      commands: { executeTrade: tradeResult() },
    });
    expect(tile.isBuyDisabled()).toBe(false);
    await tile.clickBuy();
    // Confirmation overlay appears after the awaited result resolves.
    expect(tile.hasConfirmation()).toBe(true);
    expect(tile.confirmationText()).toMatch(/you bought/i);
  });

  it("records the execute command input including the live price and notional", async () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: price() } },
      commands: { executeTrade: tradeResult({ direction: Direction.Sell }) },
    });
    await tile.clickSell();
    const cmds = tile.executedTrades();
    expect(cmds).toHaveLength(1);
    expect(cmds[0].direction).toBe(Direction.Sell);
    expect(cmds[0].notional).toBe(1_000_000);
    expect(cmds[0].pair.symbol).toBe("EURUSD");
    expect(cmds[0].price.bid).toBe(1.0921);
  });

  it("falls back to a timeout confirmation when the execute command errors", async () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: price() } },
      commands: { executeTradeThrows: true },
    });
    await tile.clickBuy();
    expect(tile.hasConfirmation()).toBe(true);
    expect(tile.confirmationText()).toMatch(/timed out/i);
  });

  it("lets the user edit the notional", async () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: price() } },
    });
    expect(tile.notionalValue()).toBe("1,000,000");
    tile.setNotional("2500");
    expect(tile.notionalValue()).toBe("2,500");
    expect(tile.hasNotionalReset()).toBe(true);
    await tile.resetNotional();
    expect(tile.notionalValue()).toBe("1,000,000");
    expect(tile.hasNotionalReset()).toBe(false);
  });

  it("shows a notional validation error and blocks execution", () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: price() } },
    });
    tile.setNotional("not-a-number");
    expect(tile.notionalError()).toMatch(/invalid input/i);
    // hasError disables the execution buttons.
    expect(tile.isBuyDisabled()).toBe(true);
  });

  it("switches to RFQ controls when the notional crosses the RFQ threshold", () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: price() } },
    });
    expect(tile.hasExecutionButtons()).toBe(true);
    tile.setNotional("20m");
    expect(tile.hasInitiateRfq()).toBe(true);
  });

  it("starts a tile whose default notional already requires an RFQ", () => {
    const tile = mount(Tile, {
      props: { pair: nzdusd, showChart: false },
      parametric: { prices: { NZDUSD: price({ symbol: "NZDUSD" }) } },
    });
    expect(tile.hasInitiateRfq()).toBe(true);
    expect(tile.hasExecutionButtons()).toBe(false);
  });

  it("requests an RFQ quote and renders the two-sided quote", async () => {
    const quoteResult: RfqQuoteResult = {
      bid: 1.0921,
      ask: 1.0925,
      mid: 1.0923,
    };
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: price() } },
      commands: { requestRfqQuote: quoteResult },
    });
    tile.setNotional("20m");
    expect(tile.hasInitiateRfq()).toBe(true);
    await tile.clickInitiateRfq();
    // The faked requestRfqQuote resolves synchronously → quote buttons appear.
    expect(tile.hasRfqButton("Buy 1.09250")).toBe(true);
    expect(tile.hasRfqButton("Sell 1.09210")).toBe(true);
  });

  it("accepts an RFQ quote and executes at the quoted price", async () => {
    // Quote prices differ from the live price so we can prove the SYNTHETIC
    // quote price (priceVal) — not the live stream price — reaches execution.
    const quoteResult: RfqQuoteResult = {
      bid: 1.2001,
      ask: 1.2005,
      mid: 1.2003,
    };
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: price() } },
      commands: { requestRfqQuote: quoteResult, executeTrade: tradeResult() },
    });
    tile.setNotional("20m");
    await tile.clickInitiateRfq();
    // Accept the buy side → handleExecute runs with the synthetic quote price.
    await tile.clickRfqButton("Buy 1.20050");
    const cmds = tile.executedTrades();
    expect(cmds).toHaveLength(1);
    expect(cmds[0].direction).toBe(Direction.Buy);
    // Notional reflects the 20m RFQ value, and the price is the synthetic quote
    // (1.2005), distinct from the live stream price (1.0925).
    expect(cmds[0].notional).toBe(20_000_000);
    expect(cmds[0].price.ask).toBe(quoteResult.ask);
    expect(cmds[0].price.bid).toBe(quoteResult.bid);
  });

  it("shows the stale overlay after a disconnect/reconnect with no fresh price", () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: price() } },
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    expect(tile.isStale()).toBe(false);
    tile.emit({ useConnectionStatus: ConnectionStatus.DISCONNECTED });
    tile.emit({ useConnectionStatus: ConnectionStatus.CONNECTED });
    expect(tile.isStale()).toBe(true);
    // A fresh price reference clears the stale flag.
    tile.setPrice("EURUSD", price({ bid: 1.1 }));
    expect(tile.isStale()).toBe(false);
  });

  it("disables the Buy/Sell buttons while the tile is stale", () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: price() } },
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    expect(tile.isStale()).toBe(false);
    expect(tile.isBuyDisabled()).toBe(false);
    expect(tile.isSellDisabled()).toBe(false);
    tile.emit({ useConnectionStatus: ConnectionStatus.DISCONNECTED });
    tile.emit({ useConnectionStatus: ConnectionStatus.CONNECTED });
    expect(tile.isStale()).toBe(true);
    expect(tile.isBuyDisabled()).toBe(true);
    expect(tile.isSellDisabled()).toBe(true);
    tile.setPrice("EURUSD", price({ bid: 1.1 }));
    expect(tile.isStale()).toBe(false);
    expect(tile.isBuyDisabled()).toBe(false);
    expect(tile.isSellDisabled()).toBe(false);
  });
});
