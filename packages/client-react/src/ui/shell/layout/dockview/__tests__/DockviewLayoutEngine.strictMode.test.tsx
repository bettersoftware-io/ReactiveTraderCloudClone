import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { InMemoryDockLayoutStore } from "@rtc/client-core";

import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";
import { dockviewLayoutEngineStrictModePage } from "#tests/ui/pages/DockviewLayoutEngineStrictModePage";

// jsdom has no ResizeObserver; dockview-core's own tests stub it the same way.
beforeAll(() => {
  if (typeof ResizeObserver === "undefined") {
    // biome-ignore lint/suspicious/noExplicitAny: test-only global patch
    (globalThis as any).ResizeObserver = class {
      observe(): void {}

      unobserve(): void {}

      disconnect(): void {}
    };
  }
});

afterEach(() => {
  page.unmountAll();
});

describe("DockviewLayoutEngine under StrictMode", () => {
  // StrictMode double-invokes effects: the layout effect's cleanup disposes
  // engine A and the re-run builds engine B with nothing collapsed. The bridge
  // must re-push the collapse set into B; a stale "already applied" list left
  // B un-collapsed while A's strips state still rendered the restore bar,
  // stretched across a ~97px group (the first `app/fx-collapsed-dockview`
  // golden). The witness is the blob B saves: the strip's leaf at the bar's
  // height, not the minimum.
  //
  // (A no longer flushes on dispose — nobody touched it, so its layout is
  // rebuildable; see createDockEngine's dispose. B therefore seeds rather than
  // restoring A's blob, and B's save is the only one. This test used to wait
  // for `saved.length >= 2`, counting A's flush; it now waits on the witness
  // itself, which fails both ways — B never re-collapsing saves the ~97px
  // minimum, and B never saving times out.)
  it("re-applies the seeded collapse set to the engine the double-mount rebuilds", async () => {
    const saved: string[] = [];
    const inner = new InMemoryDockLayoutStore();
    const store = {
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

    page.mountInStrictMode({ registry, store, collapsed: ["fx-analytics"] });

    // B's debounced save of its own collapse.
    await page.waitFor(
      () => {
        const last = saved[saved.length - 1];
        expect(last).toBeDefined();

        const height = leafSizeIn(
          JSON.parse(last ?? "").grid.root,
          "fx-analytics",
        );
        expect(height).not.toBeNull();
        expect(height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
          STRIP_MODEL_HEIGHT_MAX,
        );
      },
      { timeout: 3000 },
    );
  });

  // Mirrors the collapse case above for the `docked` prop: a dynamic panel
  // is reconciled into the engine at CONSTRUCTION (`dynamicPanels`, fed by
  // the re-synced `dockedRef`), not applied by a replayed intent — so engine
  // B, rebuilt from the seed (A, untouched, persisted nothing), must still
  // hold it: a `dockedRef` that failed to resync for B,
  // or a construction call that dropped `dynamicPanels`, would silently
  // lose the group instead of erroring. `groupsAttr` (not the saved blob) is
  // the witness here — membership, unlike collapse's clamped SIZE, is
  // visible in the group count as soon as B mounts.
  it("re-holds the seeded docked panel in the engine the double-mount rebuilds", () => {
    const inner = new InMemoryDockLayoutStore();
    const store = {
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

    page.mountInStrictMode({ registry, store, docked: ["panel-dyn-1"] });

    // fx's 4 seed leaves plus the reconciled dynamic panel.
    expect(page.groupsAttr()).toBe("5");
    expect(page.bodyVisible("panel-dyn-1-body")).toBe(true);
  });

  // Same rebuild trap for the layer-2 `closed` set: engine B restores from
  // A's blob (which may or may not still hold the closed panel) and the
  // bridge must re-assert the whole set — then a later prop change must
  // reopen at the seed anchor. Witnessed via the saved blob's leaves.
  it("replays the closed set into the rebuilt engine and reopens on prop change", async () => {
    const saved: string[] = [];
    const inner = new InMemoryDockLayoutStore();
    const store = {
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

    page.mountInStrictMode({ registry, store, closed: ["fx-analytics"] });
    await page.waitFor(
      () => {
        const last = saved[saved.length - 1] ?? "";
        expect(
          leafSizeIn(JSON.parse(last).grid.root, "fx-analytics"),
        ).toBeNull();
      },
      { timeout: 3000 },
    );

    page.rerender({ registry, store });
    await page.waitFor(
      () => {
        const last = saved[saved.length - 1] ?? "";
        expect(
          leafSizeIn(JSON.parse(last).grid.root, "fx-analytics"),
        ).not.toBeNull();
      },
      { timeout: 3000 },
    );
  });
});

/** The serialised MODEL size of the leaf holding `panelId`, or null. */
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

const page = dockviewLayoutEngineStrictModePage();

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
 * what a collapsed group's MODEL height serialises as. Dockview's default
 * group minimum is ~100px, so a strip that was never re-applied to a rebuilt
 * engine reads far above this. */
const STRIP_MODEL_HEIGHT_MAX = 40;
