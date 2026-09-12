import { createSignal } from "solid-js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  type DockLayoutStore,
  InMemoryDockLayoutStore,
  type PanelId,
} from "@rtc/client-core";

import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";
import { dockviewLayoutEngineDockedPage } from "#tests/ui/pages/DockviewLayoutEngineDockedPage";

// jsdom has no ResizeObserver; dockview-core's own tests stub it the same way
// (mirrors the react twin's DockviewLayoutEngine.docked.test.tsx).
beforeAll(() => {
  if (typeof ResizeObserver === "undefined") {
    (globalThis as unknown as GlobalWithResizeObserver).ResizeObserver = class {
      observe(): void {}

      unobserve(): void {}

      disconnect(): void {}
    } as unknown as ResizeObserverCtor;
  }
});

const page = dockviewLayoutEngineDockedPage();

afterEach(() => {
  page.unmountAll();
});

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
};

/** The 32px bar plus dockview's gap share for a two-child column (7 × 1/2):
 * what a collapsed group's MODEL height serialises as. Mirrors the react
 * twin's identical constant. */
const STRIP_MODEL_HEIGHT_MAX = 40;

describe("DockviewLayoutEngine docked prop", () => {
  it("holds a docked panel as its own group, rendering the registry's content through the body portal", () => {
    page.mount({
      tab: "fx",
      registry,
      store: new InMemoryDockLayoutStore(),
      maximized: null,
      collapsed: () => {
        return [];
      },
      docked: () => {
        return ["panel-dyn-1"];
      },
      layoutResets: () => {
        return 0;
      },
    });

    // fx's 4 seed leaves plus the one docked panel.
    expect(page.groupsAttr()).toBe("5");
    expect(page.bodyVisible("panel-dyn-1-body")).toBe(true);
  });

  it("removes the docked panel when the prop empties, dropping its group", async () => {
    // The SAME store instance across the whole test: this exercises the
    // DIFF effect's `removeDynamicPanel` on the still-live engine, not a
    // rebuild.
    const store = new InMemoryDockLayoutStore();
    const [docked, setDocked] = createSignal<readonly PanelId[]>([
      "panel-dyn-1",
    ]);

    page.mount({
      tab: "fx",
      registry,
      store,
      maximized: null,
      collapsed: () => {
        return [];
      },
      docked,
      layoutResets: () => {
        return 0;
      },
    });

    expect(page.groupsAttr()).toBe("5");

    setDocked([]);

    // `data-groups` only refreshes off dockview's own debounced
    // `onLayoutChange` — the removal fires it, but not synchronously.
    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("4");
    });
    expect(page.bodyVisible("panel-dyn-1-body")).toBe(false);
  });

  // Controller ruling: a workspace reset rebuilds the bridge's dockview
  // engine IN PLACE (a `layoutResets` prop bump), discarding the old
  // arrangement rather than reaching into the still-live engine. This
  // proves the discarded BLOB doesn't leak through the rebuild:
  // fx-analytics is stripped (a distinctive, persisted arrangement) before
  // the "reset", and the fresh engine — loaded from the now-cleared store —
  // must come up at the SEED shape instead, with the docked panel's
  // membership restored.
  it("rebuilds from the cleared blob on a workspace reset, discarding the old arrangement", async () => {
    const inner = new InMemoryDockLayoutStore();
    const saved: string[] = [];
    const store: DockLayoutStore = {
      load: (tab: string): string | null => {
        return inner.load(tab);
      },
      save: (tab: string, blob: string): void => {
        inner.save(tab, blob);
        saved.push(blob);
      },
      clear: (tab: string): void => {
        inner.clear(tab);
      },
    };

    const [collapsed, setCollapsed] = createSignal<readonly PanelId[]>([
      "fx-analytics",
    ]);
    const [layoutResets, setLayoutResets] = createSignal(0);

    page.mount({
      tab: "fx",
      registry,
      store,
      maximized: null,
      collapsed,
      docked: () => {
        return ["panel-dyn-1"];
      },
      layoutResets,
    });

    await page.waitFor(() => {
      expect(saved.length).toBeGreaterThan(0);
    });

    const beforeReset = leafSizeIn(
      JSON.parse(saved[saved.length - 1] ?? "{}").grid.root,
      "fx-analytics",
    );
    expect(beforeReset).not.toBeNull();
    expect(beforeReset ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      STRIP_MODEL_HEIGHT_MAX,
    );

    // What a workspace reset does: clear the persisted blob, clear
    // `collapsed` (the LayoutMachine's own reset), then bump the reset
    // counter. `docked` survives (layer-2 membership, not blob-owned) —
    // left unchanged here, deliberately, to prove the FRESH engine's own
    // construction-time reconciliation restores it rather than a replayed
    // diff effect.
    inner.clear("fx");
    saved.length = 0;
    setCollapsed([]);
    setLayoutResets((n) => {
      return n + 1;
    });

    // Seed's 4 leaves plus the re-reconciled docked panel — the fresh
    // engine's OWN shape, not whatever the discarded blob held.
    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("5");
    });

    await page.waitFor(
      () => {
        expect(saved.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );

    const afterReset = leafSizeIn(
      JSON.parse(saved[saved.length - 1] ?? "{}").grid.root,
      "fx-analytics",
    );
    expect(afterReset).not.toBeNull();
    // Relative, not an absolute pixel threshold: the docked panel's own
    // group shifts the column proportions enough that a fixed "normal"
    // floor is fragile, but a real un-stripped size is always a large
    // multiple of the stripped bar it replaced.
    expect(afterReset ?? 0).toBeGreaterThan((beforeReset ?? 0) * 2);
  });

  // The reviewer's case (mirrors the react twin): a rebuild must not leave
  // a stale strip marker behind on the panel that used to carry one.
  it("clears a stale collapsed strip across a workspace-reset rebuild", async () => {
    const store = new InMemoryDockLayoutStore();
    const [collapsed, setCollapsed] = createSignal<readonly PanelId[]>([
      "fx-analytics",
    ]);
    const [layoutResets, setLayoutResets] = createSignal(0);

    page.mount({
      tab: "fx",
      registry,
      store,
      maximized: null,
      collapsed,
      docked: () => {
        return [];
      },
      layoutResets,
    });

    expect(page.stripMarked("fx-analytics")).toBe(true);

    // What a workspace reset does: the LayoutMachine's own reset clears
    // `collapsed`, and the bridge's reset counter bumps in the same beat.
    setCollapsed([]);
    setLayoutResets((n) => {
      return n + 1;
    });

    await page.waitFor(() => {
      expect(page.stripMarked("fx-analytics")).toBe(false);
    });
  });
});

/** The serialised MODEL size of the leaf holding `panelId`, or null. Mirrors
 * the react twin's identical helper. */
// biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
function leafSizeIn(node: any, panelId: string): number | null {
  if (node.type === "leaf") {
    return (node.data?.views ?? []).includes(panelId) ? node.size : null;
  }

  // biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
  for (const child of (node.data ?? []) as any[]) {
    const hit = leafSizeIn(child, panelId);

    if (hit !== null) {
      return hit;
    }
  }

  return null;
}

/** The cast target for the ResizeObserver stub in `beforeAll` above. */
type ResizeObserverCtor = typeof ResizeObserver;

interface GlobalWithResizeObserver {
  ResizeObserver: ResizeObserverCtor;
}
