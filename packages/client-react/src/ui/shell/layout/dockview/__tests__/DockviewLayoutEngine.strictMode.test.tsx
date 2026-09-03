import { StrictMode } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { InMemoryDockLayoutStore } from "@rtc/client-core";

import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";
import {
  cleanup,
  render,
  waitFor,
} from "#tests/ui/pages/DockviewLayoutEngineStrictModePage";

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

afterEach(cleanup);

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
    };

    render(
      <StrictMode>
        <DockviewLayoutEngine
          tab="fx"
          registry={registry}
          store={store}
          maximized={null}
          collapsed={["fx-analytics"]}
          onMaximize={noop}
          onRestore={noop}
          onCollapse={noop}
          onExpand={noop}
        />
      </StrictMode>,
    );

    // A's dispose-time flush is save #1 (synchronous); B's debounced save of
    // its own collapse is what we wait for.
    await waitFor(
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
