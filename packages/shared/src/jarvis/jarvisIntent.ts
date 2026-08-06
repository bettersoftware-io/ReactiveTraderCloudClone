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
  | { readonly kind: "narration"; readonly symbol: string }
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
  | { readonly kind: "setupWorkspace" }
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

// Anchored (^) so a [narration] turn is collision-proof: it always wins
// regardless of what follows the prefix (e.g. the word "volatility", which
// RULE_SHOW_PANEL/RULE_5_MOVERS would otherwise claim). Checked before every
// other rule.
const RULE_0_NARRATION = /^\[narration\]/i;
const RULE_1_BRIEFING = /(brief|summar|sitrep|status report|good morning)/i;
const RULE_2_BUY_SELL = /\b(buy|sell)\b/i;
const RULE_3_SPREAD = /spread/i;
const RULE_4_PNL = /(pnl|p&l|profit|how am i doing|performance)/i;
// Checked ahead of isShowPanelRequest/RULE_5_MOVERS below: this prefix's own
// "vol(atility)?" alternative is a substring of both "volatility" (which
// RULE_SHOW_PANEL_DIRECT claims) and "volatil" (which RULE_5_MOVERS claims),
// so a phrase like "set up a volatility workspace" must resolve to
// setupWorkspace, not showPanel/movers. Split into prefix + noun (see
// isSetupWorkspaceRequest) to stay out of the polynomial-redos class.
const SETUP_WORKSPACE_PREFIX = /(set ?up|morning|vol(atility)?) /i;
const SETUP_WORKSPACE_NOUN = /workspace/i;
// Checked ahead of RULE_5_MOVERS below: "volatility" contains "volatil",
// which RULE_5_MOVERS would otherwise claim first (e.g. "show me gbp
// volatility" must resolve to showPanel, not movers).
const RULE_SHOW_PANEL_DIRECT = /volatility|vol panel/i;
const SHOW_PANEL_PREFIX = /show /i;
const SHOW_PANEL_NOUN = /chart|panel/i;
// `.` in the old one-shot regex spanned everything except these four, so
// splitting on them keeps the "same line" requirement it implied.
const LINE_TERMINATORS = /[\n\r\u2028\u2029]/;
const RULE_RESTYLE_PANEL = /make (?:it|that) a (heatmap|table|line)/i;
const RULE_5_MOVERS = /(moving|movers|market|happening|action|volatil)/i;
const RULE_7_HELP = /(help|what can you|capabilit)/i;
const RULE_8_GREETING = /(^| )(hi|hello|hey|thanks|thank you|cheers)( |$|!|,)/i;

/** Generic stand-in for a narration turn's quoted symbol when the prompt
 * doesn't contain a known pair. */
const NARRATION_SYMBOL_FALLBACK = "the desk";

function isRestyleViz(
  value: string | undefined,
): value is "heatmap" | "table" | "line" {
  return value === "heatmap" || value === "table" || value === "line";
}

/**
 * Reports whether the text asks for a panel — either by naming one outright
 * ("volatility", "vol panel") or by pairing "show " with a later "chart" or
 * "panel" on the same line ("show me a price chart").
 *
 * The second half was written as `show .*(chart|panel)` until CodeQL flagged
 * it (js/polynomial-redos). Free chat text reaches this rule, and a message
 * of many "show " runs with no chart/panel made the engine restart `.*` at
 * every one — quadratic, ~3s of pinned CPU for a 160 KB turn. Scanning from
 * only the FIRST "show " is equivalent (anything after a later "show " is
 * also after the first) and linear. Behaviour is unchanged: verified against
 * the old regex over 300k generated inputs, zero divergence.
 */
function isShowPanelRequest(text: string): boolean {
  if (RULE_SHOW_PANEL_DIRECT.test(text)) {
    return true;
  }

  for (const line of text.split(LINE_TERMINATORS)) {
    const showMatch = SHOW_PANEL_PREFIX.exec(line);

    if (showMatch === null) {
      continue;
    }

    if (
      SHOW_PANEL_NOUN.test(line.slice(showMatch.index + showMatch[0].length))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Reports whether the text asks for a workspace setup ("set up my morning
 * workspace", "vol workspace"). Same first-prefix linear-scan shape as
 * `isShowPanelRequest` above, and for the same reason: the one-shot form
 * `(set ?up|morning|vol(atility)?) .*workspace` shares the exact polynomial
 * class CodeQL flagged there (many prefix hits, no "workspace" → quadratic
 * restarts of `.*`). Scanning from only the FIRST prefix hit per line is
 * equivalent and linear.
 */
function isSetupWorkspaceRequest(text: string): boolean {
  for (const line of text.split(LINE_TERMINATORS)) {
    const prefixMatch = SETUP_WORKSPACE_PREFIX.exec(line);

    if (prefixMatch === null) {
      continue;
    }

    if (
      SETUP_WORKSPACE_NOUN.test(
        line.slice(prefixMatch.index + prefixMatch[0].length),
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Matches free text against the phase-1+ intent cascade, in priority order:
 * 0. a `[narration]` prefix          → narration (collision-proof, always wins)
 * 1. briefing/sitrep words           → pnl
 * 2. buy/sell + a known FX symbol    → trade
 * 3. "spread" + a known FX symbol    → spread
 * 4. pnl/profit/performance words    → pnl
 * 5. "set up/morning/vol workspace"  → setupWorkspace
 * 6. volatility/panel-request words  → showPanel
 * 7. "make it/that a <viz>" words    → restylePanel
 * 8. moving/movers/market words      → movers
 * 9. a bare known FX symbol          → quote
 * 10. help/capability words          → help
 * 11. greeting words                 → greeting
 * 12. anything else                  → fallback
 */
export function matchJarvisIntent(
  text: string,
  knownSymbols: readonly string[],
): JarvisIntent {
  if (RULE_0_NARRATION.test(text)) {
    const symbol = findKnownSymbol(text, knownSymbols);
    return { kind: "narration", symbol: symbol ?? NARRATION_SYMBOL_FALLBACK };
  }

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

  if (isSetupWorkspaceRequest(text)) {
    return { kind: "setupWorkspace" };
  }

  if (isShowPanelRequest(text)) {
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
