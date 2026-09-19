import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  type DockLayoutStore,
  InMemoryDockLayoutStore,
  instanceIdFor,
  type LayoutPanelInstance,
  type PanelId,
} from "@rtc/client-core";

import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";
import { dockviewLayoutEngineStrictModePage } from "#tests/ui/pages/DockviewLayoutEngineStrictModePage";

// jsdom has no ResizeObserver; dockview-core's own tests stub it the same way
// (see DockviewLayoutEngine.docked.test.tsx for the typed-stub rationale).
beforeAll(() => {
  if (typeof ResizeObserver === "undefined") {
    (globalThis as unknown as GlobalWithResizeObserver).ResizeObserver = class {
      observe(): void {}

      unobserve(): void {}

      disconnect(): void {}
    } as unknown as ResizeObserverCtor;
  }
});

afterEach(() => {
  page.unmountAll();
});

describe("DockviewLayoutEngine instances prop", () => {
  it("holds a mounted instance as a live panel, rendering its registry content", () => {
    page.mount({
      registry,
      store: new InMemoryDockLayoutStore(),
      instances: [AAPL],
    });

    expect(page.engineAttribute("data-instances")).toBe("eq-chart:AAPL");
    // fx's 4 seed leaves plus the instance's own group.
    expect(page.groupsAttr()).toBe("5");
    expect(page.bodyVisible("chart-AAPL-body")).toBe(true);
  });

  it("adds a panel when an instance appears and removes it when it goes", async () => {
    const store = new InMemoryDockLayoutStore();

    page.mount({ registry, store, instances: [] });

    expect(page.groupsAttr()).toBe("4");
    expect(page.bodyVisible("chart-AAPL-body")).toBe(false);

    page.rerender({ registry, store, instances: [AAPL] });

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("5");
    });
    expect(page.bodyVisible("chart-AAPL-body")).toBe(true);
    expect(page.engineAttribute("data-instances")).toBe("eq-chart:AAPL");

    page.rerender({ registry, store, instances: [] });

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("4");
    });
    expect(page.bodyVisible("chart-AAPL-body")).toBe(false);
    expect(page.engineAttribute("data-instances")).toBe("");
  });

  it("re-holds the instance in the engine the StrictMode double-mount rebuilds", () => {
    page.mountInStrictMode({
      registry,
      store: new InMemoryDockLayoutStore(),
      instances: [AAPL],
    });

    expect(page.groupsAttr()).toBe("5");
    expect(page.bodyVisible("chart-AAPL-body")).toBe(true);
  });

  // The SECOND construction site (the `layoutResets` rebuild effect). The
  // store is deliberately NOT cleared before the bump: the blob still holds
  // the instance at the grid's LEFT edge, a spot `addDynamicPanel` (which
  // always opens at the RIGHT edge) can never produce. If the rebuild's
  // `dynamicPanels` omitted the instance, the engine's construction-time
  // reconciliation would delete it as an unlisted orphan and the diff effect
  // would re-add it on the right — so "still first" is only explained by the
  // rebuild site injecting it. The unmount's dispose flush is the witness of
  // the rebuilt engine's live arrangement.
  it("keeps the instance where the blob placed it across a layoutResets rebuild", async () => {
    const { store, inner } = createRecordingStore();
    const seed = createInstanceOnTheLeftBlob(AAPL.id);
    inner.save("fx", seed);

    page.mount({ registry, store, instances: [AAPL], layoutResets: 0 });

    expect(rootLeafIndexOf(lastGridRoot(inner), AAPL.id)).toBe(0);

    page.rerender({ registry, store, instances: [AAPL], layoutResets: 1 });

    expect(page.groupsAttr()).toBe("5");
    expect(page.bodyVisible("chart-AAPL-body")).toBe(true);

    // The rebuild built a NEW engine (its own fresh `userArranged`, per
    // #737) — arrange it before the final unmount, or dispose has nothing
    // to flush and the guard below reads the untouched seed vacuously.
    page.touchDock();
    page.unmountAll();

    // The dispose flush really wrote — the position read below is the
    // rebuilt engine's own serialisation, never the untouched seed.
    expect(inner.load("fx")).not.toBe(seed);
    expect(rootLeafIndexOf(lastGridRoot(inner), AAPL.id)).toBe(0);
  });

  it("re-reconciles the instance into the engine a cleared-blob workspace reset rebuilds", () => {
    const { store, inner } = createRecordingStore();

    page.mount({ registry, store, instances: [AAPL], layoutResets: 0 });

    inner.clear("fx");
    page.rerender({ registry, store, instances: [AAPL], layoutResets: 1 });

    expect(page.groupsAttr()).toBe("5");
    expect(page.bodyVisible("chart-AAPL-body")).toBe(true);
    expect(page.engineAttribute("data-instances")).toBe("eq-chart:AAPL");
  });

  it("removes only the instance — never a Jarvis-docked panel mounted beside it", async () => {
    const store = new InMemoryDockLayoutStore();

    page.mount({ registry, store, instances: [AAPL], docked: ["panel-dyn-1"] });

    expect(page.groupsAttr()).toBe("6");

    page.rerender({ registry, store, instances: [], docked: ["panel-dyn-1"] });

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("5");
    });
    expect(page.bodyVisible("chart-AAPL-body")).toBe(false);
    expect(page.bodyVisible("panel-dyn-1-body")).toBe(true);

    // And the other direction: undocking the Jarvis panel leaves a live
    // instance alone.
    page.rerender({
      registry,
      store,
      instances: [MSFT],
      docked: ["panel-dyn-1"],
    });

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("6");
    });

    page.rerender({ registry, store, instances: [MSFT], docked: [] });

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("5");
    });
    expect(page.bodyVisible("chart-MSFT-body")).toBe(true);
    expect(page.bodyVisible("panel-dyn-1-body")).toBe(false);
  });

  // Final-review C1: an instance must be closable from its own head. The
  // spec owns the instance list the way App's layout machine does: the
  // `onCloseInstance` slot drops the named instance and re-renders, so the
  // close control's click has to travel the real slot back into the prop
  // before the witness changes.
  it("puts a close control on an instance head only, and clicking it removes the instance", async () => {
    const store = new InMemoryDockLayoutStore();
    let instances: readonly LayoutPanelInstance[] = [AAPL];

    function removeInstance(id: PanelId): void {
      instances = instances.filter((instance) => {
        return instance.id !== id;
      });
      page.rerender({
        registry,
        store,
        instances,
        onCloseInstance: removeInstance,
      });
    }

    page.mount({ registry, store, instances, onCloseInstance: removeInstance });

    expect(page.engineAttribute("data-instances")).toBe("eq-chart:AAPL");
    expect(page.bodyVisible(`panel-${AAPL.id}-close`)).toBe(true);
    // A static head is mounted with its own controls — but no close.
    expect(page.bodyVisible("panel-fx-rates-collapse")).toBe(true);
    expect(page.bodyVisible("panel-fx-rates-close")).toBe(false);

    page.clickControl(`panel-${AAPL.id}-close`);

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("4");
    });
    expect(page.engineAttribute("data-instances")).toBe("");
    expect(page.bodyVisible("chart-AAPL-body")).toBe(false);
    expect(page.bodyVisible(`panel-${AAPL.id}-close`)).toBe(false);
  });

  // The FIRST construction site's half of the blob contract: an engine
  // persists a layout carrying the instance, and a later mount from that
  // blob keeps it — at its persisted spot (left edge), not re-added on the
  // right, which is what an unlisted id would get (deleted as an orphan by
  // the engine's reconciliation, then re-added by the diff effect).
  it("restores a persisted instance in place when remounting from its blob", () => {
    const { store, inner } = createRecordingStore();
    const seed = createInstanceOnTheLeftBlob(AAPL.id);
    inner.save("fx", seed);

    page.mount({ registry, store, instances: [AAPL] });
    // Arrange the dock before dispose: #737 only flushes a layout a pointer
    // touched, and each mount below builds its own fresh engine (its own
    // `userArranged`).
    page.touchDock();
    page.unmountAll();

    // Persisted by the engine's dispose flush, not the seed read back.
    const persistedBlob = inner.load("fx");
    expect(persistedBlob).not.toBe(seed);
    const persisted = lastGridRoot(inner);
    expect(rootLeafIndexOf(persisted, AAPL.id)).toBe(0);

    page.mount({ registry, store, instances: [AAPL] });

    expect(page.groupsAttr()).toBe("5");
    expect(page.bodyVisible("chart-AAPL-body")).toBe(true);

    page.touchDock();
    page.unmountAll();

    expect(inner.load("fx")).not.toBe(seed);
    expect(rootLeafIndexOf(lastGridRoot(inner), AAPL.id)).toBe(0);
  });
});

// R15b: a chart instance opens UNPINNED (instances share space — four pinned
// 360px columns crushed the workspace), a Jarvis dock stays pinned at its
// design width. Witnessed through the persisted blob's `rtcDesignPins`
// sidecar, once per site an instance becomes a dynamic panel — each test
// starts the instance through exactly one of them, and the Jarvis dock beside
// it proves the sidecar was written at all.
describe("DockviewLayoutEngine instance pins", () => {
  it("opens a construction-time instance unpinned, the Jarvis dock beside it pinned", () => {
    const { store, inner } = createRecordingStore();

    page.mount({ registry, store, instances: [AAPL], docked: ["panel-dyn-1"] });
    page.touchDock();
    page.unmountAll();

    expectInstanceUnpinnedBesidePinnedDock(inner);
  });

  // The `layoutResets` rebuild site: the first engine is never touched, so
  // its dispose writes nothing, and the blob is cleared before the bump — the
  // only blob afterwards is the REBUILT engine's, whose instance came from
  // the rebuild's own `dynamicPanels` (the diff effect's add no-ops on it).
  it("opens the instance unpinned in the engine a layoutResets rebuild constructs", () => {
    const { store, inner } = createRecordingStore();

    page.mount({
      registry,
      store,
      instances: [AAPL],
      docked: ["panel-dyn-1"],
      layoutResets: 0,
    });
    inner.clear("fx");
    page.rerender({
      registry,
      store,
      instances: [AAPL],
      docked: ["panel-dyn-1"],
      layoutResets: 1,
    });
    expect(page.groupsAttr()).toBe("6");

    page.touchDock();
    page.unmountAll();

    expectInstanceUnpinnedBesidePinnedDock(inner);
  });

  it("opens an instance the diff effect adds unpinned", async () => {
    const { store, inner } = createRecordingStore();

    page.mount({ registry, store, instances: [], docked: ["panel-dyn-1"] });
    page.rerender({
      registry,
      store,
      instances: [AAPL],
      docked: ["panel-dyn-1"],
    });

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("6");
    });
    page.touchDock();
    page.unmountAll();

    expectInstanceUnpinnedBesidePinnedDock(inner);
  });
});

interface RecordingStore {
  store: DockLayoutStore;
  inner: InMemoryDockLayoutStore;
}

function createRecordingStore(): RecordingStore {
  const inner = new InMemoryDockLayoutStore();
  const store: DockLayoutStore = {
    load: (tab: string): string | null => {
      return inner.load(tab);
    },
    save: (tab: string, blob: string): void => {
      inner.save(tab, blob);
    },
    clear: (tab: string): void => {
      inner.clear(tab);
    },
  };

  return { store, inner };
}

interface DockviewPanelMeta {
  id: string;
  contentComponent: string;
  title: string;
}

function panelMeta(id: string): DockviewPanelMeta {
  return { id, contentComponent: "rtc-panel", title: id };
}

function soloLeaf(groupId: string, panelId: string, size: number): object {
  return {
    type: "leaf",
    size,
    data: { id: groupId, views: [panelId], activeView: panelId },
  };
}

/** A REAL, valid dockview blob (the hand-authored schema the docked tests'
 * `createStackedRatesAndBlotterBlob` uses) with the instance's solo group as the
 * root's FIRST child — the left edge, which `addDynamicPanel` (always the
 * right edge) can never produce, so "still first" witnesses a kept-in-place
 * restore rather than a delete-then-re-add. */
function createInstanceOnTheLeftBlob(instanceId: string): string {
  return JSON.stringify({
    grid: {
      root: {
        type: "branch",
        data: [
          soloLeaf("g-instance", instanceId, 240),
          soloLeaf("g-rates", "fx-rates", 360),
          {
            type: "branch",
            size: 300,
            data: [
              soloLeaf("g-analytics", "fx-analytics", 400),
              soloLeaf("g-positions", "fx-positions", 400),
            ],
          },
          soloLeaf("g-blotter", "fx-blotter", 300),
        ],
      },
      width: 1200,
      height: 800,
      orientation: "HORIZONTAL",
    },
    panels: {
      [instanceId]: panelMeta(instanceId),
      "fx-rates": panelMeta("fx-rates"),
      "fx-blotter": panelMeta("fx-blotter"),
      "fx-analytics": panelMeta("fx-analytics"),
      "fx-positions": panelMeta("fx-positions"),
    },
  });
}

/** The R15b split in the persisted blob: the Jarvis dock pinned, the chart
 * instance not (the FX seed's own rail pin rides along, so membership — not
 * equality — is the assertion). */
function expectInstanceUnpinnedBesidePinnedDock(
  store: InMemoryDockLayoutStore,
): void {
  const pinned = pinnedIdsOf(store);

  expect(pinned).toContain("panel-dyn-1");
  expect(pinned).not.toContain(AAPL.id);
}

/** Every panel id the persisted "fx" blob's `rtcDesignPins` sidecar pins.
 * Throws when nothing was persisted — an absent blob must never read as
 * "saved, and nothing pinned". */
function pinnedIdsOf(store: InMemoryDockLayoutStore): readonly string[] {
  const blob = store.load("fx");

  if (blob === null) {
    throw new Error("no fx layout was persisted");
  }

  const pins = (JSON.parse(blob).rtcDesignPins ?? []) as readonly {
    panelIds: readonly string[];
  }[];

  return pins.flatMap((pin) => {
    return pin.panelIds;
  });
}

/** The persisted "fx" blob's `grid.root`. */
// biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
function lastGridRoot(store: InMemoryDockLayoutStore): any {
  return JSON.parse(store.load("fx") ?? "{}").grid.root;
}

/** The index, among the root branch's direct children, of the solo leaf
 * holding `panelId` — or -1 when no direct child holds it. */
// biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
function rootLeafIndexOf(root: any, panelId: string): number {
  // biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
  return ((root.data ?? []) as any[]).findIndex((child) => {
    return (
      child.type === "leaf" &&
      ((child.data?.views ?? []) as string[]).includes(panelId)
    );
  });
}

/** The cast target for the ResizeObserver stub in `beforeAll` above. */
type ResizeObserverCtor = typeof ResizeObserver;

interface GlobalWithResizeObserver {
  ResizeObserver: ResizeObserverCtor;
}

const page = dockviewLayoutEngineStrictModePage();

const AAPL: LayoutPanelInstance = {
  id: instanceIdFor("eq-chart", "AAPL"),
  kind: "eq-chart",
  symbol: "AAPL",
};

const MSFT: LayoutPanelInstance = {
  id: instanceIdFor("eq-chart", "MSFT"),
  kind: "eq-chart",
  symbol: "MSFT",
};

// The instance entries stand in for `instanceRegistryFor`'s pinned
// ChartPanel (covered by appPanelRegistry.test.tsx) — what THIS bridge owns
// is portalling whatever the registry holds for an instance id into the
// panel dockview opened for it.
const registry: PanelRegistry = {
  "fx-rates": () => {
    return <div>RATES</div>;
  },
  "fx-analytics": () => {
    return <div>ANALYTICS</div>;
  },
  "fx-positions": () => {
    return <div>POSITIONS</div>;
  },
  "fx-blotter": () => {
    return <div>BLOTTER</div>;
  },
  "panel-dyn-1": () => {
    return <div data-testid="panel-dyn-1-body">DYN</div>;
  },
  [AAPL.id]: () => {
    return <div data-testid="chart-AAPL-body">AAPL CHART</div>;
  },
  [MSFT.id]: () => {
    return <div data-testid="chart-MSFT-body">MSFT CHART</div>;
  },
};
