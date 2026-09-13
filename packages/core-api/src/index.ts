export type * from "#/adapters";
export type * from "#/app";
// `#/layout`'s `PanelInstance` (a Phase 4 chart-instance descriptor) collides
// by name with `#/machines/jarvisPanels`'s pre-existing, widely-consumed
// `PanelInstance` (a docked Jarvis panel entry) — an unrelated concept that
// happens to share the name. Re-exported here under an alias so the barrel
// wildcard below keeps resolving to the established Jarvis meaning; consumers
// that need the layout one import it through `@rtc/client-core`'s
// `layoutPort.ts`, which un-aliases it back to `PanelInstance` there (the
// name the layout module itself, and every later Phase-4 task, uses).
export type {
  LayoutNode,
  LayoutPort,
  LayoutState,
  PanelId,
  PanelInstance as EqChartPanelInstance,
  PanelSpec,
  SplitDir,
  WorkspaceTab,
} from "#/layout";
export type * from "#/machine";
export type * from "#/machines/index";
export type * from "#/presenters/index";
export type * from "#/stream";
