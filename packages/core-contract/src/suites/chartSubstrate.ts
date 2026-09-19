import { describe, expect, it } from "vitest";

import { DEFAULT_CHART_SUBSTRATE } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeChartSubstrateContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("substrate$ replays the default synchronously and follows setSubstrate", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.chartSubstrate;
        const c = collect(p.substrate$);
        expect(c.values).toEqual([DEFAULT_CHART_SUBSTRATE]);
        p.setSubstrate("canvas");
        await settle();
        expect(c.values).toEqual([DEFAULT_CHART_SUBSTRATE, "canvas"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber replays the current substrate synchronously, not the history", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.chartSubstrate;
        p.setSubstrate("canvas");
        await settle();
        const c = collect(p.substrate$);
        expect(c.values).toEqual(["canvas"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
