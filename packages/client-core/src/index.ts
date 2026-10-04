// The ports every application core consumes, and what a client imports
// statically to build them: adapters, port factories and stores. No
// application core lives here and none is imported — a core is a sibling
// package that receives these ports as arguments (dependency-cruiser's
// `client-core-stays-inner`). Nor does anything here re-export another
// package's name: a contract type comes from `@rtc/core-api`, a shared rule
// from `@rtc/core-logic` (`tests/scripts/lib/packageSurfaces.test.ts`).

export * from "#/adapters/connectionIntents";
export * from "#/adapters/dataSource";
export * from "#/adapters/HttpAuthAdapter";
export * from "#/adapters/InMemoryDataSourceStore";
export * from "#/adapters/InMemorySessionStore";
export * from "#/adapters/portFactory";
export * from "#/adapters/RoutingAuthPort";
export * from "#/adapters/routeIdleLifecycle";
export * from "#/adapters/ScriptedJarvisAdapter";
export * from "#/adapters/WsAdapter";
export * from "#/adapters/WsConnectionEventsAdapter";
export * from "#/wsUrl";
