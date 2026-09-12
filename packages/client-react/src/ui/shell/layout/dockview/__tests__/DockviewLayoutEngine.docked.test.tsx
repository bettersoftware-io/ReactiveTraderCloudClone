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

/** The 32px bar plus dockview's gap share for a two-child column (7 × 1/2):
 * what a collapsed group's MODEL height serialises as. Mirrors the
 * strictMode file's identical constant — see its comment. */
const STRIP_MODEL_HEIGHT_MAX = 40;

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

  // Controller ruling (fix round 1): the reset mechanism is a KEYED remount
  // of the whole bridge, not an in-place `layoutResets` dep — App.tsx clears
  // the tab's blob then bumps the element's `key`. This proves the discarded
  // BLOB doesn't leak through the remount: fx-analytics is stripped (a
  // distinctive, persisted arrangement) before the "reset", and the fresh
  // engine — loaded from the now-cleared store — must come up at the SEED
  // shape instead, with the docked panel re-added at the right edge.
  it("remounts from the cleared blob on a workspace reset, discarding the old arrangement", async () => {
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
        key={0}
        tab="fx"
        registry={registry}
        store={store}
        maximized={null}
        collapsed={["fx-analytics"]}
        docked={["panel-dyn-1"]}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />,
    );

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

    // What App.tsx does on a workspace reset: clear the persisted blob, then
    // remount via a new `key`. `docked` survives (layer-2 membership, not
    // blob-owned); `collapsed` clears (the LayoutMachine's own reset).
    inner.clear("fx");
    saved.length = 0;

    page.rerender(
      <DockviewLayoutEngine
        key={1}
        tab="fx"
        registry={registry}
        store={store}
        maximized={null}
        collapsed={[]}
        docked={["panel-dyn-1"]}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />,
    );

    // Seed's 4 leaves plus the re-reconciled docked panel — the fresh
    // engine's OWN shape, not whatever the discarded blob held.
    expect(page.groupsAttr()).toBe("5");

    // The OLD engine's unmount flushes its own (still-stripped) state
    // synchronously on dispose — save #1 — before the NEW engine's
    // re-reconciled docked panel (itself a grid mutation) schedules its own
    // debounced save #2, which is the one that actually proves the reset
    // took: mirrors the strictMode file's identical two-save pattern.
    await page.waitFor(
      () => {
        expect(saved.length).toBeGreaterThanOrEqual(2);
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

  // The reviewer's case: a remount must not leave a stale strip marker
  // behind on the panel that used to carry one.
  it("clears a stale collapsed strip across a workspace-reset remount", () => {
    const store = new InMemoryDockLayoutStore();

    page.mount(
      <DockviewLayoutEngine
        key={0}
        tab="fx"
        registry={registry}
        store={store}
        maximized={null}
        collapsed={["fx-analytics"]}
        docked={[]}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />,
    );

    expect(page.stripMarked("fx-analytics")).toBe(true);

    page.rerender(
      <DockviewLayoutEngine
        key={1}
        tab="fx"
        registry={registry}
        store={store}
        maximized={null}
        collapsed={[]}
        docked={[]}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />,
    );

    expect(page.stripMarked("fx-analytics")).toBe(false);
  });
});

function noop(): void {}

/** The serialised MODEL size of the leaf holding `panelId`, or null. Mirrors
 * the strictMode file's identical helper — see its comment. */
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

/** The cast target for the ResizeObserver stub in `beforeAll` above — see
 * its comment for why this is declared outside the narrowed guard. */
type ResizeObserverCtor = typeof ResizeObserver;

interface GlobalWithResizeObserver {
  ResizeObserver: ResizeObserverCtor;
}
