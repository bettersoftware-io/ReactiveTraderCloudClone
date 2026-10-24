import type { WorkspaceNavState, WorkspaceTab } from "@rtc/core-api";
import type { AccessLevel } from "@rtc/domain";

/** The tabs every signed-in user may open, in nav order. */
export const EVERY_USER_TABS: readonly WorkspaceTab[] = [
  "fx",
  "credit",
  "equities",
  "ops",
];

const ADMIN_TABS: readonly WorkspaceTab[] = [...EVERY_USER_TABS, "admin"];

/** The tab the nav falls back to when the active one stops being visible. */
const FALLBACK_TAB: WorkspaceTab = "fx";

/** The tabs a user with this access may open: everyone's, plus `admin` last
 * for an administrator. `null` is nobody signed in. */
export function visibleTabsFor(
  access: AccessLevel | null,
): readonly WorkspaceTab[] {
  if (access === "admin") {
    return ADMIN_TABS;
  }

  return EVERY_USER_TABS;
}

export type WorkspaceNavEvent =
  | { readonly type: "switchTab"; readonly tab: WorkspaceTab }
  | { readonly type: "access"; readonly access: AccessLevel | null };

export const INITIAL_WORKSPACE_NAV: WorkspaceNavState = {
  activeTab: "fx",
  visibleTabs: visibleTabsFor(null),
};

/** One step of the workspace nav. A switch to a tab that is not visible
 * returns the same state; an access change recomputes the visible tabs and
 * lands on `fx` when the active tab is no longer among them. A step that
 * changes nothing returns the SAME state object, so a caller can drop it by
 * reference. */
export function stepWorkspaceNav(
  state: WorkspaceNavState,
  event: WorkspaceNavEvent,
): WorkspaceNavState {
  if (event.type === "switchTab") {
    if (
      !state.visibleTabs.includes(event.tab) ||
      event.tab === state.activeTab
    ) {
      return state;
    }

    return { ...state, activeTab: event.tab };
  }

  const visibleTabs = visibleTabsFor(event.access);
  const activeTab = visibleTabs.includes(state.activeTab)
    ? state.activeTab
    : FALLBACK_TAB;

  if (activeTab === state.activeTab && visibleTabs === state.visibleTabs) {
    return state;
  }

  return { activeTab, visibleTabs };
}
