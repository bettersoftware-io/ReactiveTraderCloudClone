import type { PriceTick } from "../fx/price.js";
import type { CurrencyPair } from "../fx/currencyPair.js";
import type { PricingPort } from "../ports/pricingPort.js";
import { KNOWN_CURRENCY_PAIRS } from "../fx/currencyPair.js";
import { PRICE_HISTORY_SIZE } from "../fx/price.js";

const HALF_SPREAD = 0.0002;
const MIN_TICK_INTERVAL_MS = 150;
const MAX_TICK_INTERVAL_MS = 1_000;

export interface RfqQuoteResult {
  readonly bid: number;
  readonly ask: number;
  readonly mid: number;
}

interface PairState {
  mid: number;
  history: PriceTick[];
}

function generateInitialMid(): number {
  return Math.trunc(Math.random() * 1_000_000) / 100_000;
}

function applyRandomWalk(mid: number): number {
  return mid * (1 + (Math.random() > 0.5 ? 0.0001 : -0.0001));
}

function createTick(symbol: string, mid: number, timestamp: number): PriceTick {
  return {
    symbol,
    mid,
    ask: mid + HALF_SPREAD,
    bid: mid - HALF_SPREAD,
    valueDate: new Date().toISOString().slice(0, 10),
    creationTimestamp: timestamp,
  };
}

function tickInterval(): number {
  return Math.max(MIN_TICK_INTERVAL_MS, Math.random() * MAX_TICK_INTERVAL_MS);
}

export class PricingSimulator implements PricingPort {
  private readonly pairs = new Map<string, PairState>();

  constructor() {
    for (const pair of KNOWN_CURRENCY_PAIRS) {
      this.initPair(pair);
    }
  }

  private initPair(pair: CurrencyPair): void {
    let mid = generateInitialMid();
    const now = Date.now();
    const history: PriceTick[] = [];

    for (let i = PRICE_HISTORY_SIZE - 1; i >= 0; i--) {
      mid = applyRandomWalk(mid);
      const timestamp = now - i * 500; // ~500ms between historical ticks
      history.push(createTick(pair.symbol, mid, timestamp));
    }

    this.pairs.set(pair.symbol, { mid, history });
  }

  async getPriceHistory(symbol: string): Promise<readonly PriceTick[]> {
    const state = this.pairs.get(symbol);
    if (!state) throw new Error(`Unknown symbol: ${symbol}`);
    return [...state.history];
  }

  async *getPriceUpdates(symbol: string): AsyncIterable<PriceTick> {
    const state = this.pairs.get(symbol);
    if (!state) throw new Error(`Unknown symbol: ${symbol}`);

    // Emit current history ticks first
    for (const tick of state.history) {
      yield tick;
    }

    // Then stream new ticks at random intervals
    while (true) {
      await new Promise<void>((resolve) => setTimeout(resolve, tickInterval()));

      state.mid = applyRandomWalk(state.mid);
      const tick = createTick(symbol, state.mid, Date.now());

      // Update rolling window
      state.history.push(tick);
      if (state.history.length > PRICE_HISTORY_SIZE) {
        state.history.shift();
      }

      yield tick;
    }
  }

  /**
   * Generate an RFQ quote with widened spread.
   * priceChange = 0.3 / 10^pipsPosition
   */
  getRfqQuote(symbol: string, pipsPosition: number): RfqQuoteResult {
    const state = this.pairs.get(symbol);
    if (!state) throw new Error(`Unknown symbol: ${symbol}`);

    const priceChange = 0.3 / Math.pow(10, pipsPosition);
    const currentAsk = state.mid + HALF_SPREAD;
    const currentBid = state.mid - HALF_SPREAD;

    return {
      ask: currentAsk + priceChange,
      bid: currentBid - priceChange,
      mid: state.mid,
    };
  }
}
