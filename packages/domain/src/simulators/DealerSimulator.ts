import { type Observable, of } from "rxjs";

import type { Dealer } from "../credit/dealer.js";
import type { DealerPort } from "../ports/dealerPort.js";

export const DEALERS_CATALOG: readonly Dealer[] = [
  { id: 0, name: "J.P. Morgan" },
  { id: 1, name: "Wells Fargo" },
  { id: 2, name: "Bank of America" },
  { id: 3, name: "Morgan Stanley" },
  { id: 4, name: "Goldman Sachs" },
  { id: 5, name: "Citigroup" },
  { id: 6, name: "TD Bank" },
  { id: 7, name: "UBS" },
  { id: 8, name: "Bank of New York Mellon" },
  { id: 9, name: "Capital One" },
];

export class DealerSimulator implements DealerPort {
  getDealers(): Observable<readonly Dealer[]> {
    return of(DEALERS_CATALOG);
  }
}
