import { StrictMode } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { InMemoryDockLayoutStore } from "@rtc/client-core";

import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";
import { dockviewLayoutEngineStrictModePage } from "#tests/ui/pages/DockviewLayoutEngineStrictModePage";

import { DockviewLayoutEngine } from "../DockviewLayoutEngine";

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

const page = dockviewLayoutEngineStrictModePage();

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
 * what a collapsed group's MODEL height serialises as. Dockview's default
 * group minimum is ~100px, so a strip that was never re-applied to a rebuilt
 * engine reads far above this. */
const STRIP_MODEL_HEIGHT_MAX = 40;

describe("DockviewLayoutEngine under StrictMode", () => {
  // StrictMode double-invokes effects: the layout effect's cleanup disposes
  // engine A — whose dispose flushes its STRIPPED geometry into the store —
  // and the re-run builds engine B from that blob, with the strip's group at
  // dockview's minimum height and nothing collapsed. The bridge must re-push
  // the collapse set into B; a stale "already applied" list left B
  // un-collapsed while A's strips state still rendered the restore bar,
  // stretched across a ~97px group (the first `app/fx-collapsed-dockview`
  // golden). The witness is the blob B saves: the strip's leaf at the bar's
  // height, not the minimum.
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

    page.mount(
      <StrictMode>
        <DockviewLayoutEngine
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
        />
      </StrictMode>,
    );

    // A's dispose-time flush is save #1 (synchronous); B's debounced save of
    // its own collapse is what we wait for.
    await page.waitFor(
      () => {
        expect(saved.length).toBeGreaterThanOrEqual(2);
      },
      { timeout: 3000 },
    );

    const last = saved[saved.length - 1] ?? "";
    const height = leafSizeIn(JSON.parse(last).grid.root, "fx-analytics");
    expect(height).not.toBeNull();
    expect(height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      STRIP_MODEL_HEIGHT_MAX,
    );
  });

  // Mirrors the collapse case above for the `docked` prop: a dynamic panel
  // is reconciled into the engine at CONSTRUCTION (`dynamicPanels`, fed by
  // the re-synced `dockedRef`), not applied by a replayed intent — so engine
  // B, rebuilt from A's flushed blob (which already carries the dynamic
  // panel), must still hold it: a `dockedRef` that failed to resync for B,
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

    page.mount(
      <StrictMode>
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
        />
      </StrictMode>,
    );

    // fx's 4 seed leaves plus the reconciled dynamic panel.
    expect(page.groupsAttr()).toBe("5");
    expect(page.bodyVisible("panel-dyn-1-body")).toBe(true);
  });
});

function noop(): void {}

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
