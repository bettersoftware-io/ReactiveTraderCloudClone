import { createSignal } from "solid-js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  type DockLayoutStore,
  InMemoryDockLayoutStore,
  instanceIdFor,
  type LayoutPanelInstance,
  type PanelId,
} from "@rtc/client-core";

import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";
import { dockviewLayoutEngineBridgePage } from "#tests/ui/pages/DockviewLayoutEngineBridgePage";

import { DockviewLayoutEngine } from "../DockviewLayoutEngine";

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

const page = dockviewLayoutEngineBridgePage();

afterEach(() => {
  page.unmountAll();
});

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

describe("DockviewLayoutEngine instances prop", () => {
  it("holds a mounted instance as a live panel, rendering its registry content", () => {
    mountEngine({ store: new InMemoryDockLayoutStore(), instances: [AAPL] });

    expect(page.engineAttribute("data-instances")).toBe("eq-chart:AAPL");
    // fx's 4 seed leaves plus the instance's own group.
    expect(page.groupsAttr()).toBe("5");
    expect(page.bodyVisible("chart-AAPL-body")).toBe(true);
  });

  it("adds a panel when an instance appears and removes it when it goes", async () => {
    const [instances, setInstances] = createSignal<
      readonly LayoutPanelInstance[]
    >([]);

    mountEngine({ store: new InMemoryDockLayoutStore(), instances });

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
    const { store, inner } = recordingStore();
    inner.save("fx", instanceOnTheLeftBlob(AAPL.id));
    const [layoutResets, setLayoutResets] = createSignal(0);

    mountEngine({ store, instances: [AAPL], layoutResets });

    expect(rootLeafIndexOf(lastGridRoot(inner), AAPL.id)).toBe(0);

    setLayoutResets((n) => {
      return n + 1;
    });

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("5");
    });
    expect(page.bodyVisible("chart-AAPL-body")).toBe(true);

    page.unmountAll();

    expect(rootLeafIndexOf(lastGridRoot(inner), AAPL.id)).toBe(0);
  });

  it("re-reconciles the instance into the engine a cleared-blob workspace reset rebuilds", async () => {
    const { store, inner } = recordingStore();
    const [layoutResets, setLayoutResets] = createSignal(0);

    mountEngine({ store, instances: [AAPL], layoutResets });

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

    mountEngine({ store: new InMemoryDockLayoutStore(), instances, docked });

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

  // The mount-time half of the blob contract: an engine persists a layout
  // carrying the instance, and a later mount from that blob keeps it — at
  // its persisted spot (left edge), not re-added on the right, which is
  // what an unlisted id would get (deleted as an orphan by the engine's
  // reconciliation, then re-added by the diff effect).
  it("restores a persisted instance in place when remounting from its blob", () => {
    const { store, inner } = recordingStore();
    inner.save("fx", instanceOnTheLeftBlob(AAPL.id));

    mountEngine({ store, instances: [AAPL] });
    page.unmountAll();

    expect(rootLeafIndexOf(lastGridRoot(inner), AAPL.id)).toBe(0);

    mountEngine({ store, instances: [AAPL] });

    expect(page.groupsAttr()).toBe("5");
    expect(page.bodyVisible("chart-AAPL-body")).toBe(true);

    page.unmountAll();

    expect(rootLeafIndexOf(lastGridRoot(inner), AAPL.id)).toBe(0);
  });
});

interface EngineProps {
  store: DockLayoutStore;
  instances:
    | readonly LayoutPanelInstance[]
    | (() => readonly LayoutPanelInstance[]);
  docked?: () => readonly PanelId[];
  layoutResets?: () => number;
}

/** Mounts once, dereferencing every live prop INSIDE the JSX so Solid's
 * compiler wraps each in a reactive getter (see the docked page's doc). */
function mountEngine(props: EngineProps): void {
  function instances(): readonly LayoutPanelInstance[] {
    return typeof props.instances === "function"
      ? props.instances()
      : props.instances;
  }

  page.mount(() => {
    return (
      <DockviewLayoutEngine
        tab="fx"
        registry={registry}
        store={props.store}
        maximized={null}
        collapsed={[]}
        closed={[]}
        docked={props.docked?.() ?? []}
        instances={instances()}
        layoutResets={props.layoutResets?.() ?? 0}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />
    );
  });
}

function noop(): void {}

interface RecordingStore {
  store: DockLayoutStore;
  inner: InMemoryDockLayoutStore;
}

function recordingStore(): RecordingStore {
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
function instanceOnTheLeftBlob(instanceId: string): string {
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
