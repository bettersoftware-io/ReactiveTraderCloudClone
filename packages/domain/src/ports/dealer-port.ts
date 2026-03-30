import type { Dealer } from "../credit/dealer.js";

export interface DealerPort {
  subscribe(): AsyncIterable<readonly Dealer[]>;
}
