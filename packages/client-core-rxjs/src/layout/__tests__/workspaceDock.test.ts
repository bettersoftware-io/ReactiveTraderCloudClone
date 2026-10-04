import { describe, expect, it } from "vitest";

import type {
  LayoutIntents,
  LayoutState,
  Machine,
  PanelInstance,
  WorkspaceTab,
} from "@rtc/core-api";
import {
  createDefaultLayoutPort,
  createWorkspaceDock,
  InMemoryDockLayoutStore,
  instanceIdFor,
  type WorkspaceDock,
} from "@rtc/core-logic";
import { MAX_DOCKED_PANELS } from "@rtc/domain";

import { createLayoutMachine } from "#/presenters/LayoutMachine";

// `dockPanel`'s return value is how the Jarvis driver tells an accepted
// dock from a refused one (pluggable-core slice 7 wave 2, ruling 6).
describe("createWorkspaceDock — dockPanel reports whether THIS call docked the panel", () => {
  it("true for a live floating panel", () => {
    const { dock } = createDockFixture(["jarvis-1"]);

    expect(dock.dockPanel("jarvis-1")).toBe(true);
  });

  it("false for an id colliding with a static workspace panel", () => {
    const { dock } = createDockFixture(["fx-rates"]);

    expect(dock.dockPanel("fx-rates")).toBe(false);
  });

  it("false for an id in the chart-instance namespace", () => {
    const id = instanceIdFor("eq-chart", "AAPL");
    const { dock } = createDockFixture([id]);

    expect(dock.dockPanel(id)).toBe(false);
  });

  it("false for a second dock of the same panel", () => {
    const { dock } = createDockFixture(["jarvis-1"]);
    dock.dockPanel("jarvis-1");

    expect(dock.dockPanel("jarvis-1")).toBe(false);
  });

  it("false for an id the roster does not know", () => {
    const { dock } = createDockFixture(["jarvis-1"]);

    expect(dock.dockPanel("not-live")).toBe(false);
  });

  it("false past MAX_DOCKED_PANELS, when the roster refuses the dock", () => {
    const docked = Array.from({ length: MAX_DOCKED_PANELS }, (_, i) => {
      return `jarvis-${i}`;
    });
    const { dock } = createDockFixture([...docked, "jarvis-overflow"]);

    for (const id of docked) {
      expect(dock.dockPanel(id)).toBe(true);
    }

    expect(dock.dockPanel("jarvis-overflow")).toBe(false);
  });
});

interface DockFixture {
  readonly dock: WorkspaceDock;
}

/** A dock over an in-memory roster of floating panels. The roster's `dock`
 * applies the panels machine's own rules that matter here: unknown ids and
 * a full dock are no-ops. */
function createDockFixture(liveIds: readonly string[]): DockFixture {
  let panels: PanelInstance[] = liveIds.map(createFloatingPanel);
  const layouts = new Map<WorkspaceTab, Machine<LayoutState, LayoutIntents>>();
  const dock = createWorkspaceDock({
    panels: {
      current: () => {
        return panels;
      },
      dock: (panelId: string) => {
        const dockedCount = panels.filter((panel) => {
          return panel.docked;
        }).length;

        if (dockedCount >= MAX_DOCKED_PANELS) {
          return;
        }

        panels = panels.map((panel) => {
          return panel.panelId === panelId ? { ...panel, docked: true } : panel;
        });
      },
      undock: () => {
        // unused here
      },
      dismiss: () => {
        // unused here
      },
      restore: () => {
        // unused here
      },
    },
    layoutFor: (tab: WorkspaceTab) => {
      const existing = layouts.get(tab);

      if (existing) {
        return existing;
      }

      const created = createLayoutMachine(createDefaultLayoutPort(tab));
      layouts.set(tab, created);
      return created;
    },
    activeTab: () => {
      return "fx";
    },
    readStoredLayout: () => {
      return null;
    },
    clearStoredLayout: () => {
      // unused here
    },
    dockLayoutStore: new InMemoryDockLayoutStore(),
    onDockedMembershipChange: () => {
      // unused here
    },
    onResetsBump: () => {
      // unused here
    },
  });
  return { dock };
}

function createFloatingPanel(panelId: string): PanelInstance {
  return { panelId, spec: null, status: "live", docked: false };
}
