export * from "#/layout/defaultLayoutPort";
// Only the design-width constant is public — `dockColumn.ts`'s leaf
// insert/remove helpers stay internal to LayoutMachine/workspace persistence;
// the Dockview bridges (client-react, client-solid) need the SAME 360px pin
// a seeded rail's `initialPx` uses, for a Jarvis panel opened at runtime via
// `DockEngine.addDynamicPanel`.
export { DOCK_COLUMN_INITIAL_PX } from "#/layout/dockColumn";
// `layoutPort.ts`'s `PanelInstance` (the Phase 4 chart-instance descriptor)
// collides by name with the pre-existing, widely-consumed Jarvis
// `PanelInstance` (a docked panel entry, re-exported here via
// `#/presenters/index`'s wildcard) — an unrelated concept that happens to
// share the name. Re-exported here under an alias so this package's root
// barrel (`src/index.ts`, which wildcards both this module and
// `#/presenters/index`) keeps resolving the bare name to the established
// Jarvis meaning. Code inside `client-core` that needs the layout one by its
// real name imports it directly from `#/layout/layoutPort`.
export type {
  LayoutNode,
  LayoutPort,
  LayoutState,
  PanelId,
  PanelInstance as EqChartPanelInstance,
  PanelSpec,
  SplitDir,
} from "#/layout/layoutPort";
export * from "#/layout/maximizeBoundary";
export * from "#/layout/visibleRoot";
// The workspace-persistence pair is public for one reason: each web client's
// ui-contract fixture (`tests/ui/contract/<framework>/viewModelFromWorld.ts`)
// reproduces composition.ts's dock/undock/persist wiring over the neutral
// World, and a fixture that re-implemented serialization would prove nothing
// about the real round trip the rehydration spec exists to witness. Both
// modules are otherwise consumed only by `composition.ts` itself.
export * from "#/layout/workspaceLayoutPersistence";
export * from "#/layout/workspacePersistenceWriter";
