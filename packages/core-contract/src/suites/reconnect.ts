import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

export function describeReconnectContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("commands.reconnect() pushes a 'reconnect' event into the connection stream", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.driver.connectionEvents$());
        h.app.commands.reconnect();
        expect(c.values).toEqual([{ type: "reconnect" }]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
