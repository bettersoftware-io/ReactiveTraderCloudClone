// @rtc/web-boot: the boot code both web clients share.

export { BrowserConnectionEventsAdapter } from "#/adapters/BrowserConnectionEventsAdapter";
export { LocalStorageDataSourceStore } from "#/adapters/LocalStorageDataSourceStore";
export { LocalStorageDockLayoutStore } from "#/adapters/LocalStorageDockLayoutStore";
export { LocalStorageLayoutPresetStore } from "#/adapters/LocalStorageLayoutPresetStore";
export {
  JARVIS_NARRATOR_STORAGE_KEY,
  LocalStoragePreferencesAdapter,
} from "#/adapters/LocalStoragePreferencesAdapter";
export {
  LocalStorageSessionStore,
  SESSION_STORAGE_KEY,
} from "#/adapters/LocalStorageSessionStore";
export { createPathRouteHistory } from "#/adapters/PathRouteHistory";
export { runBoot } from "#/bootApp";
export {
  type BuildBrowserPortsOptions,
  buildBrowserPorts,
  readDemoAccounts,
} from "#/buildBrowserPorts";
export {
  type Composition,
  type CoreHost,
  type CoreHostState,
  type CoverTimings,
  createCoreHost,
} from "#/coreHost";
export { CORE_OPTIONS } from "#/coreSelection";
export { type CoreSwapView, coreSwapOf } from "#/coreSwapView";
export { INSTANT_COVER } from "#/coverTimings";
export {
  createDevtoolsHub,
  type DevtoolsHubOptions,
} from "#/devtools/createDevtoolsHub";
export { type BuildEnvValues, type WebBootEnv, webBootEnvOf } from "#/env";
export {
  startWebClient,
  type WebClientOptions,
  type WebClientPage,
  type WebClientView,
} from "#/startWebClient";
export { MediaQueryColorSchemeAdapter } from "#/theme/MediaQueryColorSchemeAdapter";
