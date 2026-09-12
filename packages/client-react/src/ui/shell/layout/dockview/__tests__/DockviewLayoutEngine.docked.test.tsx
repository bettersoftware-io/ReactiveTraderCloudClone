import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  type DockLayoutStore,
  InMemoryDockLayoutStore,
} from "@rtc/client-core";

import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";
import { dockviewLayoutEngineDockedPage } from "#tests/ui/pages/DockviewLayoutEngineDockedPage";

import { DockviewLayoutEngine } from "../DockviewLayoutEngine";

// jsdom has no ResizeObserver; dockview-core's own tests stub it the same way
// (see DockviewLayoutEngine.strictMode.test.tsx).
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
        store={fakeStore()}
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
    const store = fakeStore();

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

  // Controller ruling: a live Dockview engine must be torn down and rebuilt
  // when the workspace layout resets — otherwise it survives the reset and
  // its next `onLayoutChange` re-persists the OLD arrangement right back
  // into the blob `resetWorkspaceLayout` just cleared. `layoutResets` is a
  // dep of the engine-creation effect for exactly this; the witness is a
  // FRESH `store.load` call — the diff effects never call `load`, so a
  // second call proves the engine actually tore down and rebuilt rather
  // than merely re-rendering with new props.
  it("rebuilds the engine when the workspace layout is reset", () => {
    let loadCount = 0;
    const inner = new InMemoryDockLayoutStore();
    const store = fakeStore({
      load: (tab: string): string | null => {
        loadCount += 1;
        return inner.load(tab);
      },
    });

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

    expect(loadCount).toBe(1);
    expect(page.groupsAttr()).toBe("5");

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

    expect(loadCount).toBe(2);
    // Re-seeded from the (still-empty) store, then re-reconciled with the
    // same docked list — same shape, but via a fresh engine, not the live
    // one persisting forward.
    expect(page.groupsAttr()).toBe("5");
  });
});

function noop(): void {}

interface FakeStoreOverrides {
  load?: (tab: string) => string | null;
}

function fakeStore(overrides?: FakeStoreOverrides): DockLayoutStore {
  const inner = new InMemoryDockLayoutStore();

  return {
    load: (tab: string): string | null => {
      return (overrides?.load ?? inner.load.bind(inner))(tab);
    },
    save: (tab: string, blob: string): void => {
      inner.save(tab, blob);
    },
    clear: (tab: string): void => {
      inner.clear(tab);
    },
  };
}
