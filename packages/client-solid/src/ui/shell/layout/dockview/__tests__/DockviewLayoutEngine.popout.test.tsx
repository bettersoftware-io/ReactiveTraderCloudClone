import { createSignal } from "solid-js";
import { beforeAll, describe, expect, it } from "vitest";

import { InMemoryDockLayoutStore } from "@rtc/client-core";

import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";
import { dockviewLayoutEngineBridgePage } from "#tests/ui/pages/DockviewLayoutEngineBridgePage";

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

// The engine, dockview and the browser's own `window.open` all run for real
// here: the only stand-in is the WINDOW the pop-out opens into (an
// iframe-backed document, since jsdom opens none). Nothing mocks
// `@rtc/layout-dockview` — a package mock resolves to a different module
// instance under the contract-coverage config than under the unit config
// (measured: the component kept the real `createDockEngine` while the spec
// held the mocked one), so a mock-based witness passes one gate and fails
// the other. Driving the real path is both configs' truth.
describe("dockview bridge pop-out wiring", () => {
  it("asks the browser for the pop-out page, then greys the popped panel's controls", async () => {
    const popout = page.stubPopoutWindow();

    page.mount({ registry, store: new InMemoryDockLayoutStore() });

    // Every tab's controls carry the pop-out slot under this bridge (the
    // engine-gating: in-house heads never receive it).
    await page.waitFor(() => {
      expect(page.controlDisabled("panel-fx-analytics-popout")).toBe(false);
    });

    page.clickControl("panel-fx-analytics-popout");

    // The click reached `engine.popoutPanel`, which asked the browser for
    // the page both clients emit at their site root — the URL the bridge
    // threads into the engine, witnessed where it actually lands.
    await page.waitFor(() => {
      expect(popout.requestedUrls()).toEqual(["/popout.html"]);
    });

    await popout.settleOpen();

    // The engine's own popped set reached the bridge, which stamps it and
    // greys the controls that make no sense for a panel in another window.
    await page.waitFor(() => {
      expect(page.engineAttribute("data-popped")).toBe("fx-analytics");
    });
    expect(popout.childContentLength()).toBeGreaterThan(0);
    expect(page.controlDisabled("panel-fx-analytics-collapse")).toBe(true);
    expect(page.controlDisabled("panel-fx-analytics-popout")).toBe(true);
    expect(page.controlDisabled("panel-fx-rates-collapse")).toBe(false);

    popout.restore();
    page.unmountAll();
  });

  it("leaves the pop-out control live for a panel that is still docked", async () => {
    const popout = page.stubPopoutWindow();

    page.mount({ registry, store: new InMemoryDockLayoutStore() });

    await page.waitFor(() => {
      expect(page.controlDisabled("panel-fx-rates-popout")).toBe(false);
    });

    page.clickControl("panel-fx-analytics-popout");
    await popout.settleOpen();

    await page.waitFor(() => {
      expect(page.engineAttribute("data-popped")).toBe("fx-analytics");
    });

    // Only the popped panel is suppressed — its siblings stay poppable.
    expect(page.controlDisabled("panel-fx-rates-popout")).toBe(false);

    popout.restore();
    page.unmountAll();
  });

  it("clears popped state when a workspace reset rebuilds the engine", async () => {
    const popout = page.stubPopoutWindow();
    const store = new InMemoryDockLayoutStore();
    const [layoutResets, setLayoutResets] = createSignal(0);

    page.mount({ registry, store, layoutResets });

    await page.waitFor(() => {
      expect(page.controlDisabled("panel-fx-analytics-popout")).toBe(false);
    });

    page.clickControl("panel-fx-analytics-popout");
    await popout.settleOpen();

    await page.waitFor(() => {
      expect(page.engineAttribute("data-popped")).toBe("fx-analytics");
    });

    // A workspace reset disposes the engine that owned that window and
    // builds a fresh one. The new engine never re-announces an empty popped
    // set (it only publishes on a CHANGE, and it starts empty), so the
    // bridge must clear the state itself — otherwise the docked panel keeps
    // greyed controls for a window that no longer exists.
    setLayoutResets(1);

    await page.waitFor(() => {
      expect(page.engineAttribute("data-popped")).toBe("");
    });
    expect(page.controlDisabled("panel-fx-analytics-collapse")).toBe(false);
    expect(page.controlDisabled("panel-fx-analytics-popout")).toBe(false);

    popout.restore();
    page.unmountAll();
  });
});

const page = dockviewLayoutEngineBridgePage();

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
