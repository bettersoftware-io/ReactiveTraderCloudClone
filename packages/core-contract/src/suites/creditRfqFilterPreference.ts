import { describe, expect, it } from "vitest";

import { DEFAULT_CREDIT_RFQ_FILTER } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeCreditRfqFilterPreferenceContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("filter$ replays the default synchronously and follows setFilter", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.creditRfqFilterPreference;
        const c = collect(p.filter$);
        expect(c.values).toEqual([DEFAULT_CREDIT_RFQ_FILTER]);
        p.setFilter("closed");
        await settle();
        expect(c.values.at(-1)).toBe("closed");
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber replays the current filter synchronously, not the history", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.creditRfqFilterPreference;
        p.setFilter("closed");
        await settle();
        const c = collect(p.filter$);
        expect(c.values).toEqual(["closed"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
