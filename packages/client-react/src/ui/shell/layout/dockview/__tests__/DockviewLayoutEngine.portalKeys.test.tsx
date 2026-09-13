import { beforeAll, describe, expect, it, vi } from "vitest";

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

const capturedHooks = vi.hoisted(() => {
  return {
    mountTab: null as ((id: string, el: HTMLElement) => () => void) | null,
  };
});

// Passthrough capture of the bridge's `panels` hooks: the engine behaves
// normally, but the test gets dockview's side of `mountTab` — the call a
// pop-out transaction makes for the moved tab BEFORE the old element's
// dispose runs (the transient the duplicate-key warning came from; jsdom
// cannot open the real popout window, so the overlap is driven directly).
vi.mock("@rtc/layout-dockview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@rtc/layout-dockview")>();

  return {
    ...actual,
    createDockEngine: (
      ...args: Parameters<typeof actual.createDockEngine>
    ): ReturnType<typeof actual.createDockEngine> => {
      capturedHooks.mountTab = args[0].panels.mountTab ?? null;

      return actual.createDockEngine(...args);
    },
  };
});

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
};

describe("dockview portal keys", () => {
  it("keys slot portals per mount, so a popout/remount transaction never duplicates keys", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new InMemoryDockLayoutStore();

    page.mount(
      <DockviewLayoutEngine
        tab="fx"
        registry={registry}
        store={store}
        maximized={null}
        collapsed={[]}
        closed={[]}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />,
    );

    const mountTab = capturedHooks.mountTab;
    expect(mountTab).not.toBeNull();

    // The pop-out transaction's shape: dockview mounts the panel's tab into
    // the child window's element FIRST, then disposes the old one — two
    // live entries for the same (slot, panelId) for a moment.
    const second = document.createElement("div");
    const disposeSecond = mountTab?.("fx-rates", second) ?? noop;
    await page.waitFor(() => {
      expect(second.childNodes.length).toBeGreaterThan(0);
    });

    const duplicateKeyErrors = errors.mock.calls.filter(([message]) => {
      return String(message).includes("same key");
    });
    expect(duplicateKeyErrors).toHaveLength(0);

    disposeSecond();
    errors.mockRestore();
    page.unmountAll();
  });
});

function noop(): void {}
