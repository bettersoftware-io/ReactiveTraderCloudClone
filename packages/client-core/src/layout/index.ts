export * from "#/layout/defaultLayoutPort";
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
