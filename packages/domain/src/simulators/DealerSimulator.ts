import { type Observable, of } from "rxjs";

import type { Dealer } from "../credit/dealer.js";
import type { DealerPort } from "../ports/dealerPort.js";

export const DEALERS_CATALOG: readonly Dealer[] = [
  { id: 0, name: "Adaptive Bank" },
  { id: 1, name: "Citi" },
  // "J.P. Morgan" with the periods — the mobile-v1 design prints it that way
  // (`this.DEALERS` in the standalone prototype); the web-v5 design says
  // "JP Morgan", and where the two disagree the measured surface (the RN
  // prototype-fidelity comparison) wins.
  { id: 2, name: "J.P. Morgan" },
  { id: 3, name: "Goldman Sachs" },
  { id: 4, name: "Morgan Stanley" },
  { id: 5, name: "Barclays" },
  { id: 6, name: "RBC" },
  { id: 7, name: "HSBC" },
  { id: 8, name: "Deutsche Bank" },
];

export class DealerSimulator implements DealerPort {
  getDealers(): Observable<readonly Dealer[]> {
    return of(DEALERS_CATALOG);
  }
}
