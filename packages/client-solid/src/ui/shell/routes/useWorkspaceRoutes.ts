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

  // The tabs the user may see, as of the last nav state the effect below
  // received. The sync asks `canShow` from inside `observe` — called from
  // that effect's apply phase, where a reactive read is untracked by
  // construction (and dev-warns) — and from its Back/Forward listener, so it
  // reads this plain copy, which the effect refreshes before every
  // `observe`.
  let visibleTabs: readonly WorkspaceTab[] = [];

  const sync = createWorkspaceRouteSync({
    routes,
    canShow: (tab: WorkspaceTab): boolean => {
      return visibleTabs.includes(tab);
    },
    switchTab,
  });

  createEffect(navState, (nav) => {
    visibleTabs = nav.visibleTabs;
    sync.observe(nav.activeTab);
  });
  onCleanup(() => {
    sync.dispose();
  });
}
