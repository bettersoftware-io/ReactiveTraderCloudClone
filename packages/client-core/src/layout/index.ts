export * from "#/layout/defaultLayoutPort";
// Only the design-width constant is public — `dockColumn.ts`'s leaf
// insert/remove helpers stay internal to LayoutMachine/workspace persistence;
// the Dockview bridges (client-react, client-solid) need the SAME 360px pin
// a seeded rail's `initialPx` uses, for a Jarvis panel opened at runtime via
// `DockEngine.addDynamicPanel`.
export { DOCK_COLUMN_INITIAL_PX } from "#/layout/dockColumn";
export * from "#/layout/layoutPort";
export * from "#/layout/maximizeBoundary";
// The workspace-persistence pair is public for one reason: each web client's
// ui-contract fixture (`tests/ui/contract/<framework>/viewModelFromWorld.ts`)
// reproduces composition.ts's dock/undock/persist wiring over the neutral
// World, and a fixture that re-implemented serialization would prove nothing
// about the real round trip the rehydration spec exists to witness. Both
// modules are otherwise consumed only by `composition.ts` itself.
export * from "#/layout/workspaceLayoutPersistence";
export * from "#/layout/workspacePersistenceWriter";
