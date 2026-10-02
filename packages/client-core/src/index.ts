// The shared rxjs-free rules (pluggable-core slice 8), re-exported so every
// existing `import … from "@rtc/client-core"` keeps working.

/** Re-exported for the consumers that import these from `@rtc/client-core`;
 * they are `@rtc/core-api` types. The composition root itself (`createApp`,
 * `createMachineFactories`, `rxjsCore`) is NOT exported here — only from the
 * `@rtc/client-core/core` subpath, so the web clients reach it solely through
 * a lazy `import()` (approach B; see `src/core.ts`). */
export type {
  App,
  AppCommands,
  AppPorts,
  CoreFactory,
  Presenters,
} from "@rtc/core-api";
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
export * from "#/blotter/index";
export * from "#/layout/index";
export * from "#/presenters/index";
export * from "#/theme/colorSchemeSource";
export * from "#/wsUrl";
