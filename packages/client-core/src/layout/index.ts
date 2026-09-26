// The saved-layouts controller is public for the same reason the
// workspace-persistence writer below is: each web client's ui-contract fixture
// reproduces composition.ts's wiring over the neutral World, and a fixture
// that re-implemented the preset rules would prove nothing about the real
// ones. Otherwise consumed only by `composition.ts`.
export * from "#/layout/createLayoutPresets";
export * from "#/layout/layoutPresets";
export * from "#/layout/maximizeBoundary";
export * from "#/layout/visibleRoot";
// The persistence writer is public for the ui-contract fixtures
// (`tests/ui/contract/<framework>/viewModelFromWorld.ts`), which reproduce
// composition.ts's dock/undock/persist wiring over the neutral World; its
// serialization half now lives in @rtc/core-logic (slice 8).
export * from "#/layout/workspacePersistenceWriter";
