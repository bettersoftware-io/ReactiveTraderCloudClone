import { describe, expect, it } from "vitest";

import { DEFAULT_AMBIENT_STYLE } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeAmbientStyleContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("style$ replays the default synchronously and follows setStyle", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.ambientStyle;
        const c = collect(p.style$);
        expect(c.values).toEqual([DEFAULT_AMBIENT_STYLE]);
        p.setStyle("rays");
        await settle();
        expect(c.values).toEqual([DEFAULT_AMBIENT_STYLE, "rays"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber replays the current style synchronously, not the history", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.ambientStyle;
        p.setStyle("rays");
        await settle();
        const c = collect(p.style$);
        expect(c.values).toEqual(["rays"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
