import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DriveCommandDeps, JarvisEvent } from "@rtc/client-core";
import type { JarvisDriverState } from "@rtc/core-api";

import { createDetachedHost, createHotStream } from "#/bridge/out";
import { createJarvisDriver } from "#/presenters/jarvisDriver";

// The family folds each outcome into the transcript through `listenOutcomes`
// — synchronously, in the same commit as `lastBatch`, as the RxJS and async
// cores do — rather than through `outcomes$`, which a fiber would deliver a
// scheduler step late.
describe("createJarvisDriver (Effect core)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("listenOutcomes hears each outcome synchronously — before lastBatch commits, as the RxJS driver's outcomes$.next precedes its patch", async () => {
    const events = createHotStream<JarvisEvent>();
    const driver = createJarvisDriver(createDetachedHost(), {
      listenEvents: events.listen,
      powerSaverLevel: () => {
        return "off";
      },
      commands: createCommandDeps(),
    });
    const order: string[] = [];
    driver.handle.state$.subscribe((state: JarvisDriverState) => {
      if (state.lastBatch.length > 0) {
        order.push("lastBatch");
      }
    });
    driver.listenOutcomes(() => {
      order.push("outcome");
    });

    events.publish({
      type: "command",
      batch: { v: 1, commands: [{ kind: "switchTab", tab: "credit" }] },
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(order).toEqual(["outcome", "lastBatch"]);
  });
});

function createCommandDeps(): DriveCommandDeps {
  const none = (): readonly string[] => {
    return [];
  };

  return {
    switchTab: vi.fn(),
    layout: vi.fn(),
    eqWorkspace: {
      select: vi.fn(),
      setTimeframe: vi.fn(),
      setChartType: vi.fn(),
      toggleIndicator: vi.fn(),
      togglePane: vi.fn(),
    } as unknown as DriveCommandDeps["eqWorkspace"],
    eqWorkspaceState: () => {
      return undefined;
    },
    setThemeSkin: vi.fn(),
    setPowerSaver: vi.fn(),
    dismissPanel: vi.fn(),
    dockPanel: () => {
      return true;
    },
    undockPanel: vi.fn(),
    knownLayoutPanelIds: none,
    detachedPanelIds: none,
    livePanelIds: none,
    dockedPanelIds: none,
    knownSymbols: () => {
      return undefined;
    },
  };
}
