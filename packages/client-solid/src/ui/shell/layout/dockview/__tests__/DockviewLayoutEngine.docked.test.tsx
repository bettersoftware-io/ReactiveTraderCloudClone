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

  // Fix round 1 review (Task 9 follow-up): the mount callback tags the
  // panel's dockview GROUP root with the shared `panel-<id>` testid (the one
  // `jarvis.ts`'s `waitForPanelDockedLive`/`isPanelDocked` key on
  // engine-agnostically — see that callback's own doc for why a group, not
  // a per-panel wrapper, is the tagged element) but never cleared it on
  // undock — a stale tag would linger on a group the panel no longer
  // occupies. This pins the disposer's defensive clear: after undocking, NO
  // element anywhere in the container still carries this testid.
  it("clears the docked panel's group-root panel-<id> tag on undock, not just its body", async () => {
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

    expect(page.bodyVisible("panel-panel-dyn-1")).toBe(true);

    setDocked([]);

    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("4");
    });
    expect(page.bodyVisible("panel-panel-dyn-1")).toBe(false);
  });

  // Fix round 1 (review Critical C1 + I3): the ORIGINAL version of this test
  // discriminated the reset by a collapsed strip's clamped SIZE — which
  // proves nothing, since a REPLAYED collapse on a fresh engine also clamps
  // to ~100px and would pass the same ">2x the stripped size" assertion
  // either way. It also predates the suppression guard: `dispose()`
  // unconditionally flushes one final serialize, so WITHOUT the guard, that
  // flush re-saves the OLD blob back into the store the "reset" just
  // cleared, and the fresh engine loads it straight back — discarding
  // nothing while every assertion still passed.
  //
  // This version discriminates STRUCTURALLY instead: a hand-authored blob
  // (the same schema `@rtc/layout-dockview`'s own tests hand-author, e.g.
  // `twoTabGroupLayout` in createDockEngine.test.ts) TABS fx-rates and
  // fx-blotter into one shared group — a shape the "fx" seed's OWN
  // conversion can never produce (it always separates them into different
  // leaves; see RAIL_LIKE in that same file). Then it asserts the exact
  // suppression-guard behaviour C1 fixed: nothing saved between the store
  // clear and the fresh engine's own reconciliation save shows the stacked
  // shape — a broken guard would show it in the FIRST post-reset entry (the
  // disposed old engine's flush, landing right after the clear).
  it("rebuilds from the cleared blob on a workspace reset, discarding the old arrangement", async () => {
    const inner = new InMemoryDockLayoutStore();
    inner.save("fx", stackedRatesAndBlotterBlob());
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
    const [layoutResets, setLayoutResets] = createSignal(0);

    page.mount({
      tab: "fx",
      registry,
      store,
      maximized: null,
      collapsed: () => {
        return [];
      },
      docked: () => {
        return ["panel-dyn-1"];
      },
      layoutResets,
    });

    // The stacked pair's own group, plus fx-analytics, fx-positions, and
    // the reconciled dynamic panel — NOT 5 (fx-rates and fx-blotter share
    // one group here, unlike the seed).
    expect(page.groupsAttr()).toBe("4");
    expect(sharesGroup(currentGridRoot(inner), "fx-rates", "fx-blotter")).toBe(
      true,
    );

    // What a workspace reset does: clear the persisted blob, then bump
    // `layoutResets`. `docked` survives (layer-2 membership, not
    // blob-owned) — left unchanged here, deliberately, so the ONLY thing
    // that changes is the reset counter, isolating the rebuild's own
    // construction-time `dynamicPanels` reconciliation as what restores it
    // (not a replayed diff effect, which has nothing to react to here).
    inner.clear("fx");
    saved.length = 0;
    setLayoutResets((n) => {
      return n + 1;
    });

    // Seed's 4 separate leaves plus the re-reconciled docked panel — the
    // fresh engine's OWN shape, not whatever the discarded blob held.
    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("5");
    });

    await page.waitFor(() => {
      expect(saved.length).toBeGreaterThan(0);
    });

    // The suppression guard's witness: EVERY blob saved after the clear —
    // not just the last one — must already be past the stacked shape. A
    // broken guard would let the disposed old engine's dispose-time flush
    // through as `saved[0]`, re-persisting the very shape the clear just
    // discarded.
    for (const blob of saved) {
      expect(
        sharesGroup(JSON.parse(blob).grid.root, "fx-rates", "fx-blotter"),
      ).toBe(false);
    }
  });

  // The reviewer's case (I4): the ORIGINAL version cleared `collapsed`
  // together with the reset bump, so the strip marker's disappearance
  // proved nothing about the REBUILD — a plain `expandPanel` on the still-
  // live OLD engine would have cleared it identically with no rebuild at
  // all. This version bumps `layoutResets` while `collapsed` STAYS
  // `["fx-analytics"]`: the marker reappearing on the FRESH engine is the
  // witness that `liveEngine` (Solid's re-apply mechanism, fix round 1's
  // I2 — see the component's doc) re-pushes the current collapse set onto a
  // REBUILT engine, not just a mounted one. Only THEN does clearing
  // `collapsed` (a real signal change) get exercised, proving the ordinary
  // diff path still works post-rebuild.
  it("re-applies the seeded collapse set to the engine a workspace reset rebuilds", async () => {
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

    // `collapsed` never changes value across this signal write — only the
    // reset counter does, so only the rebuild's own `liveEngine` re-apply
    // explains the marker reappearing on the fresh engine.
    setLayoutResets((n) => {
      return n + 1;
    });

    await page.waitFor(() => {
      expect(page.stripMarked("fx-analytics")).toBe(true);
    });

    setCollapsed([]);

    await page.waitFor(() => {
      expect(page.stripMarked("fx-analytics")).toBe(false);
    });
  });
});

interface DockviewPanelMeta {
  id: string;
  contentComponent: string;
  title: string;
}

function panelMeta(id: string): DockviewPanelMeta {
  return { id, contentComponent: "rtc-panel", title: id };
}

/** A REAL, valid dockview blob (the same hand-authored schema
 * `@rtc/layout-dockview`'s own tests use, e.g. `twoTabGroupLayout` in
 * createDockEngine.test.ts) with fx-rates and fx-blotter TABBED into one
 * shared group — a shape the "fx" seed's own conversion can never produce.
 * See the reset test's comment for why this replaces a collapsed-strip-size
 * discriminator. Mirrors the react twin's identical helper. */
function stackedRatesAndBlotterBlob(): string {
  return JSON.stringify({
    grid: {
      root: {
        type: "branch",
        data: [
          {
            type: "leaf",
            size: 700,
            data: {
              id: "g-stack",
              views: ["fx-rates", "fx-blotter"],
              activeView: "fx-rates",
            },
          },
          {
            type: "branch",
            size: 300,
            data: [
              {
                type: "leaf",
                size: 400,
                data: {
                  id: "g-analytics",
                  views: ["fx-analytics"],
                  activeView: "fx-analytics",
                },
              },
              {
                type: "leaf",
                size: 400,
                data: {
                  id: "g-positions",
                  views: ["fx-positions"],
                  activeView: "fx-positions",
                },
              },
            ],
          },
        ],
      },
      width: 1200,
      height: 800,
      orientation: "HORIZONTAL",
    },
    panels: {
      "fx-rates": panelMeta("fx-rates"),
      "fx-blotter": panelMeta("fx-blotter"),
      "fx-analytics": panelMeta("fx-analytics"),
      "fx-positions": panelMeta("fx-positions"),
    },
  });
}

/** The persisted "fx" blob's `grid.root`, for the pre-reset assertion that
 * the hand-authored fixture actually loaded as stacked (not silently
 * scrubbed to seed by a validation failure). Mirrors the react twin's
 * identical helper. */
// biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
function currentGridRoot(store: InMemoryDockLayoutStore): any {
  return JSON.parse(store.load("fx") ?? "{}").grid.root;
}

/** Whether panels `a` and `b` sit in the SAME leaf's `views` array anywhere
 * under `node` — the structural (not size-based) stack witness. Mirrors the
 * react twin's identical helper. */
// biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
function sharesGroup(node: any, a: string, b: string): boolean {
  if (node.type === "leaf") {
    const views: string[] = node.data?.views ?? [];

    return views.includes(a) && views.includes(b);
  }

  // biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
  return ((node.data ?? []) as any[]).some((child) => {
    return sharesGroup(child, a, b);
  });
}

/** The cast target for the ResizeObserver stub in `beforeAll` above. */
type ResizeObserverCtor = typeof ResizeObserver;

interface GlobalWithResizeObserver {
  ResizeObserver: ResizeObserverCtor;
}
