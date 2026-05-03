import type { Trade } from "../fx/trade.js";

export interface BlotterPort {
  getTradeStream(): AsyncIterable<readonly Trade[]>;
}
