import type { WorkspaceTab } from "#/layout";

export interface WorkspaceNavState {
  readonly activeTab: WorkspaceTab;
  /** The tabs the signed-in user may open, in nav order. Decided in the
   * core from the user's access, so the tab bar, the route sync and a
   * Jarvis switch all go through one gate. */
  readonly visibleTabs: readonly WorkspaceTab[];
}

export interface WorkspaceNavIntents {
  switchTab(tab: WorkspaceTab): void;
}
