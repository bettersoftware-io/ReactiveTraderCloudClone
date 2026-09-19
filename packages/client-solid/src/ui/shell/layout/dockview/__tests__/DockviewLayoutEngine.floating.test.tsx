import { createSignal } from "solid-js";
import { beforeAll, describe, expect, it } from "vitest";

import {
  InMemoryDockLayoutStore,
  type PanelId,
  type WorkspaceTab,
} from "@rtc/client-core";

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

// The real engine runs throughout — nothing about `@rtc/layout-dockview` is
// mocked (see the pop-out spec's own doc comment for why: a package mock
// resolves to a DIFFERENT module instance under the contract-coverage config
// than under the unit config). Ported verbatim in shape from the react twin's
// floating spec.
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

    page.unmountAll();
  });

  it("reports the whole detached set on every float/dock, and [] on unmount", async () => {
    const reports: DetachedPanelsReport[] = [];

    page.mount({
      registry,
      store: new InMemoryDockLayoutStore(),
      onDetachedPanelsChange: (
        tab: WorkspaceTab,
        panelIds: readonly PanelId[],
      ): void => {
        reports.push({ tab, panelIds });
      },
    });

    await page.waitFor(() => {
      expect(reports.at(-1)).toEqual({ tab: "fx", panelIds: [] });
    });
    await page.waitFor(() => {
      expect(page.controlDisabled("panel-fx-analytics-float")).toBe(false);
    });

    page.clickControl("panel-fx-analytics-float");

    await page.waitFor(() => {
      expect(reports.at(-1)).toEqual({
        tab: "fx",
        panelIds: ["fx-analytics"],
      });
    });

    page.clickControl("panel-fx-analytics-float");

    await page.waitFor(() => {
      expect(reports.at(-1)).toEqual({ tab: "fx", panelIds: [] });
    });

    page.clickControl("panel-fx-analytics-float");

    await page.waitFor(() => {
      expect(reports.at(-1)).toEqual({
        tab: "fx",
        panelIds: ["fx-analytics"],
      });
    });

    page.unmountAll();

    expect(reports.at(-1)).toEqual({ tab: "fx", panelIds: [] });
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

    page.unmountAll();
  });

  it("hides collapse and maximize while a panel is floating, without disturbing a docked sibling", async () => {
    page.mount({ registry, store: new InMemoryDockLayoutStore() });

    await page.waitFor(() => {
      expect(page.controlDisabled("panel-fx-analytics-collapse")).toBe(false);
    });
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

    page.unmountAll();
  });

  // Spec §3.2 / Ruling 32: the float control is HIDDEN while a maximize is
  // live. Asserted on the MAXIMIZED panel's own head, and only alongside its
  // maximize control: every other head is a strip during a root maximize and
  // renders no controls at all, so an absence read there would pass whether
  // or not the float control was withheld. The maximize control present in
  // the same head is what proves the head rendered and the float control
  // specifically is gone.
  it("hides the float control while a maximize is live, and shows it again after", async () => {
    const [maximized, setMaximized] = createSignal<PanelId | null>(null);

    page.mount({ registry, store: new InMemoryDockLayoutStore(), maximized });

    await page.waitFor(() => {
      expect(page.bodyVisible("panel-fx-rates-float")).toBe(true);
    });

    setMaximized("fx-rates");

    await page.waitFor(() => {
      expect(page.engineAttribute("data-maximized")).toBe("fx-rates");
    });
    expect(page.bodyVisible("panel-fx-rates-maximize")).toBe(true);
    expect(page.bodyVisible("panel-fx-rates-float")).toBe(false);

    setMaximized(null);

    await page.waitFor(() => {
      expect(page.bodyVisible("panel-fx-rates-float")).toBe(true);
    });

    page.unmountAll();
  });

  it("clears floating state when a workspace reset rebuilds the engine", async () => {
    const store = new InMemoryDockLayoutStore();
    const [layoutResets, setLayoutResets] = createSignal(0);

    page.mount({ registry, store, layoutResets });

    await page.waitFor(() => {
      expect(page.controlDisabled("panel-fx-analytics-float")).toBe(false);
    });

    page.clickControl("panel-fx-analytics-float");

    await page.waitFor(() => {
      expect(page.engineAttribute("data-floating")).toBe("fx-analytics");
    });

    setLayoutResets(1);

    await page.waitFor(() => {
      expect(page.engineAttribute("data-floating")).toBe("");
    });
    expect(page.bodyVisible("panel-fx-analytics-collapse")).toBe(true);

    page.unmountAll();
  });
});

interface DetachedPanelsReport {
  readonly tab: WorkspaceTab;
  readonly panelIds: readonly PanelId[];
}

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
