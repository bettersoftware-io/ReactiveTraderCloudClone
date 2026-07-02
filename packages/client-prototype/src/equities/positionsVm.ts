import { fmtNum } from "#/equities/equitiesData";
import type { EqOrder, EqPosition, EqSym } from "#/equities/types";

interface Agg {
  sym: EqSym;
  qty: number;
  cost: number;
}

// PROTO L1379: positions are derived from filled orders — sum signed qty and
// signed cost per symbol, drop net-zero, then mark to the live price.
export function positionsVm(
  orders: EqOrder[],
  rates: Record<EqSym, number>,
): EqPosition[] {
  const map = new Map<EqSym, Agg>();

  for (const o of orders) {
    if (o.status !== "Filled") {
      continue;
    }

    const sign = o.side === "Buy" ? 1 : -1;
    const agg = map.get(o.sym) ?? { sym: o.sym, qty: 0, cost: 0 };
    agg.qty += sign * o.qty;
    agg.cost += sign * o.qty * o.price;
    map.set(o.sym, agg);
  }

  const out: EqPosition[] = [];

  for (const agg of map.values()) {
    if (agg.qty === 0) {
      continue;
    }

    const last = rates[agg.sym];
    const avg = agg.cost / agg.qty;
    const mv = agg.qty * last;
    const pl = mv - agg.cost;

    out.push({
      sym: agg.sym,
      qty: fmtNum(agg.qty),
      avg: `$${avg.toFixed(2)}`,
      last: `$${last.toFixed(2)}`,
      mv: `$${fmtNum(mv)}`,
      pl: `${pl >= 0 ? "+$" : "-$"}${fmtNum(Math.abs(pl))}`,
      plColor: pl >= 0 ? "var(--buy)" : "var(--sell)",
    });
  }

  return out;
}
