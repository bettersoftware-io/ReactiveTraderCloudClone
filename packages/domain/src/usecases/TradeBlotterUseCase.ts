import type { Observable } from "rxjs";

import type { Trade } from "../fx/trade.js";
import type { BlotterPort } from "../ports/blotterPort.js";

export class TradeBlotterUseCase {
  constructor(private readonly blotter: BlotterPort) {}

  execute(): Observable<readonly Trade[]> {
    return this.blotter.getTradeStream();
  }
}
