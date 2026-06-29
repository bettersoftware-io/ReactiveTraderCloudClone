import { BehaviorSubject, type Observable } from "rxjs";

import type { EquityPosition } from "../equities/position.js";
import type { MarketDataPort } from "../ports/marketDataPort.js";
import type { PositionPort } from "../ports/positionPort.js";
import type { FillEvent } from "./EquityOrderSimulator.js";

interface Lot {
  qty: number;
  cost: number;
}

export class EquityPositionSimulator implements PositionPort {
  private readonly subject = new BehaviorSubject<readonly EquityPosition[]>([]);

  private readonly lots = new Map<string, Lot>();

  private readonly marks = new Map<string, number>();

  constructor(_marketData: MarketDataPort, _seed = 1) {}

  /** Wired from the order simulator's fill listener (composition seam). */
  onFill(fill: FillEvent): void {
    const signed = fill.side === "buy" ? fill.qty : -fill.qty;
    const lot = this.lots.get(fill.symbol) ?? { qty: 0, cost: 0 };
    lot.qty += signed;
    lot.cost += signed * fill.price;
    this.lots.set(fill.symbol, lot);
    this.marks.set(fill.symbol, fill.price);
    this.recompute();
  }

  /** Wired from quote stream subscriptions to re-mark live (composition seam). */
  onMark(symbol: string, price: number): void {
    this.marks.set(symbol, price);
    this.recompute();
  }

  private recompute(): void {
    const positions: EquityPosition[] = [];

    for (const [symbol, lot] of this.lots) {
      if (lot.qty === 0) continue;
      const avgPrice = lot.cost / lot.qty;
      const markPrice = this.marks.get(symbol) ?? avgPrice;
      positions.push({
        symbol,
        qty: lot.qty,
        avgPrice,
        markPrice,
        unrealisedPnl: lot.qty * (markPrice - avgPrice),
      });
    }

    this.subject.next(positions);
  }

  positions(): Observable<readonly EquityPosition[]> {
    return this.subject.asObservable();
  }
}
