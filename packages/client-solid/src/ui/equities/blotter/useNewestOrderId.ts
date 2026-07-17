import { type Accessor, createMemo } from "solid-js";

import type { EquityOrder } from "@rtc/domain";

/**
 * Tracks the id of the single most-recently-appeared equity order, purely by
 * diffing the incoming order id set against the previous run's set — no
 * timers, no Date.now.
 *
 * SOLID PORT NOTE: the react original stores the previous id set in a ref
 * (read/written only inside an effect, never during render) and the newest
 * id in state. Solid has no render phase to hook that trick into, so this
 * instead closes over two plain variables (the previous id set and the
 * current newest id) inside a `createMemo` — the memo body re-runs exactly
 * when `orders()` changes, updates both closed-over variables, and returns
 * the (possibly unchanged) newest id. The very first run just captures the
 * initial id set (nothing counts as "new" on mount — mirrors WatchlistRow's
 * "no pulse on the first tick" guard); from then on, whichever order's id
 * wasn't in the previous set becomes the flagged row. There is no separate
 * "clear" step: when a newer order later appears the flag simply moves there.
 */
export function useNewestOrderId(
  orders: Accessor<readonly EquityOrder[]>,
): Accessor<string | null> {
  let prevIds: ReadonlySet<string> | null = null;
  let newestId: string | null = null;

  return createMemo((): string | null => {
    const current = orders();
    const ids = new Set(
      current.map((order) => {
        return order.id;
      }),
    );

    if (prevIds !== null) {
      const newest = newestUnseenId(prevIds, current);

      if (newest !== null) {
        newestId = newest;
      }
    }

    prevIds = ids;

    return newestId;
  });
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
