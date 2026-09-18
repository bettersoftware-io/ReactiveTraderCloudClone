import { createSignal } from "solid-js";
import { beforeAll, describe, expect, it } from "vitest";

import { InMemoryDockLayoutStore } from "@rtc/client-core";

import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";
import { dockviewLayoutEngineBridgePage } from "#tests/ui/pages/DockviewLayoutEngineBridgePage";

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

// The real engine runs throughout — nothing about `@rtc/layout-dockview` is
// mocked (see the pop-out spec's own doc comment for why: a package mock
// resolves to a DIFFERENT module instance under the contract-coverage config
// than under the unit config). Ported verbatim in shape from the react twin's
// floating spec.
describe("dockview bridge floating wiring", () => {
  it("floats a panel from its head control and records it in the witness", async () => {
    page.mount(() => {
      return (
        <DockviewLayoutEngine
          tab="fx"
          registry={registry}
          store={new InMemoryDockLayoutStore()}
          maximized={null}
          collapsed={[]}
          closed={[]}
          docked={[]}
          instances={[]}
          layoutResets={0}
          onMaximize={noop}
          onRestore={noop}
          onCollapse={noop}
          onExpand={noop}
          onCloseInstance={noop}
        />
      );
    });

    await page.waitFor(() => {
      expect(page.controlDisabled("panel-fx-analytics-float")).toBe(false);
    });

    page.clickControl("panel-fx-analytics-float");

    await page.waitFor(() => {
      expect(page.engineAttribute("data-floating")).toBe("fx-analytics");
    });

    page.unmountAll();
  });

  it("docks a floating panel back from its head control", async () => {
    page.mount(() => {
      return (
        <DockviewLayoutEngine
          tab="fx"
          registry={registry}
          store={new InMemoryDockLayoutStore()}
          maximized={null}
          collapsed={[]}
          closed={[]}
          docked={[]}
          instances={[]}
          layoutResets={0}
          onMaximize={noop}
          onRestore={noop}
          onCollapse={noop}
          onExpand={noop}
          onCloseInstance={noop}
        />
      );
    });

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
    page.mount(() => {
      return (
        <DockviewLayoutEngine
          tab="fx"
          registry={registry}
          store={new InMemoryDockLayoutStore()}
          maximized={null}
          collapsed={[]}
          closed={[]}
          docked={[]}
          instances={[]}
          layoutResets={0}
          onMaximize={noop}
          onRestore={noop}
          onCollapse={noop}
          onExpand={noop}
          onCloseInstance={noop}
        />
      );
    });

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

  it("clears floating state when a workspace reset rebuilds the engine", async () => {
    const store = new InMemoryDockLayoutStore();
    const [layoutResets, setLayoutResets] = createSignal(0);

    page.mount(() => {
      return (
        <DockviewLayoutEngine
          tab="fx"
          registry={registry}
          store={store}
          maximized={null}
          collapsed={[]}
          closed={[]}
          docked={[]}
          instances={[]}
          layoutResets={layoutResets()}
          onMaximize={noop}
          onRestore={noop}
          onCollapse={noop}
          onExpand={noop}
          onCloseInstance={noop}
        />
      );
    });

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

function noop(): void {}

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
