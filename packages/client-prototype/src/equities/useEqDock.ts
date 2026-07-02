import { useMaxPanel } from "#/layout/useMaxPanel";

// Equities dock chrome: which of the four panels (if any) is maximized. The
// two wide center panels (chart/eblot) collapse the right aside to its restore
// strip when maximized — `rightCollapsed` is derived, matching the Credit
// dock's `leftCollapsed`. Maximizing an aside panel (ticket/watch) leaves the
// center untouched; CSS collapses only its aside sibling.
export type EqPanelId = "chart" | "eblot" | "ticket" | "watch";

export interface EqDockApi {
  maxPanel: EqPanelId | null;
  rightCollapsed: boolean;
  toggleMax(id: EqPanelId): void;
  restore(): void;
}

const EQ_PANEL_IDS: readonly EqPanelId[] = [
  "chart",
  "eblot",
  "ticket",
  "watch",
];

export function useEqDock(): EqDockApi {
  const { maxPanel, toggleMax } = useMaxPanel<EqPanelId>(
    "rt_eq_maxPanel",
    EQ_PANEL_IDS,
  );
  const rightCollapsed: boolean = maxPanel === "chart" || maxPanel === "eblot";

  function restore(): void {
    if (maxPanel != null) {
      toggleMax(maxPanel);
    }
  }

  return { maxPanel, rightCollapsed, toggleMax, restore };
}
