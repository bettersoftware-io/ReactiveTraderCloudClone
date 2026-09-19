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

if (!_eurusd) {
  throw new Error("EURUSD not found in KNOWN_CURRENCY_PAIRS");
}

// NZDUSD's defaultNotional is 10,000,000 (>= RFQ threshold) → starts in RFQ mode.
const _nzdusd = KNOWN_CURRENCY_PAIRS.find((p) => {
  return p.symbol === "NZDUSD";
});

if (!_nzdusd) {
  throw new Error("NZDUSD not found in KNOWN_CURRENCY_PAIRS");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Tile", () => {
  it("shows a loading state until a createPrice arrives", () => {
    const tile = mount(Tile, { props: { pair: eurusd, showChart: false } });
    expect(tile.isPriceLoading()).toBe(true);
    // The createPrice boxes ARE the execution buttons now, so with no createPrice yet
    // there is nothing to render (and nothing to click).
    expect(tile.hasExecutionButtons()).toBe(false);
  });

  it("renders the header, createPrice and spread once a createPrice streams in", () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: createPrice() } },
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
        prices: { EURUSD: createPrice() },
        histories: { EURUSD: history },
      },
    });
    expect(charted.hasChart()).toBe(true);

    const flat = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: {
        prices: { EURUSD: createPrice() },
        histories: { EURUSD: history },
      },
    });
    expect(flat.hasChart()).toBe(false);
  });

  it("transitions from loading to live when a createPrice is pushed", () => {
    const tile = mount(Tile, { props: { pair: eurusd, showChart: false } });
    expect(tile.isPriceLoading()).toBe(true);
    tile.setPrice("EURUSD", createPrice());
    expect(tile.isPriceLoading()).toBe(false);
    expect(tile.hasPriceButtons()).toBe(true);
  });

  it("enables execution once a createPrice is present and records the executed trade", async () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: createPrice() } },
      commands: { executeTrade: createTradeResult() },
    });
    expect(tile.isBuyDisabled()).toBe(false);
    await tile.clickBuy();
    // Confirmation overlay appears after the awaited result resolves.
    expect(tile.hasConfirmation()).toBe(true);
    expect(tile.confirmationText()).toMatch(/you bought/i);
  });

  it("records the execute command input including the live createPrice and notional", async () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: createPrice() } },
      commands: {
        executeTrade: createTradeResult({ direction: Direction.Sell }),
      },
    });
    await tile.clickSell();
    const cmds = tile.executedTrades();
    expect(cmds).toHaveLength(1);
    expect(cmds[0].direction).toBe(Direction.Sell);
    expect(cmds[0].notional).toBe(1_000_000);
    expect(cmds[0].pair.symbol).toBe("EURUSD");
    expect(cmds[0].price.bid).toBe(1.0921);
  });

  // PROTO RateTile bookPulse: the tile ROOT carries data-booked while the
  // success confirmation is showing (the glow must live on the root — the
  // overlay's own shadow is clipped by the tile's overflow:hidden). The
  // attribute cycles back to "false" on dismiss so the CSS animation replays
  // on the next successful trade.
  it("flags the tile root as booked during the success confirmation, and unflags on dismiss", async () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: createPrice() } },
      commands: { executeTrade: createTradeResult() },
    });
    expect(tile.bookedFlag("EURUSD")).toBe("false");
    await tile.clickBuy();
    expect(tile.hasConfirmation()).toBe(true);
    expect(tile.bookedFlag("EURUSD")).toBe("true");
    await tile.dismissDoneConfirmation();
    expect(tile.hasConfirmation()).toBe(false);
    expect(tile.bookedFlag("EURUSD")).toBe("false");
  });

  it("does not flag the tile as booked when the trade is rejected", async () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: createPrice() } },
      commands: {
        executeTrade: {
          ...createTradeResult(),
          status: ExecutionStatus.Rejected,
        },
      },
    });
    await tile.clickBuy();
    expect(tile.hasConfirmation()).toBe(true);
    expect(tile.confirmationText()).toMatch(/rejected/i);
    expect(tile.bookedFlag("EURUSD")).toBe("false");
  });

  it("falls back to a timeout confirmation when the execute command errors", async () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: createPrice() } },
      commands: { executeTradeThrows: true },
    });
    await tile.clickBuy();
    expect(tile.hasConfirmation()).toBe(true);
    expect(tile.confirmationText()).toMatch(/timed out/i);
  });

  it("lets the user edit the notional", async () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: createPrice() } },
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
      parametric: { prices: { EURUSD: createPrice() } },
    });
    tile.setNotional("not-a-number");
    expect(tile.notionalError()).toMatch(/invalid input/i);
    // hasError disables the execution buttons.
    expect(tile.isBuyDisabled()).toBe(true);
  });

  it("switches to RFQ controls when the notional crosses the RFQ threshold", () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: createPrice() } },
    });
    expect(tile.hasExecutionButtons()).toBe(true);
    tile.setNotional("20m");
    expect(tile.hasInitiateRfq()).toBe(true);
  });

  it("starts a tile whose default notional already requires an RFQ", () => {
    const tile = mount(Tile, {
      props: { pair: nzdusd, showChart: false },
      parametric: { prices: { NZDUSD: createPrice({ symbol: "NZDUSD" }) } },
    });
    expect(tile.hasInitiateRfq()).toBe(true);
    // The createPrice boxes still render (they show the live createPrice) but are
    // disabled — market execution is blocked while the notional requires
    // going through the RFQ quote flow instead.
    expect(tile.isSellDisabled()).toBe(true);
    expect(tile.isBuyDisabled()).toBe(true);
  });

  it("requests an RFQ quote and renders the two-sided quote", async () => {
    const quoteResult: RfqQuoteResult = {
      bid: 1.0921,
      ask: 1.0925,
      mid: 1.0923,
    };

    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: createPrice() } },
      commands: { requestRfqQuote: quoteResult },
    });
    tile.setNotional("20m");
    expect(tile.hasInitiateRfq()).toBe(true);
    await tile.clickInitiateRfq();
    // The faked requestRfqQuote resolves synchronously → quote buttons appear.
    expect(tile.hasRfqButton("Buy 1.09250")).toBe(true);
    expect(tile.hasRfqButton("Sell 1.09210")).toBe(true);
  });

  it("accepts an RFQ quote and executes at the quoted createPrice", async () => {
    // Quote prices differ from the live createPrice so we can prove the SYNTHETIC
    // quote createPrice (priceVal) — not the live stream createPrice — reaches execution.
    const quoteResult: RfqQuoteResult = {
      bid: 1.2001,
      ask: 1.2005,
      mid: 1.2003,
    };

    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: createPrice() } },
      commands: {
        requestRfqQuote: quoteResult,
        executeTrade: createTradeResult(),
      },
    });
    tile.setNotional("20m");
    await tile.clickInitiateRfq();
    // Accept the buy side → executeTrade runs with the synthetic quote createPrice.
    await tile.clickRfqButton("Buy 1.20050");
    const cmds = tile.executedTrades();
    expect(cmds).toHaveLength(1);
    expect(cmds[0].direction).toBe(Direction.Buy);
    // Notional reflects the 20m RFQ value, and the createPrice is the synthetic quote
    // (1.2005), distinct from the live stream createPrice (1.0925).
    expect(cmds[0].notional).toBe(20_000_000);
    expect(cmds[0].price.ask).toBe(quoteResult.ask);
    expect(cmds[0].price.bid).toBe(quoteResult.bid);
  });

  it("shows the stale overlay after a disconnect/reconnect with no fresh createPrice", () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: createPrice() } },
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    expect(tile.isStale()).toBe(false);
    tile.emit({ useConnectionStatus: ConnectionStatus.DISCONNECTED });
    tile.emit({ useConnectionStatus: ConnectionStatus.CONNECTED });
    expect(tile.isStale()).toBe(true);
    // A fresh createPrice reference clears the stale flag.
    tile.setPrice("EURUSD", createPrice({ bid: 1.1 }));
    expect(tile.isStale()).toBe(false);
  });

  // Tile.tsx's executeTrade guard (`if (!p || hasError || stale) return;`)
  // gates every execution path, not just the market createPrice boxes — TileRfq's
  // accept buttons carry no `disabled` attribute of their own, so this proves
  // the guard (not the DOM) is what blocks execution once the tile goes stale
  // mid-RFQ.
  it("blocks execution via the RFQ accept path once the tile goes stale", async () => {
    const quoteResult: RfqQuoteResult = {
      bid: 1.0921,
      ask: 1.0925,
      mid: 1.0923,
    };

    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: createPrice() } },
      commands: {
        requestRfqQuote: quoteResult,
        executeTrade: createTradeResult(),
      },
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    tile.setNotional("20m");
    await tile.clickInitiateRfq();
    expect(tile.hasRfqButton("Buy 1.09250")).toBe(true);

    // Disconnect/reconnect with no fresh createPrice tick — same recipe as "shows
    // the stale overlay..." above — flips the tile stale without touching
    // the in-flight RFQ quote.
    tile.emit({ useConnectionStatus: ConnectionStatus.DISCONNECTED });
    tile.emit({ useConnectionStatus: ConnectionStatus.CONNECTED });
    expect(tile.isStale()).toBe(true);
    expect(tile.hasRfqButton("Buy 1.09250")).toBe(true);

    await tile.clickRfqButton("Buy 1.09250");
    // TileRfq's accept() still fires (resets the RFQ machine), but Tile's
    // executeTrade's own guard blocks the execute() call while stale.
    expect(tile.executedTrades()).toHaveLength(0);
  });

  it("disables the Buy/Sell buttons while the tile is stale", () => {
    const tile = mount(Tile, {
      props: { pair: eurusd, showChart: false },
      parametric: { prices: { EURUSD: createPrice() } },
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
    tile.setPrice("EURUSD", createPrice({ bid: 1.1 }));
    expect(tile.isStale()).toBe(false);
    expect(tile.isBuyDisabled()).toBe(false);
    expect(tile.isSellDisabled()).toBe(false);
  });
});

function createPrice(over: Partial<Price> = {}): Price {
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

function createTradeResult(over: Partial<Trade> = {}): ExecuteTradeResult {
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

const eurusd: CurrencyPair = _eurusd;

const nzdusd: CurrencyPair = _nzdusd;

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
