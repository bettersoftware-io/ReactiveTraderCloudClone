// The root index is the EDGE: what a client imports statically — adapters,
// port factories, stores, pure helpers, and types. The RxJS core itself (the
// composition root, every presenter class, every machine factory) is exported
// only from the `@rtc/client-core/core` subpath, which the web clients reach
// through a lazy `import()` (see `src/core.ts`). A bundler keeps every module
// the entry reaches statically in the entry chunk, so no VALUE export here may
// lead into `presenters/` or `composition.ts` — dependency-cruiser's
// `client-core-root-is-the-edge` and `core.publicApi.test.ts` both pin it.

/** Re-exported for the consumers that import these from `@rtc/client-core`;
 * they are `@rtc/core-api` types. */
export type {
  App,
  AppCommands,
  AppPorts,
  CoreFactory,
  Presenters,
} from "@rtc/core-api";
// The shared rxjs-free rules (pluggable-core slice 8).
export * from "@rtc/core-logic";

export * from "#/adapters/connectionIntents";
export * from "#/adapters/dataSource";
export * from "#/adapters/delayedAuthPort";
export * from "#/adapters/HttpAuthAdapter";
export * from "#/adapters/InMemoryDataSourceStore";
export * from "#/adapters/InMemorySessionStore";
export * from "#/adapters/IWsAdapter";
export * from "#/adapters/jarvisPort";
export * from "#/adapters/jarvisUsagePort";
export * from "#/adapters/portFactory";
export * from "#/adapters/RoutingAuthPort";
export * from "#/adapters/routeIdleLifecycle";
export * from "#/adapters/ScriptedJarvisAdapter";
export * from "#/adapters/sessionStore";
export * from "#/adapters/WsAdapter";
export * from "#/adapters/WsConnectionEventsAdapter";
export * from "#/admin/adminKpisVm";
export * from "#/blotter/index";
export * from "#/layout/index";
// Types only: the presenter and machine TYPES the UI names, at no runtime cost.
export type * from "#/presenters/index";
export * from "#/theme/colorSchemeSource";
export * from "#/wsUrl";
