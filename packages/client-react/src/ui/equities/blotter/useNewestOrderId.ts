import { useEffect, useRef, useState } from "react";

import type { EquityOrder } from "@rtc/domain";

/**
 * Tracks the id of the single most-recently-appeared equity order, purely by
 * diffing the incoming order id set against the previous render's set — no
 * timers, no Date.now. Mirrors WatchlistRow's tick-pulse rule: a ref is only
 * ever read/written inside an effect, never during render. The very first
 * render just captures the initial id set (nothing counts as "new" on
 * mount — mirrors WatchlistRow's "no pulse on the first tick" guard); from
 * then on, whichever order's id wasn't in the previous set becomes the
 * flagged row. There is no separate "clear" step: when a newer order later
 * appears the flag simply moves there.
 */
export function useNewestOrderId(
  orders: readonly EquityOrder[],
): string | null {
  const prevIdsRef = useRef<ReadonlySet<string> | null>(null);
  const [newestId, setNewestId] = useState<string | null>(null);

  useEffect(() => {
    const ids = new Set(
      orders.map((order) => {
        return order.id;
      }),
    );
    const prevIds = prevIdsRef.current;

    if (prevIds !== null) {
      const newest = newestUnseenId(prevIds, orders);

      if (newest !== null) {
        setNewestId(newest);
      }
    }

    prevIdsRef.current = ids;
  }, [orders]);

  return newestId;
}

/**
 * Pure: the last order (in array order) whose id is absent from `prevIds`,
 * or null when nothing new appeared. Exported so the diff logic has a
 * dependency-free unit test alongside the hook.
 */
export function newestUnseenId(
  prevIds: ReadonlySet<string>,
  orders: readonly EquityOrder[],
): string | null {
  let newest: string | null = null;

  for (const order of orders) {
    if (!prevIds.has(order.id)) {
      newest = order.id;
    }
  }

  return newest;
}
