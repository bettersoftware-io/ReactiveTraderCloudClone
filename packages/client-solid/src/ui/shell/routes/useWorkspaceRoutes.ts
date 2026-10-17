import { type Accessor, createEffect, onCleanup } from "solid-js";

import type { WorkspaceTab } from "@rtc/core-api";
import { createWorkspaceRouteSync } from "@rtc/core-logic";
import { useViewModel } from "@rtc/solid-bindings";

/** Keeps the page's route in step with the workspace tab (spec §5):
 * the URL's tab wins on mount, each later tab is a new history entry, and
 * Back/Forward switches to the tab it lands on. A host with no route
 * history does nothing. Runs once per mount, like every Solid component
 * body. */
export function useWorkspaceRoutes(
  activeTab: Accessor<WorkspaceTab>,
  switchTab: (tab: WorkspaceTab) => void,
): void {
  const { useRouteHistory } = useViewModel();
  const routes = useRouteHistory();

  if (routes === null) {
    return;
  }

  const sync = createWorkspaceRouteSync({ routes, switchTab });

  createEffect(() => {
    sync.observe(activeTab());
  });
  onCleanup(() => {
    sync.dispose();
  });
}
