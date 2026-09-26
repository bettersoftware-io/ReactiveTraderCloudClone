export * from "#/adapters/authDeps";
export * from "#/adapters/dockLayoutStore";
export * from "#/adapters/InMemoryDockLayoutStore";
export * from "#/adapters/InMemoryLayoutPresetStore";
export * from "#/adapters/layoutPresetStore";
export * from "#/layout/defaultLayoutPort";
// The design-width constant is public because the Dockview bridges
// (client-react, client-solid) need the SAME 360px pin a seeded rail's
// `initialPx` uses, for a Jarvis panel opened at runtime via
// `DockEngine.addDynamicPanel`. The two leaf helpers are public only because
// client-core's layout tests use them across the package boundary (slice 8);
// the remove/other helpers stay internal to the layout rules.
export {
  DOCK_COLUMN_INITIAL_PX,
  dockedLeafIds,
  insertDockedLeaf,
} from "#/layout/dockColumn";
export * from "#/layout/layoutPort";
export * from "#/layout/layoutPresetCodec";
export * from "#/layout/layoutPresetsController";
export * from "#/layout/layoutReducer";
// The instance id/cap pair is public (both web clients' watchlist + Dockview
// bridge read them); the namespace predicate stays internal to the layout
// rules' own id-collision guard.
export { instanceIdFor, MAX_PANEL_INSTANCES } from "#/layout/panelInstances";
export * from "#/layout/workspaceDock";
// Public for the ui-contract fixtures: each web client's
// `viewModelFromWorld.ts` reproduces composition.ts's dock/undock/persist
// wiring over the neutral World, and a fixture that re-implemented
// serialization would prove nothing about the real round trip.
export * from "#/layout/workspaceLayoutPersistence";
export * from "#/layout/workspaceLayoutWrite";
export * from "#/presenters/adminFolds";
export * from "#/presenters/blotterFolds";
export * from "#/presenters/candleStitch";
export * from "#/presenters/eqDrawingsFold";
export * from "#/presenters/eqWorkspaceFold";
export * from "#/presenters/incidentFold";
export * from "#/presenters/jarvisController";
export * from "#/presenters/jarvisDemoScript";
export * from "#/presenters/jarvisDriveCommands";
export * from "#/presenters/jarvisGuideCatalog";
export * from "#/presenters/jarvisPanelsFolds";
export * from "#/presenters/machine";
export * from "#/presenters/narratorGate";
export * from "#/presenters/notionalView";
export * from "#/presenters/orderTicketFold";
export * from "#/presenters/panelFrames";
export * from "#/presenters/panelStreamDeps";
export * from "#/presenters/shallowArrayEquals";
export * from "#/presenters/shellFolds";
export * from "#/presenters/staleFlagFold";
export * from "#/presenters/tileExecutionState";
