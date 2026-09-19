import { createSignal } from "solid-js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  type DockLayoutStore,
  InMemoryDockLayoutStore,
  instanceIdFor,
  type LayoutPanelInstance,
  type PanelId,
} from "@rtc/client-core";

import {
  type PanelRegistry,
  reuseRegistryEntries,
} from "#/ui/shell/layout/engine/panelRegistry";
import { dockviewLayoutEngineBridgePage } from "#tests/ui/pages/DockviewLayoutEngineBridgePage";

// jsdom has no ResizeObserver; dockview-core's own tests stub it the same way
// (mirrors the react twin's DockviewLayoutEngine.instances.test.tsx).
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
    const [instances, setInstances] = createSignal<
      readonly LayoutPanelInstance[]
    >([]);

    page.mount({ registry, store: new InMemoryDockLayoutStore(), instances });

    expect(page.groupsAttr()).toBe("4");
    expect(page.bodyVisible("chart-AAPL-body")).toBe(false);

    setInstances([AAPL]);

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("5");
    });
    expect(page.bodyVisible("chart-AAPL-body")).toBe(true);
    expect(page.engineAttribute("data-instances")).toBe("eq-chart:AAPL");

    setInstances([]);

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("4");
    });
    expect(page.bodyVisible("chart-AAPL-body")).toBe(false);
    expect(page.engineAttribute("data-instances")).toBe("");
  });

  // The rebuild path (`layoutResets` → `buildEngine()`). The store is
  // deliberately NOT cleared before the bump: the blob still holds the
  // instance at the grid's LEFT edge, a spot `addDynamicPanel` (always the
  // RIGHT edge) can never produce. If the rebuilt engine's `dynamicPanels`
  // omitted the instance, its construction-time reconciliation would delete
  // it as an unlisted orphan and the diff effect would re-add it on the
  // right — so "still first" is only explained by construction injecting it.
  // The unmount's dispose flush is the witness of the live arrangement.
  it("keeps the instance where the blob placed it across a layoutResets rebuild", async () => {
    const { store, inner } = createRecordingStore();
    const seed = createInstanceOnTheLeftBlob(AAPL.id);
    inner.save("fx", seed);
    const [layoutResets, setLayoutResets] = createSignal(0);

    page.mount({ registry, store, instances: [AAPL], layoutResets });

    expect(rootLeafIndexOf(lastGridRoot(inner), AAPL.id)).toBe(0);

    setLayoutResets((n) => {
      return n + 1;
    });

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("5");
    });
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

  it("re-reconciles the instance into the engine a cleared-blob workspace reset rebuilds", async () => {
    const { store, inner } = createRecordingStore();
    const [layoutResets, setLayoutResets] = createSignal(0);

    page.mount({ registry, store, instances: [AAPL], layoutResets });

    inner.clear("fx");
    setLayoutResets((n) => {
      return n + 1;
    });

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("5");
    });
    expect(page.bodyVisible("chart-AAPL-body")).toBe(true);
    expect(page.engineAttribute("data-instances")).toBe("eq-chart:AAPL");
  });

  it("removes only the instance — never a Jarvis-docked panel mounted beside it", async () => {
    const [instances, setInstances] = createSignal<
      readonly LayoutPanelInstance[]
    >([AAPL]);

    const [docked, setDocked] = createSignal<readonly PanelId[]>([
      "panel-dyn-1",
    ]);

    page.mount({
      registry,
      store: new InMemoryDockLayoutStore(),
      instances,
      docked,
    });

    expect(page.groupsAttr()).toBe("6");

    setInstances([]);

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("5");
    });
    expect(page.bodyVisible("chart-AAPL-body")).toBe(false);
    expect(page.bodyVisible("panel-dyn-1-body")).toBe(true);

    // And the other direction: undocking the Jarvis panel leaves a live
    // instance alone.
    setInstances([MSFT]);

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("6");
    });

    setDocked([]);

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("5");
    });
    expect(page.bodyVisible("chart-MSFT-body")).toBe(true);
    expect(page.bodyVisible("panel-dyn-1-body")).toBe(false);
  });

  // Final-review C1: an instance must be closable from its own head. The
  // signal stands in for the layout machine's instance list, and the close
  // control's click has to travel the real `onCloseInstance` slot back into
  // the prop before the witness changes.
  it("puts a close control on an instance head only, and clicking it removes the instance", async () => {
    const [instances, setInstances] = createSignal<
      readonly LayoutPanelInstance[]
    >([AAPL]);

    function removeInstance(id: PanelId): void {
      setInstances((previous) => {
        return previous.filter((instance) => {
          return instance.id !== id;
        });
      });
    }

    page.mount({
      registry,
      store: new InMemoryDockLayoutStore(),
      instances,
      onCloseInstance: removeInstance,
    });

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

  // The actions slot must not remount when the instance set changes (the
  // close control's presence is a reactive prop, not a new slot): a static
  // head's control node survives a sibling instance opening.
  it("keeps a static head's control node when a sibling instance opens", async () => {
    const [instances, setInstances] = createSignal<
      readonly LayoutPanelInstance[]
    >([]);

    page.mount({ registry, store: new InMemoryDockLayoutStore(), instances });

    const collapseBefore = page.bodyElement("panel-fx-rates-collapse");
    expect(collapseBefore).not.toBeNull();

    setInstances([AAPL]);

    await page.waitFor(() => {
      expect(page.bodyVisible(`panel-${AAPL.id}-close`)).toBe(true);
    });
    expect(page.bodyElement("panel-fx-rates-collapse")).toBe(collapseBefore);
  });

  // The mount-time half of the blob contract: an engine persists a layout
  // carrying the instance, and a later mount from that blob keeps it — at
  // its persisted spot (left edge), not re-added on the right, which is
  // what an unlisted id would get (deleted as an orphan by the engine's
  // reconciliation, then re-added by the diff effect).
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
    expect(inner.load("fx")).not.toBe(seed);
    expect(rootLeafIndexOf(lastGridRoot(inner), AAPL.id)).toBe(0);

    page.mount({ registry, store, instances: [AAPL] });

    expect(page.groupsAttr()).toBe("5");
    expect(page.bodyVisible("chart-AAPL-body")).toBe(true);

    page.touchDock();
    page.unmountAll();

    expect(inner.load("fx")).not.toBe(seed);
    expect(rootLeafIndexOf(lastGridRoot(inner), AAPL.id)).toBe(0);
  });

  // Fix round 1 (review IMPORTANT): opening a chart instance used to hand
  // the bridge a registry of fresh identity, and the body slot's tracked
  // `props.registry[id]?.()` re-ran EVERY mounted panel's factory — a new
  // DOM node (and fresh stream subscriptions) for panels that never
  // changed. The registry here is composed the way App.tsx composes the
  // Dockview one: a new object per read, the static entries spread in, and
  // the instance slice rebuilt with fresh closures per call but passed
  // through `reuseRegistryEntries`. Same NODE (not just same text) for the
  // static panel and the sibling instance is the witness.
  it("keeps every mounted panel body's DOM node when a sibling instance opens", async () => {
    const [instances, setInstances] = createSignal<
      readonly LayoutPanelInstance[]
    >([AAPL]);
    let instanceSlice: PanelRegistry = {};

    function createComposedRegistry(): PanelRegistry {
      instanceSlice = reuseRegistryEntries(
        instanceSlice,
        createStubInstanceRegistryFor(instances()),
      );

      return { ...registry, ...instanceSlice };
    }

    page.mount({
      registry: createComposedRegistry,
      store: new InMemoryDockLayoutStore(),
      instances,
    });

    const aaplBefore = page.bodyElement("instance-AAPL-body");
    const ratesBefore = page.bodyElement("fx-rates-body");
    expect(aaplBefore).not.toBeNull();
    expect(ratesBefore).not.toBeNull();

    setInstances([AAPL, MSFT]);

    await page.waitFor(() => {
      expect(page.bodyVisible("instance-MSFT-body")).toBe(true);
    });
    expect(page.bodyElement("fx-rates-body")).toBe(ratesBefore);
    expect(page.bodyElement("instance-AAPL-body")).toBe(aaplBefore);
  });
});

// R15b: a chart instance opens UNPINNED (instances share space — four pinned
// 360px columns crushed the workspace), a Jarvis dock stays pinned at its
// design width. Witnessed through the persisted blob's `rtcDesignPins`
// sidecar, once per way an instance becomes a dynamic panel — `buildEngine`'s
// `dynamicPanels` (at mount and on a `layoutResets` rebuild) and the instance
// diff effect — with the Jarvis dock beside it proving the sidecar was
// written at all.
describe("DockviewLayoutEngine instance pins", () => {
  it("opens a construction-time instance unpinned, the Jarvis dock beside it pinned", () => {
    const { store, inner } = createRecordingStore();

    page.mount({ registry, store, instances: [AAPL], docked: ["panel-dyn-1"] });
    page.touchDock();
    page.unmountAll();

    expectInstanceUnpinnedBesidePinnedDock(inner);
  });

  // The first engine is never touched, so its dispose writes nothing, and
  // the blob is cleared before the bump — the only blob afterwards is the
  // REBUILT engine's, whose instance came from `buildEngine`'s own
  // `dynamicPanels` (the diff effect's add no-ops on it).
  it("opens the instance unpinned in the engine a layoutResets rebuild constructs", async () => {
    const { store, inner } = createRecordingStore();
    const [layoutResets, setLayoutResets] = createSignal(0);

    page.mount({
      registry,
      store,
      instances: [AAPL],
      docked: ["panel-dyn-1"],
      layoutResets,
    });
    inner.clear("fx");
    setLayoutResets((n) => {
      return n + 1;
    });

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("6");
    });
    page.touchDock();
    page.unmountAll();

    expectInstanceUnpinnedBesidePinnedDock(inner);
  });

  it("opens an instance the diff effect adds unpinned", async () => {
    const { store, inner } = createRecordingStore();
    const [instances, setInstances] = createSignal<
      readonly LayoutPanelInstance[]
    >([]);

    page.mount({ registry, store, instances, docked: ["panel-dyn-1"] });
    setInstances([AAPL]);

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("6");
    });
    page.touchDock();
    page.unmountAll();

    expectInstanceUnpinnedBesidePinnedDock(inner);
  });
});

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

function noop(): void {}

/** A stand-in for `instanceRegistryFor` with its exact identity behaviour —
 * a FRESH closure per instance on every call — minus the real ChartPanel
 * (which needs the whole ViewModel). */
function createStubInstanceRegistryFor(
  instances: readonly LayoutPanelInstance[],
): PanelRegistry {
  const entries = instances.map((instance) => {
    return [
      instance.id,
      () => {
        return (
          <div data-testid={`instance-${instance.symbol}-body`}>
            {instance.symbol}
          </div>
        );
      },
    ] as const;
  });

  return Object.fromEntries(entries);
}

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

/** A REAL, valid dockview blob with the instance's solo group as the root's
 * FIRST child — the left edge, which `addDynamicPanel` (always the right
 * edge) can never produce. Mirrors the react twin's identical helper. */
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

const page = dockviewLayoutEngineBridgePage();

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
// ChartPanel (covered by appPanelRegistry.test.ts) — what THIS bridge owns is
// portalling whatever the registry holds for an instance id into the panel
// dockview opened for it.
const registry: PanelRegistry = {
  "fx-rates": () => {
    return <div data-testid="fx-rates-body">RATES</div>;
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
