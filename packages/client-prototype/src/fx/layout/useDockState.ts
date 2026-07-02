import { useCallback, useEffect, useState } from "react";

import { useMaxPanel } from "#/layout/useMaxPanel";

// FX dock chrome: which panel (if any) is maximized, and whether the
// analytics/positions aside is collapsed (PROTO 1123 toggleMax / 1226
// asideCol). Both persist to localStorage so a reload restores the layout.

export type PanelId = "tiles" | "fxblot" | "ana" | "pos";

export interface DockApi {
  maxPanel: PanelId | null;
  asideCollapsed: boolean;
  toggleMax(id: PanelId): void;
  toggleAside(): void;
}

const ASIDE_COLLAPSED_KEY = "rt_dock_asideCollapsed";
const PANEL_IDS: readonly PanelId[] = ["tiles", "fxblot", "ana", "pos"];

function readAsideCollapsed(): boolean {
  return localStorage.getItem(ASIDE_COLLAPSED_KEY) === "true";
}

export function useDockState(): DockApi {
  const { maxPanel, toggleMax } = useMaxPanel<PanelId>(
    "rt_dock_maxPanel",
    PANEL_IDS,
  );
  const [asideCollapsed, setAsideCollapsed] =
    useState<boolean>(readAsideCollapsed);

  const toggleAside = useCallback(() => {
    setAsideCollapsed((prev) => {
      return !prev;
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(ASIDE_COLLAPSED_KEY, String(asideCollapsed));
  }, [asideCollapsed]);

  return { maxPanel, asideCollapsed, toggleMax, toggleAside };
}
