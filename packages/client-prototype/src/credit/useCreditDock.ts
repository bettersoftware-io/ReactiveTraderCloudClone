import { useMaxPanel } from "#/layout/useMaxPanel";

// Credit dock chrome: which right-column panel (if any) is maximized. Unlike
// FX's aside, the Credit left form has no independent collapse toggle — it
// collapses to a restore strip whenever a right panel (rfqs/cblot) is
// maximized, so `leftCollapsed` is derived rather than its own bit of state.

export type CreditPanelId = "rfqs" | "cblot";

export interface CreditDockApi {
  maxPanel: CreditPanelId | null;
  leftCollapsed: boolean;
  toggleMax(id: CreditPanelId): void;
  restore(): void;
}

const CREDIT_PANEL_IDS: readonly CreditPanelId[] = ["rfqs", "cblot"];

export function useCreditDock(): CreditDockApi {
  const { maxPanel, toggleMax } = useMaxPanel<CreditPanelId>(
    "rt_credit_maxPanel",
    CREDIT_PANEL_IDS,
  );
  const leftCollapsed: boolean = maxPanel === "rfqs" || maxPanel === "cblot";

  function restore(): void {
    if (maxPanel != null) {
      toggleMax(maxPanel);
    }
  }

  return { maxPanel, leftCollapsed, toggleMax, restore };
}
