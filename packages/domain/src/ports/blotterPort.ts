import type { Observable } from "rxjs";
import type { Trade } from "../fx/trade.js";

export interface BlotterPort {
  getTradeStream(): Observable<readonly Trade[]>;
}
