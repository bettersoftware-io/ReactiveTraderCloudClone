import { describe, expect, it } from "vitest";

import { DEFAULT_LAYOUT_ENGINE, type LayoutEngine } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeLayoutEngineContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("engine$ replays the default synchronously and follows setEngine", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.layoutEngine;
        const c = collect(p.engine$);
        expect(c.values).toEqual([DEFAULT_LAYOUT_ENGINE]);
        p.setEngine(NON_DEFAULT_ENGINE);
        await settle();
        expect(c.values).toEqual([DEFAULT_LAYOUT_ENGINE, NON_DEFAULT_ENGINE]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber replays the current engine synchronously, not the history", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.layoutEngine;
        p.setEngine(NON_DEFAULT_ENGINE);
        await settle();
        const c = collect(p.engine$);
        expect(c.values).toEqual([NON_DEFAULT_ENGINE]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}

/** The engine that is NOT the default, derived rather than written as a
 * literal: setting the value the presenter already holds proves nothing about
 * "follows setEngine" (and the cores disagree on whether an unchanged set
 * re-emits). This suite broke on exactly that when the default moved to
 * "dockview". */
const NON_DEFAULT_ENGINE: LayoutEngine =
  DEFAULT_LAYOUT_ENGINE === "inhouse" ? "dockview" : "inhouse";
