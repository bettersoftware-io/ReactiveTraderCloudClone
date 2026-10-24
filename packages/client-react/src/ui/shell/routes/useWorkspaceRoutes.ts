import { useEffect, useEffectEvent, useRef } from "react";

import type { WorkspaceNavState, WorkspaceTab } from "@rtc/core-api";
import {
  createWorkspaceRouteSync,
  type WorkspaceRouteSync,
} from "@rtc/core-logic";
import { useViewModel } from "@rtc/react-bindings";

/** Keeps the page's route in step with the workspace tab (spec §5):
 * the URL's tab wins on mount, each later tab is a new history entry, and
 * Back/Forward switches to the tab it lands on. A URL or a step naming a
 * tab the user may not see (`navState.visibleTabs`) is rewritten to the
 * active tab instead. A host with no route history does nothing.
 *
 * `switchTab` must keep its identity across renders: a changed identity
 * rebuilds the sync, which re-runs its mount rule and switches back to the
 * URL's tab. Every real host meets this — one `switchWorkspaceTab` per view
 * model. */
export function useWorkspaceRoutes(
  navState: WorkspaceNavState,
  switchTab: (tab: WorkspaceTab) => void,
): void {
  const { useRouteHistory } = useViewModel();
  const routes = useRouteHistory();
  const syncRef = useRef<WorkspaceRouteSync | null>(null);
  const { activeTab, visibleTabs } = navState;
  // The sync outlives renders and reads this at each call, so a stale
  // closure can never answer with the visible tabs of an older render. The
  // effect below is declared before the sync's, so it runs first on mount.
  const visibleTabsRef = useRef(visibleTabs);

  useEffect(() => {
    visibleTabsRef.current = visibleTabs;
  }, [visibleTabs]);

  const observeCurrentTab = useEffectEvent((sync: WorkspaceRouteSync): void => {
    sync.observe(activeTab);
  });

  useEffect(() => {
    if (routes === null) {
      return undefined;
    }

    const sync = createWorkspaceRouteSync({
      routes,
      canShow: (tab: WorkspaceTab): boolean => {
        return visibleTabsRef.current.includes(tab);
      },
      switchTab,
    });
    syncRef.current = sync;
    observeCurrentTab(sync);

    return () => {
      sync.dispose();
      syncRef.current = null;
    };
  }, [routes, switchTab]);

  useEffect(() => {
    syncRef.current?.observe(activeTab);
  }, [activeTab]);
}
