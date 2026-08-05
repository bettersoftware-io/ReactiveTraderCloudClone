import { Direction } from "@rtc/domain";

/**
 * Phase-1 subset of the v5 prototype's `_jvHandle` intent cascade, ported to
 * a pure function so it is unit-testable without any live port. Rule order
 * is significant — see the priority test in jarvisIntent.test.ts (a trade
 * phrase that also contains a bare symbol must win over the bare-symbol
 * "quote" rule).
 */
export interface JarvisTradeIntent {
  readonly kind: "trade";
  readonly symbol: string;
  readonly direction: Direction;
  readonly notional: number;
}

export type JarvisIntent =
  | { readonly kind: "greeting" }
  | { readonly kind: "help" }
  | { readonly kind: "pnl" }
  | { readonly kind: "movers" }
  | { readonly kind: "spread"; readonly symbol: string }
  | { readonly kind: "quote"; readonly symbol: string }
  | JarvisTradeIntent
  | { readonly kind: "showPanel" }
  | {
      readonly kind: "restylePanel";
      readonly viz: "heatmap" | "table" | "line";
    }
  | { readonly kind: "fallback" };

const DEFAULT_TRADE_NOTIONAL = 1_000_000;

/**
 * Extracts a spoken notional amount ("5M", "2m", "500k", "1.5 mio",
 * "2 million", "3 thousand") from anywhere in free text.
 *
 * NOT the same helper as `@rtc/domain`'s `parseNotional` — that one parses a
 * whole notional-field input (`^...$`-anchored, returns a
 * `NotionalParseResult`). This one scans a full sentence for an embedded
 * amount and returns a plain `number | null`, matching the v5 prototype's
 * `_jvNotional`.
 */
export function parseNotional(text: string): number | null {
  // The number is matched atomically — captured in a lookahead, then consumed
  // by backreference — so the engine can never re-split a long digit run
  // while scanning (CodeQL js/polynomial-redos on the naive `\d+` form).
  // Behaviour is identical: a digit can never begin the suffix alternation,
  // so shortening the greedy number match could never have helped anyway.
  const match = text.match(
    /(?=(\d+(?:\.\d+)?))\1\s*(million|mio|mm|thousand|k|m)\b/i,
  );

  if (!match) {
    return null;
  }

  const rawValue = match[1];
  const rawSuffix = match[2];

  if (rawValue === undefined || rawSuffix === undefined) {
    return null;
  }

  const value = Number.parseFloat(rawValue);
  const suffix = rawSuffix.toLowerCase();
  const multiplier =
    suffix === "k" || suffix === "thousand" ? 1_000 : 1_000_000;
  return Math.round(value * multiplier);
}

/** Uppercases and strips "/" so "EUR/USD" and "eurusd" both compare against
 * the canonical "EURUSD" symbol form. */
function normalizeForSymbolMatch(text: string): string {
  return text.toUpperCase().replace(/\//g, "");
}

function findKnownSymbol(
  text: string,
  knownSymbols: readonly string[],
): string | null {
  const normalized = normalizeForSymbolMatch(text);

  for (const symbol of knownSymbols) {
    if (normalized.includes(symbol.toUpperCase())) {
      return symbol;
    }
  }

  return null;
}

const RULE_1_BRIEFING = /(brief|summar|sitrep|status report|good morning)/i;
const RULE_2_BUY_SELL = /\b(buy|sell)\b/i;
const RULE_3_SPREAD = /spread/i;
const RULE_4_PNL = /(pnl|p&l|profit|how am i doing|performance)/i;
// Checked ahead of RULE_5_MOVERS below: "volatility" contains "volatil",
// which RULE_5_MOVERS would otherwise claim first (e.g. "show me gbp
// volatility" must resolve to showPanel, not movers).
const RULE_SHOW_PANEL = /volatility|vol panel|show .*(chart|panel)/i;
const RULE_RESTYLE_PANEL = /make (?:it|that) a (heatmap|table|line)/i;
const RULE_5_MOVERS = /(moving|movers|market|happening|action|volatil)/i;
const RULE_7_HELP = /(help|what can you|capabilit)/i;
const RULE_8_GREETING = /(^| )(hi|hello|hey|thanks|thank you|cheers)( |$|!|,)/i;

function isRestyleViz(
  value: string | undefined,
): value is "heatmap" | "table" | "line" {
  return value === "heatmap" || value === "table" || value === "line";
}

/**
 * Matches free text against the phase-1 intent cascade, in priority order:
 * 1. briefing/sitrep words           → pnl
 * 2. buy/sell + a known FX symbol    → trade
 * 3. "spread" + a known FX symbol    → spread
 * 4. pnl/profit/performance words    → pnl
 * 5. volatility/panel-request words  → showPanel
 * 6. "make it/that a <viz>" words    → restylePanel
 * 7. moving/movers/market words      → movers
 * 8. a bare known FX symbol          → quote
 * 9. help/capability words           → help
 * 10. greeting words                 → greeting
 * 11. anything else                  → fallback
 */
export function matchJarvisIntent(
  text: string,
  knownSymbols: readonly string[],
): JarvisIntent {
  if (RULE_1_BRIEFING.test(text)) {
    return { kind: "pnl" };
  }

  const buySellMatch = text.match(RULE_2_BUY_SELL);

  if (buySellMatch) {
    const symbol = findKnownSymbol(text, knownSymbols);
    const directionWord = buySellMatch[1];

    if (symbol && directionWord) {
      const direction =
        directionWord.toLowerCase() === "buy" ? Direction.Buy : Direction.Sell;
      const notional = parseNotional(text) ?? DEFAULT_TRADE_NOTIONAL;
      return { kind: "trade", symbol, direction, notional };
    }
  }

  if (RULE_3_SPREAD.test(text)) {
    const symbol = findKnownSymbol(text, knownSymbols);

    if (symbol) {
      return { kind: "spread", symbol };
    }
  }

  if (RULE_4_PNL.test(text)) {
    return { kind: "pnl" };
  }

  if (RULE_SHOW_PANEL.test(text)) {
    return { kind: "showPanel" };
  }

  const restyleMatch = text.match(RULE_RESTYLE_PANEL);

  if (restyleMatch) {
    const viz = restyleMatch[1]?.toLowerCase();

    if (isRestyleViz(viz)) {
      return { kind: "restylePanel", viz };
    }
  }

  if (RULE_5_MOVERS.test(text)) {
    return { kind: "movers" };
  }

  const bareSymbol = findKnownSymbol(text, knownSymbols);

  if (bareSymbol) {
    return { kind: "quote", symbol: bareSymbol };
  }

  if (RULE_7_HELP.test(text)) {
    return { kind: "help" };
  }

  if (RULE_8_GREETING.test(text)) {
    return { kind: "greeting" };
  }

  return { kind: "fallback" };
}
