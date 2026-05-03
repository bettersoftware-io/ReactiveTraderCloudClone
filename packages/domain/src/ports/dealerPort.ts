import type { Observable } from "rxjs";
import type { Dealer } from "../credit/dealer.js";

export interface DealerPort {
  getDealers(): Observable<readonly Dealer[]>;
}
