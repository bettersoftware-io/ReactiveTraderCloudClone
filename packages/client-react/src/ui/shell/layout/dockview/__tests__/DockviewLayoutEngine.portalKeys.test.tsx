import { beforeAll, describe, expect, it } from "vitest";

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

describe("dockview portal keys", () => {
  it("keys slot portals per mount, so a real pop-out transaction never duplicates keys", async () => {
    const popout = page.stubPopoutWindow();

    // The transaction that used to warn: dockview mounts the panel's tab
    // into the child window's element BEFORE disposing the old one, so the
    // bridge holds two live mounts for the same (slot, panelId) for a
    // moment. Driven here by the REAL popout rather than a hand-called
    // hook — the same crossing the browser performs.
    const errors = await page.captureConsoleErrors(async () => {
      page.mount({ registry, store: new InMemoryDockLayoutStore() });

      await page.waitFor(() => {
        expect(page.controlDisabled("panel-fx-rates-popout")).toBe(false);
      });

      page.clickControl("panel-fx-rates-popout");
      await popout.settleOpen();

      await page.waitFor(() => {
        expect(page.engineAttribute("data-popped")).toBe("fx-rates");
      });
    });

    // The panel's DOM really crossed into the other document — without that
    // the transaction never happened and the assertion below is vacuous.
    expect(popout.childContentLength()).toBeGreaterThan(0);

    const duplicateKeyErrors = errors.filter((message) => {
      return message.includes("same key");
    });
    expect(duplicateKeyErrors).toEqual([]);

    popout.restore();
    page.unmountAll();
  });
});

function noop(): void {}

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
