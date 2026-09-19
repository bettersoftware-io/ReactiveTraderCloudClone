import { describe, expect, it } from "vitest";

import { DEFAULT_EQ_WATCHLIST_SORT } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeEqWatchlistSortPreferenceContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("sort$ replays the default synchronously and follows setSort", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.eqWatchlistSortPreference;
        const c = collect(p.sort$);
        expect(c.values).toEqual([DEFAULT_EQ_WATCHLIST_SORT]);
        p.setSort("price");
        await settle();
        expect(c.values.at(-1)).toBe("price");
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("cycle() walks the ring from the CURRENT stored value, not from the default", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.eqWatchlistSortPreference;
        // "price" is NOT the default ("chg"): a cycle that ignored the
        // stored value and advanced from the default would land on "sym"
        // then "chg" starting from "chg" itself, not from "price", and the
        // assertion below would see a different first step.
        p.setSort("price");
        await settle();
        const c = collect(p.sort$);
        expect(c.values).toEqual(["price"]);
        p.cycle();
        p.cycle();
        p.cycle();
        await settle();
        expect(c.values).toEqual(["price", "sym", "chg", "price"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber replays the current sort synchronously, not the history", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.eqWatchlistSortPreference;
        p.setSort("price");
        await settle();
        const c = collect(p.sort$);
        expect(c.values).toEqual(["price"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
