import { useEffect, useEffectEvent, useRef } from "react";

import type { WorkspaceTab } from "@rtc/core-api";
import {
  createWorkspaceRouteSync,
  type WorkspaceRouteSync,
} from "@rtc/core-logic";
import { useViewModel } from "@rtc/react-bindings";

/** Keeps the page's hash route in step with the workspace tab (spec §5):
 * the URL's tab wins on mount, each later tab is a new history entry, and
 * Back/Forward switches to the tab it lands on. A host with no route
 * history does nothing.
 *
 * `switchTab` must keep its identity across renders: a changed identity
 * rebuilds the sync, which re-runs its mount rule and switches back to the
 * URL's tab. Every real host meets this — one `switchWorkspaceTab` per view
 * model. */
export function useWorkspaceRoutes(
  activeTab: WorkspaceTab,
  switchTab: (tab: WorkspaceTab) => void,
): void {
  const { useRouteHistory } = useViewModel();
  const routes = useRouteHistory();
  const syncRef = useRef<WorkspaceRouteSync | null>(null);

  const observeCurrentTab = useEffectEvent((sync: WorkspaceRouteSync): void => {
    sync.observe(activeTab);
  });

  useEffect(() => {
    if (routes === null) {
      return undefined;
    }

    const sync = createWorkspaceRouteSync({ routes, switchTab });
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
