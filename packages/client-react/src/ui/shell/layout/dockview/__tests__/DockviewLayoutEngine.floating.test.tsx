import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { InMemoryDockLayoutStore } from "@rtc/client-core";

import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";
import { dockviewLayoutEngineStrictModePage } from "#tests/ui/pages/DockviewLayoutEngineStrictModePage";

// jsdom has no ResizeObserver; dockview-core's own tests stub it the same way
// (see DockviewLayoutEngine.strictMode.test.tsx / .popout.test.tsx).
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

// The real engine runs throughout — nothing about `@rtc/layout-dockview` is
// mocked (see the pop-out spec's own doc comment for why: a package mock
// resolves to a DIFFERENT module instance under the contract-coverage
// config than under the unit config).
describe("dockview bridge floating wiring", () => {
  it("floats a panel from its head control and records it in the witness", async () => {
    page.mount({ registry, store: new InMemoryDockLayoutStore() });

    await page.waitFor(() => {
      expect(page.controlDisabled("panel-fx-analytics-float")).toBe(false);
    });

    page.clickControl("panel-fx-analytics-float");

    await page.waitFor(() => {
      expect(page.engineAttribute("data-floating")).toBe("fx-analytics");
    });
  });

  it("docks a floating panel back from its head control", async () => {
    page.mount({ registry, store: new InMemoryDockLayoutStore() });

    page.clickControl("panel-fx-analytics-float");

    await page.waitFor(() => {
      expect(page.engineAttribute("data-floating")).toBe("fx-analytics");
    });

    page.clickControl("panel-fx-analytics-float");

    await page.waitFor(() => {
      expect(page.engineAttribute("data-floating")).toBe("");
    });
  });

  it("hides collapse and maximize while a panel is floating, without disturbing a docked sibling", async () => {
    page.mount({ registry, store: new InMemoryDockLayoutStore() });

    expect(page.controlDisabled("panel-fx-analytics-collapse")).toBe(false);
    expect(page.controlDisabled("panel-fx-analytics-maximize")).toBe(false);

    page.clickControl("panel-fx-analytics-float");

    await page.waitFor(() => {
      expect(page.engineAttribute("data-floating")).toBe("fx-analytics");
    });

    // Hidden outright — not merely disabled, unlike the pop-out precedent —
    // so the control testid itself must be absent from the DOM.
    expect(page.bodyVisible("panel-fx-analytics-collapse")).toBe(false);
    expect(page.bodyVisible("panel-fx-analytics-maximize")).toBe(false);

    // A docked sibling is untouched.
    expect(page.bodyVisible("panel-fx-rates-collapse")).toBe(true);
    expect(page.controlDisabled("panel-fx-rates-collapse")).toBe(false);
  });

  it("clears floating state when a workspace reset rebuilds the engine", async () => {
    const store = new InMemoryDockLayoutStore();

    page.mount({ registry, store });

    page.clickControl("panel-fx-analytics-float");

    await page.waitFor(() => {
      expect(page.engineAttribute("data-floating")).toBe("fx-analytics");
    });

    page.rerender({ registry, store, layoutResets: 1 });

    await page.waitFor(() => {
      expect(page.engineAttribute("data-floating")).toBe("");
    });
    expect(page.bodyVisible("panel-fx-analytics-collapse")).toBe(true);
  });
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
