import { useCallback, useEffect, useState } from "react";

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

const MAX_PANEL_KEY = "rt_dock_maxPanel";
const ASIDE_COLLAPSED_KEY = "rt_dock_asideCollapsed";
const PANEL_IDS: PanelId[] = ["tiles", "fxblot", "ana", "pos"];

function readMaxPanel(): PanelId | null {
  const stored = localStorage.getItem(MAX_PANEL_KEY);
  return stored && PANEL_IDS.includes(stored as PanelId)
    ? (stored as PanelId)
    : null;
}

function readAsideCollapsed(): boolean {
  return localStorage.getItem(ASIDE_COLLAPSED_KEY) === "true";
}

export function useDockState(): DockApi {
  const [maxPanel, setMaxPanel] = useState<PanelId | null>(readMaxPanel);
  const [asideCollapsed, setAsideCollapsed] =
    useState<boolean>(readAsideCollapsed);

  const toggleMax = useCallback((id: PanelId) => {
    setMaxPanel((prev) => {
      return prev === id ? null : id;
    });
  }, []);

  const toggleAside = useCallback(() => {
    setAsideCollapsed((prev) => {
      return !prev;
    });
  }, []);

  // Persistence lives outside the updaters above: React (StrictMode, in
  // particular) may invoke a functional updater more than once per commit,
  // and updaters must stay pure. Effects run once per committed value.
  useEffect(() => {
    if (maxPanel == null) {
      localStorage.removeItem(MAX_PANEL_KEY);
    } else {
      localStorage.setItem(MAX_PANEL_KEY, maxPanel);
    }
  }, [maxPanel]);

  useEffect(() => {
    localStorage.setItem(ASIDE_COLLAPSED_KEY, String(asideCollapsed));
  }, [asideCollapsed]);

  return { maxPanel, asideCollapsed, toggleMax, toggleAside };
}
