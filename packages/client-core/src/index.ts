// The root index is the EDGE: what a client imports statically — adapters,
// port factories, stores and pure helpers, all declared in this package. The
// RxJS core itself (the composition root, every presenter class, every machine
// factory) is exported only from the `@rtc/client-core/core` subpath, which
// the web clients reach through a lazy `import()` (see `src/core.ts`). A
// bundler keeps every module the entry reaches statically in the entry chunk,
// so nothing here may lead into `presenters/` or `composition.ts` —
// dependency-cruiser's `client-core-root-is-the-edge` and
// `core.publicApi.test.ts` both pin it. Nor does anything here re-export
// another package's name: a contract type comes from `@rtc/core-api`, a shared
// rule from `@rtc/core-logic` (`tests/scripts/lib/packageSurfaces.test.ts`).

export * from "#/adapters/connectionIntents";
export * from "#/adapters/dataSource";
export * from "#/adapters/delayedAuthPort";
export * from "#/adapters/HttpAuthAdapter";
export * from "#/adapters/InMemoryDataSourceStore";
export * from "#/adapters/InMemorySessionStore";
export * from "#/adapters/portFactory";
export * from "#/adapters/RoutingAuthPort";
export * from "#/adapters/routeIdleLifecycle";
export * from "#/adapters/ScriptedJarvisAdapter";
export * from "#/adapters/WsAdapter";
export * from "#/adapters/WsConnectionEventsAdapter";
export * from "#/admin/adminKpisVm";
export * from "#/blotter/index";
export * from "#/layout/index";
export * from "#/wsUrl";
