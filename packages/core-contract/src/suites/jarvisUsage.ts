import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import type { JarvisUsagePayload } from "#/harness/jarvisTypes";
import { settle } from "#/harness/settle";

/** `presenters.jarvisUsage` — the admin surface's Jarvis spend: null until
 * the port's first snapshot, then the latest one, replayed. */
export function describeJarvisUsageContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("usage$ starts null, then follows the port's snapshots", async () => {
      const h = makeHarness();

      try {
        const seen = collect(h.app.presenters.jarvisUsage.usage$);
        await settle();
        expect(seen.values).toEqual([null]);
        const first = createUsage(1);
        const second = createUsage(2);
        h.driver.pushJarvisUsage(first);
        h.driver.pushJarvisUsage(second);
        await settle();
        expect(seen.values).toEqual([null, first, second]);
        seen.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber gets the latest snapshot, not null", async () => {
      const h = makeHarness();

      try {
        const early = collect(h.app.presenters.jarvisUsage.usage$);
        await settle();
        const snapshot = createUsage(7);
        h.driver.pushJarvisUsage(snapshot);
        await settle();
        const late = collect(h.app.presenters.jarvisUsage.usage$);
        await settle();
        expect(late.values).toEqual([snapshot]);
        early.unsubscribe();
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}

function createUsage(windowEndMs: number): JarvisUsagePayload {
  return { windowStartMs: 0, windowEndMs, currentWindow: [], sinceBoot: [] };
}
