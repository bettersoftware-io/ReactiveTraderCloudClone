import type { WorkspaceTab } from "#/layout";

export interface WorkspaceNavState {
  readonly activeTab: WorkspaceTab;
}

export interface WorkspaceNavIntents {
  switchTab(tab: WorkspaceTab): void;
}
