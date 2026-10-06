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
export {
  bootCore,
  formatBootedMessage,
  renderBootError,
  runBoot,
} from "#/bootApp";
export {
  type Composition,
  type CoreHost,
  type CoreHostState,
  type CoverTimings,
  createCoreHost,
} from "#/coreHost";
export {
  CORE_OPTIONS,
  clearCoreChoice,
  defaultCoreResetHref,
  loadCore,
  safeLocalStorage,
  saveCoreChoice,
  urlWithoutCoreParam,
} from "#/coreSelection";
export { followCoreSwaps } from "#/coreSwapCover";
export { type CoreSwapView, coreSwapOf } from "#/coreSwapView";
export { chooseCoverTimings, type MotionSettings } from "#/coverTimings";
export { PRESENTER_MANIFEST } from "#/devtools/presenterManifest";
export { MediaQueryColorSchemeAdapter } from "#/theme/MediaQueryColorSchemeAdapter";
