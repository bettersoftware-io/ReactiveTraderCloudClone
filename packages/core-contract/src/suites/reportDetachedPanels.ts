import { describe, expect, it } from "vitest";

import { DRIVE_STAGGER_MS } from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import type { MakeHarness } from "#/harness/harness";
import { driveBatch, leafIds, readLayout } from "#/suites/workspaceKit";

/** `commands.reportDetachedPanels` — the Dockview bridge's whole-set report
 * of a tab's floating/popped-out panels, which a Jarvis drive command must
 * not maximize. */
export function describeReportDetachedPanelsContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("a reported panel refuses a driven maximize; an empty report lifts that", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const [panelId] = leafIds(
            (await readLayout(h, "fx", clock.settle)).root,
          );
          const maximize = [
            { kind: "layout", op: "maximize", tab: "fx", panelId },
          ] as const;

          h.app.commands.reportDetachedPanels("fx", [panelId]);
          await driveBatch(h, maximize, clock.settle);
          await clock.advance(DRIVE_STAGGER_MS * 2);
          expect((await readLayout(h, "fx", clock.settle)).maximized).toBe(
            null,
          );

          h.app.commands.reportDetachedPanels("fx", []);
          await driveBatch(h, maximize, clock.settle);
          await clock.advance(DRIVE_STAGGER_MS * 2);
          expect((await readLayout(h, "fx", clock.settle)).maximized).toBe(
            panelId,
          );
        } finally {
          await h.teardown();
        }
      });
    });
  });
}
