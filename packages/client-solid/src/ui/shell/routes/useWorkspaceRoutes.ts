import { type Accessor, createEffect, onCleanup } from "solid-js";

import type { WorkspaceNavState, WorkspaceTab } from "@rtc/core-api";
import { createWorkspaceRouteSync } from "@rtc/core-logic";
import { useViewModel } from "@rtc/solid-bindings";

/** Keeps the page's route in step with the workspace tab (spec §5):
 * the URL's tab wins on mount, each later tab is a new history entry, and
 * Back/Forward switches to the tab it lands on. A URL or a step naming a
 * tab the user may not see (`navState().visibleTabs`) is rewritten to the
 * active tab instead. A host with no route history does nothing. Runs once per mount, like every Solid component
 * body. */
export function useWorkspaceRoutes(
  navState: Accessor<WorkspaceNavState>,
  switchTab: (tab: WorkspaceTab) => void,
): void {
  const { useRouteHistory } = useViewModel();
  const routes = useRouteHistory();

  if (routes === null) {
    return;
  }

  const sync = createWorkspaceRouteSync({
    routes,
    canShow: (tab: WorkspaceTab): boolean => {
      return navState().visibleTabs.includes(tab);
    },
    switchTab,
  });

  createEffect(() => {
    sync.observe(navState().activeTab);
  });
  onCleanup(() => {
    sync.dispose();
  });
}
