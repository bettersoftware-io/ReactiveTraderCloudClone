import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  type DockLayoutStore,
  InMemoryDockLayoutStore,
} from "@rtc/client-core";

import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";
import { dockviewLayoutEngineDockedPage } from "#tests/ui/pages/DockviewLayoutEngineDockedPage";

import { DockviewLayoutEngine } from "../DockviewLayoutEngine";

// jsdom has no ResizeObserver; dockview-core's own tests stub it the same way
// (see DockviewLayoutEngine.strictMode.test.tsx). `ResizeObserverCtor` /
// `GlobalWithResizeObserver` (below, with the file's other helpers) exist
// because referencing `typeof ResizeObserver` INSIDE a `typeof x ===
// "undefined"` branch narrows it to `never` (TS assumes an ambiently
// declared class is always defined) — types have no runtime hoisting
// concern, so declaring them after the tests is safe.
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
    page.mount(
      <DockviewLayoutEngine
        tab="fx"
        registry={registry}
        store={new InMemoryDockLayoutStore()}
        maximized={null}
        collapsed={[]}
        docked={["panel-dyn-1"]}
        layoutResets={0}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />,
    );

    // fx's 4 seed leaves plus the one docked panel.
    expect(page.groupsAttr()).toBe("5");
    expect(page.bodyVisible("panel-dyn-1-body")).toBe(true);
  });

  it("removes the docked panel when the prop empties, dropping its group", async () => {
    // The SAME store instance across both renders: this exercises the
    // DIFF effect's `removeDynamicPanel` on the still-live engine, not a
    // rebuild (which `store` changing would also trigger, confounding it).
    const store = new InMemoryDockLayoutStore();

    page.mount(
      <DockviewLayoutEngine
        tab="fx"
        registry={registry}
        store={store}
        maximized={null}
        collapsed={[]}
        docked={["panel-dyn-1"]}
        layoutResets={0}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />,
    );

    expect(page.groupsAttr()).toBe("5");

    page.rerender(
      <DockviewLayoutEngine
        tab="fx"
        registry={registry}
        store={store}
        maximized={null}
        collapsed={[]}
        docked={[]}
        layoutResets={0}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />,
    );

    // `data-groups` only refreshes off dockview's own debounced
    // `onLayoutChange` — the removal fires it, but not synchronously.
    await page.waitFor(() => {
      expect(page.groupsAttr()).toBe("4");
    });
    expect(page.bodyVisible("panel-dyn-1-body")).toBe(false);
  });

  // Fix round 1 (review Critical C1 + I3): the ORIGINAL version of this test
  // discriminated the reset by a collapsed strip's clamped SIZE — which
  // proves nothing, since a REPLAYED collapse on a fresh engine also clamps
  // to ~100px and would pass the same ">2x the stripped size" assertion
  // either way. It also predates the suppression guard: `dispose()`
  // unconditionally flushes one final serialize, so WITHOUT the guard, that
  // flush re-saves the OLD blob back into the store `resetWorkspaceLayout()`
  // just cleared, and the fresh engine loads it straight back — discarding
  // nothing while every assertion still passed.
  //
  // This version discriminates STRUCTURALLY instead: a hand-authored blob
  // (the same schema @rtc/layout-dockview's own tests hand-author, e.g.
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

    page.mount(
      <DockviewLayoutEngine
        tab="fx"
        registry={registry}
        store={store}
        maximized={null}
        collapsed={[]}
        docked={["panel-dyn-1"]}
        layoutResets={0}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />,
    );

    // The stacked pair's own group, plus fx-analytics, fx-positions, and
    // the reconciled dynamic panel — NOT 5 (fx-rates and fx-blotter share
    // one group here, unlike the seed).
    expect(page.groupsAttr()).toBe("4");
    expect(sharesGroup(currentGridRoot(inner), "fx-rates", "fx-blotter")).toBe(
      true,
    );

    // What App.tsx does on a workspace reset: clear the persisted blob,
    // then bump `layoutResets`. `docked` survives (layer-2 membership, not
    // blob-owned) — left unchanged here, deliberately, so the ONLY thing
    // that changes is the reset counter, isolating the rebuild's own
    // construction-time `dynamicPanels` reconciliation as what restores it
    // (not a replayed diff effect, which has nothing to react to here).
    inner.clear("fx");
    saved.length = 0;

    page.rerender(
      <DockviewLayoutEngine
        tab="fx"
        registry={registry}
        store={store}
        maximized={null}
        collapsed={[]}
        docked={["panel-dyn-1"]}
        layoutResets={1}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />,
    );

    // Seed's 4 separate leaves plus the re-reconciled docked panel — the
    // fresh engine's OWN shape, not whatever the discarded blob held.
    expect(page.groupsAttr()).toBe("5");

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
  // witness that `liveEngine` (React's re-apply mechanism — see the
  // component's doc) re-pushes the current collapse set onto a REBUILT
  // engine, not just a mounted one. Only THEN does clearing `collapsed`
  // (a real prop change) get exercised, proving the ordinary diff path
  // still works post-rebuild.
  it("re-applies the seeded collapse set to the engine a workspace reset rebuilds", async () => {
    const store = new InMemoryDockLayoutStore();

    page.mount(
      <DockviewLayoutEngine
        tab="fx"
        registry={registry}
        store={store}
        maximized={null}
        collapsed={["fx-analytics"]}
        docked={[]}
        layoutResets={0}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />,
    );

    expect(page.stripMarked("fx-analytics")).toBe(true);

    page.rerender(
      <DockviewLayoutEngine
        tab="fx"
        registry={registry}
        store={store}
        maximized={null}
        collapsed={["fx-analytics"]}
        docked={[]}
        layoutResets={1}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />,
    );

    // The fresh engine re-collapsed fx-analytics on its own — `collapsed`
    // never changed value across this render, so only the rebuild's own
    // `liveEngine` re-apply explains this.
    await page.waitFor(() => {
      expect(page.stripMarked("fx-analytics")).toBe(true);
    });

    page.rerender(
      <DockviewLayoutEngine
        tab="fx"
        registry={registry}
        store={store}
        maximized={null}
        collapsed={[]}
        docked={[]}
        layoutResets={1}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />,
    );

    expect(page.stripMarked("fx-analytics")).toBe(false);
  });

  // NEW-1 (fix round 2, Critical): the mount effect's cleanup used to
  // dispose the `const engine` it captured at CONSTRUCTION time — after a
  // reset, that's the STALE, already-disposed pre-reset instance, not the
  // live post-reset one. Disposing it a SECOND time serialised an
  // already-torn-down dockview api, which emits a panel-less blob
  // (`"views":[]` everywhere); since the SUPPRESSION GUARD only holds
  // during the reset's own window (long closed by the time unmount
  // happens), that empty blob landed in the store — permanently emptying
  // the tab — while the ACTUALLY live engine leaked, never disposed at all.
  it("disposes the current (post-reset) engine on unmount, not the stale pre-reset one", async () => {
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

    page.mount(
      <DockviewLayoutEngine
        tab="fx"
        registry={registry}
        store={store}
        maximized={null}
        collapsed={[]}
        docked={["panel-dyn-1"]}
        layoutResets={0}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />,
    );

    page.rerender(
      <DockviewLayoutEngine
        tab="fx"
        registry={registry}
        store={store}
        maximized={null}
        collapsed={[]}
        docked={["panel-dyn-1"]}
        layoutResets={1}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />,
    );

    // Let the rebuilt (post-reset) engine's own reconciliation save land
    // before unmounting — the bug this guards is specific to what UNMOUNT
    // does with the now-stale PRE-reset engine, not the reset itself.
    await page.waitFor(() => {
      expect(saved.length).toBeGreaterThan(0);
    });

    const savedBeforeUnmount = saved.length;

    page.unmountAll();

    // Whatever the unmount's own final flush wrote (zero entries, if the
    // live engine had nothing pending; one, its final serialize) must still
    // carry real panel views — no post-unmount save resurrects the stale
    // pre-reset shape or empties the tab.
    const savedDuringUnmount = saved.slice(savedBeforeUnmount);

    for (const blob of savedDuringUnmount) {
      expect(blob).not.toContain('"views":[]');
      expect(everyLeafHasViews(JSON.parse(blob).grid.root)).toBe(true);
    }

    // The tab's LAST word, whichever save wrote it, must still be the real
    // arrangement.
    const last = saved[saved.length - 1] ?? "{}";
    expect(last).not.toContain('"views":[]');
    expect(everyLeafHasViews(JSON.parse(last).grid.root)).toBe(true);
  });

  // NEW-2 (fix round 2, Important): `workspaceLayoutResets$` is
  // session-global and monotonic, and this component remounts per tab (via
  // App's `key={activeTab}`) — so once ANY reset has ever happened in the
  // session, `layoutResets` is already nonzero for every LATER tab mount.
  // The rebuild effect used to fire whenever `layoutResets !== 0`,
  // regardless of whether THIS instance had ever applied it — so a mount
  // with an already-nonzero counter tore the engine down and rebuilt it a
  // SECOND time on the very first commit (a redundant blank-frame flash,
  // and it also arms NEW-1's cleanup hazard the moment this instance
  // eventually unmounts).
  it("builds the engine exactly once on mount when layoutResets is already nonzero", () => {
    const inner = new InMemoryDockLayoutStore();
    const saved: string[] = [];
    let loads = 0;
    const store: DockLayoutStore = {
      load: (tab: string): string | null => {
        loads += 1;

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

    page.mount(
      <DockviewLayoutEngine
        tab="fx"
        registry={registry}
        store={store}
        maximized={null}
        collapsed={[]}
        docked={[]}
        layoutResets={3}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />,
    );

    expect(loads).toBe(1);
    expect(saved).toEqual([]);
    // fx's 4 seed leaves — present immediately, from the ONE construction.
    expect(page.groupsAttr()).toBe("4");
  });
});

function noop(): void {}

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
 * discriminator. */
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
 * scrubbed to seed by a validation failure). */
// biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
function currentGridRoot(store: InMemoryDockLayoutStore): any {
  return JSON.parse(store.load("fx") ?? "{}").grid.root;
}

/** Whether panels `a` and `b` sit in the SAME leaf's `views` array anywhere
 * under `node` — the structural (not size-based) stack witness. */
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

/** Whether EVERY leaf under `node` still carries at least one panel view —
 * the NEW-1 witness: a double-dispose's panel-less serialize produces a
 * grid whose leaves carry `"views":[]`, not a grid missing leaves
 * entirely, so this must walk every leaf rather than just checking the
 * root shape survived. */
// biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
function everyLeafHasViews(node: any): boolean {
  if (node.type === "leaf") {
    const views: unknown[] = node.data?.views ?? [];

    return views.length > 0;
  }

  // biome-ignore lint/suspicious/noExplicitAny: walking dockview's own JSON shape
  return ((node.data ?? []) as any[]).every((child) => {
    return everyLeafHasViews(child);
  });
}

/** The cast target for the ResizeObserver stub in `beforeAll` above — see
 * its comment for why this is declared outside the narrowed guard. */
type ResizeObserverCtor = typeof ResizeObserver;

interface GlobalWithResizeObserver {
  ResizeObserver: ResizeObserverCtor;
}
