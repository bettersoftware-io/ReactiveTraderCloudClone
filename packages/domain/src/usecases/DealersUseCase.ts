import type { Observable } from "rxjs";
import type { Dealer } from "../credit/dealer.js";
import type { DealerPort } from "../ports/dealerPort.js";

export class DealersUseCase {
  constructor(private readonly dealers: DealerPort) {}
  execute(): Observable<readonly Dealer[]> {
    return this.dealers.getDealers();
  }
}
