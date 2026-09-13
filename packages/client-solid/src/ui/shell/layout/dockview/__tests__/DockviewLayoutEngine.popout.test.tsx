import { beforeAll, describe, expect, it, vi } from "vitest";

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

describe("dockview bridge pop-out wiring", () => {
  it("threads popoutUrl into the engine, surfaces popped state as data-popped, and greys the popped panel's controls", async () => {
    page.mount(() => {
      return (
        <DockviewLayoutEngine
          tab="fx"
          registry={registry}
          store={new InMemoryDockLayoutStore()}
          maximized={null}
          collapsed={[]}
          closed={[]}
          onMaximize={noop}
          onRestore={noop}
          onCollapse={noop}
          onExpand={noop}
        />
      );
    });

    // The bridge names the real page both clients emit at their site root.
    expect(captured.options?.popoutUrl).toBe("/popout.html");

    // Every tab's controls carry the pop-out slot under this bridge (the
    // engine-gating: in-house heads never receive it).
    await page.waitFor(() => {
      expect(popoutControl("fx-rates")?.disabled).toBe(false);
    });

    // jsdom cannot open a real popout window, so the engine-owned popped
    // set is driven through the captured callback — the bridge's side is
    // exactly the same either way.
    captured.options?.onPopoutsChange?.(["fx-analytics"]);

    await page.waitFor(() => {
      expect(
        document
          .querySelector('[data-testid="layout-engine"]')
          ?.getAttribute("data-popped"),
      ).toBe("fx-analytics");
    });
    expect(collapseControl("fx-analytics")?.disabled).toBe(true);
    expect(popoutControl("fx-analytics")?.disabled).toBe(true);
    expect(collapseControl("fx-rates")?.disabled).toBe(false);

    // Dock-home empties the set and re-arms the controls.
    captured.options?.onPopoutsChange?.([]);

    await page.waitFor(() => {
      expect(collapseControl("fx-analytics")?.disabled).toBe(false);
    });

    page.unmountAll();
  });

  it("routes the pop-out control's click to engine.popoutPanel", async () => {
    page.mount(() => {
      return (
        <DockviewLayoutEngine
          tab="fx"
          registry={registry}
          store={new InMemoryDockLayoutStore()}
          maximized={null}
          collapsed={[]}
          closed={[]}
          onMaximize={noop}
          onRestore={noop}
          onCollapse={noop}
          onExpand={noop}
        />
      );
    });

    await page.waitFor(() => {
      expect(popoutControl("fx-rates")).not.toBeNull();
    });

    popoutControl("fx-rates")?.click();
    expect(captured.popoutCalls).toContain("fx-rates");

    page.unmountAll();
  });
});

function noop(): void {}

function popoutControl(panelId: string): HTMLButtonElement | null {
  return document.querySelector(`[data-testid="panel-${panelId}-popout"]`);
}

function collapseControl(panelId: string): HTMLButtonElement | null {
  return document.querySelector(`[data-testid="panel-${panelId}-collapse"]`);
}

interface CapturedEngineWiring {
  options: {
    popoutUrl?: string;
    onPopoutsChange?: (poppedPanelIds: readonly string[]) => void;
  } | null;
  popoutCalls: string[];
}

const captured = vi.hoisted((): CapturedEngineWiring => {
  return { options: null, popoutCalls: [] };
});

// Passthrough capture: the engine runs for real, but the test keeps the
// options the bridge handed it (popoutUrl, onPopoutsChange) and wraps
// popoutPanel to record calls — jsdom blocks window.open, so the real
// method must not be awaited for an opened window here.
vi.mock("@rtc/layout-dockview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@rtc/layout-dockview")>();

  return {
    ...actual,
    createDockEngine: (
      ...args: Parameters<typeof actual.createDockEngine>
    ): ReturnType<typeof actual.createDockEngine> => {
      captured.options = {
        popoutUrl: args[0].popoutUrl,
        onPopoutsChange: args[0].onPopoutsChange,
      };
      const engine = actual.createDockEngine(...args);

      return {
        ...engine,
        popoutPanel: (panelId: string): Promise<boolean> => {
          captured.popoutCalls.push(panelId);

          return engine.popoutPanel(panelId);
        },
      };
    },
  };
});
