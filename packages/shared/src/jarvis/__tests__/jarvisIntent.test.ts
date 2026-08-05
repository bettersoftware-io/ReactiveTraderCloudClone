import { describe, expect, it } from "vitest";

import { Direction, KNOWN_CURRENCY_PAIRS } from "@rtc/domain";

import { matchJarvisIntent, parseNotional } from "../jarvisIntent.js";

const knownSymbols = KNOWN_CURRENCY_PAIRS.map((p) => {
  return p.symbol;
});

describe("parseNotional", () => {
  it("parses a bare M suffix", () => {
    expect(parseNotional("buy 5M EURUSD")).toBe(5_000_000);
  });

  it("parses a lowercase m suffix", () => {
    expect(parseNotional("2m")).toBe(2_000_000);
  });

  it("parses a k suffix", () => {
    expect(parseNotional("sell 500k gbpusd")).toBe(500_000);
  });

  it("parses a decimal amount with a spelled-out mio suffix", () => {
    expect(parseNotional("1.5 mio")).toBe(1_500_000);
  });

  it("parses the full word 'million'", () => {
    expect(parseNotional("2 million")).toBe(2_000_000);
  });

  it("parses the full word 'thousand'", () => {
    expect(parseNotional("3 thousand")).toBe(3_000);
  });

  it("returns null when no notional is present", () => {
    expect(parseNotional("buy eurusd")).toBeNull();
  });
});

describe("matchJarvisIntent", () => {
  it("rule 1: briefing/sitrep words -> pnl", () => {
    expect(matchJarvisIntent("Give me a quick sitrep", knownSymbols)).toEqual({
      kind: "pnl",
    });
    expect(matchJarvisIntent("status report please", knownSymbols)).toEqual({
      kind: "pnl",
    });
    expect(matchJarvisIntent("good morning jarvis", knownSymbols)).toEqual({
      kind: "pnl",
    });
  });

  it("rule 2: buy/sell + known symbol -> trade, notional via parseNotional (default 1_000_000)", () => {
    expect(matchJarvisIntent("buy 5M EURUSD", knownSymbols)).toEqual({
      kind: "trade",
      symbol: "EURUSD",
      direction: Direction.Buy,
      notional: 5_000_000,
    });
    expect(matchJarvisIntent("sell 500k gbpusd", knownSymbols)).toEqual({
      kind: "trade",
      symbol: "GBPUSD",
      direction: Direction.Sell,
      notional: 500_000,
    });
    expect(matchJarvisIntent("buy eurusd", knownSymbols)).toEqual({
      kind: "trade",
      symbol: "EURUSD",
      direction: Direction.Buy,
      notional: 1_000_000,
    });
  });

  it("rule 3: 'spread' + known symbol -> spread", () => {
    expect(
      matchJarvisIntent("what's the spread on EURUSD?", knownSymbols),
    ).toEqual({ kind: "spread", symbol: "EURUSD" });
  });

  it("rule 4: pnl/profit/performance words -> pnl", () => {
    expect(matchJarvisIntent("how's our p&l looking", knownSymbols)).toEqual({
      kind: "pnl",
    });
    expect(matchJarvisIntent("how am i doing today", knownSymbols)).toEqual({
      kind: "pnl",
    });
  });

  it("rule 5: volatility/panel-request words -> showPanel", () => {
    expect(matchJarvisIntent("show me gbp volatility", knownSymbols)).toEqual({
      kind: "showPanel",
    });
    expect(matchJarvisIntent("pull up a vol panel", knownSymbols)).toEqual({
      kind: "showPanel",
    });
    expect(matchJarvisIntent("show me a price chart", knownSymbols)).toEqual({
      kind: "showPanel",
    });
  });

  it("rule 6: 'make it/that a <viz>' -> restylePanel, with the viz parsed", () => {
    expect(matchJarvisIntent("make it a heatmap", knownSymbols)).toEqual({
      kind: "restylePanel",
      viz: "heatmap",
    });
    expect(matchJarvisIntent("make that a table", knownSymbols)).toEqual({
      kind: "restylePanel",
      viz: "table",
    });
    expect(matchJarvisIntent("Make It A Line", knownSymbols)).toEqual({
      kind: "restylePanel",
      viz: "line",
    });
  });

  it("rule 7: moving/movers/market words -> movers", () => {
    expect(matchJarvisIntent("what's moving", knownSymbols)).toEqual({
      kind: "movers",
    });
    expect(
      matchJarvisIntent("what's happening in the market", knownSymbols),
    ).toEqual({ kind: "movers" });
  });

  it("rule 8: a bare known symbol -> quote", () => {
    expect(matchJarvisIntent("where is EURUSD?", knownSymbols)).toEqual({
      kind: "quote",
      symbol: "EURUSD",
    });
  });

  it("rule 9: help/capability words -> help", () => {
    expect(matchJarvisIntent("what can you do for me?", knownSymbols)).toEqual({
      kind: "help",
    });
    expect(
      matchJarvisIntent("what are your capabilities", knownSymbols),
    ).toEqual({ kind: "help" });
  });

  it("rule 10: greeting words -> greeting", () => {
    expect(matchJarvisIntent("hi there", knownSymbols)).toEqual({
      kind: "greeting",
    });
    expect(matchJarvisIntent("hey!", knownSymbols)).toEqual({
      kind: "greeting",
    });
    expect(matchJarvisIntent("thanks jarvis", knownSymbols)).toEqual({
      kind: "greeting",
    });
  });

  it("rule 11: anything else -> fallback", () => {
    expect(matchJarvisIntent("xyzzy", knownSymbols)).toEqual({
      kind: "fallback",
    });
  });

  it("priority: a volatility phrase resolves to showPanel, not movers ('volatil' substring collision)", () => {
    expect(matchJarvisIntent("show me gbp volatility", knownSymbols)).toEqual({
      kind: "showPanel",
    });
  });

  it("priority: a trade phrase containing a bare symbol is trade, not quote", () => {
    expect(matchJarvisIntent("buy 2M GBPUSD", knownSymbols)).toEqual({
      kind: "trade",
      symbol: "GBPUSD",
      direction: Direction.Buy,
      notional: 2_000_000,
    });
  });

  it("rule 0: a [narration] prefix -> narration, quoting the symbol parsed from the prompt", () => {
    expect(
      matchJarvisIntent("[narration] EURUSD volatility spiking", knownSymbols),
    ).toEqual({ kind: "narration", symbol: "EURUSD" });
  });

  it("priority: [narration] wins over showPanel/movers even though the prompt also says 'volatility'", () => {
    expect(
      matchJarvisIntent("[narration] EURUSD volatility spiking", knownSymbols),
    ).toEqual({ kind: "narration", symbol: "EURUSD" });
  });

  it("narration falls back to a generic symbol when no known pair is in the prompt", () => {
    expect(
      matchJarvisIntent("[narration] volatility spiking", knownSymbols),
    ).toEqual({ kind: "narration", symbol: "the desk" });
  });

  it("setupWorkspace: 'set up my morning workspace' -> setupWorkspace", () => {
    expect(
      matchJarvisIntent("set up my morning workspace", knownSymbols),
    ).toEqual({ kind: "setupWorkspace" });
  });

  it("setupWorkspace: 'pull up my vol workspace' -> setupWorkspace", () => {
    expect(matchJarvisIntent("pull up my vol workspace", knownSymbols)).toEqual(
      { kind: "setupWorkspace" },
    );
  });

  it("priority: setupWorkspace wins over movers on the 'volatil' substring collision ('set up a volatility workspace')", () => {
    expect(
      matchJarvisIntent("let's set up a volatility workspace", knownSymbols),
    ).toEqual({ kind: "setupWorkspace" });
  });
});
