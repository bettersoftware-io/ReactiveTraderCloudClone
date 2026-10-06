// @rtc/web-boot: the boot code both web clients share.

export { BrowserConnectionEventsAdapter } from "#/adapters/BrowserConnectionEventsAdapter";
export { LocalStorageDataSourceStore } from "#/adapters/LocalStorageDataSourceStore";
export { LocalStorageDockLayoutStore } from "#/adapters/LocalStorageDockLayoutStore";
export { LocalStorageLayoutPresetStore } from "#/adapters/LocalStorageLayoutPresetStore";
export {
  AMBIENT_STYLE_STORAGE_KEY,
  ANIMATED_BG_STORAGE_KEY,
  BOOT_VARIANT_STORAGE_KEY,
  CHART_SUBSTRATE_STORAGE_KEY,
  CREDIT_RFQ_FILTER_STORAGE_KEY,
  EQ_BLOTTER_VIEW_STORAGE_KEY,
  EQ_WATCHLIST_SORT_STORAGE_KEY,
  FORCE_BOOT_ANIMATION_STORAGE_KEY,
  JARVIS_BRAIN_STORAGE_KEY,
  JARVIS_EFFORT_STORAGE_KEY,
  JARVIS_NARRATOR_STORAGE_KEY,
  JARVIS_SKIN_STORAGE_KEY,
  LAYOUT_ENGINE_STORAGE_KEY,
  LOGIN_WAIT_DELAY_STORAGE_KEY,
  LOGIN_WAIT_STYLE_STORAGE_KEY,
  LOGIN_WAIT_VARIANT_STORAGE_KEY,
  LocalStoragePreferencesAdapter,
  POWER_SAVER_STORAGE_KEY,
  THEME_SKIN_STORAGE_KEY,
  THEME_STORAGE_KEY,
  VIEW_MODE_STORAGE_KEY,
  WORKSPACE_LAYOUT_STORAGE_KEY,
} from "#/adapters/LocalStoragePreferencesAdapter";
export {
  LocalStorageSessionStore,
  SESSION_STORAGE_KEY,
} from "#/adapters/LocalStorageSessionStore";
export {
  type BootEnv,
  type BootResult,
  bootCore,
  formatBootedMessage,
  renderBootError,
  runBoot,
} from "#/bootApp";
export {
  type Composition,
  type CoreHost,
  type CoreHostDeps,
  type CoreHostState,
  type CoverTimings,
  createCoreHost,
  DISPOSE_TIMEOUT_MS,
} from "#/coreHost";
export {
  CORE_CHOICE_KEY,
  CORE_OPTIONS,
  type CoreImporters,
  type CoreSelectionDeps,
  clearCoreChoice,
  createCoreSelection,
  defaultCoreResetHref,
  loadCore,
  readStoredChoice,
  resolveCoreChoice,
  safeLocalStorage,
  saveCoreChoice,
  urlWithoutCoreParam,
} from "#/coreSelection";
export { followCoreSwaps } from "#/coreSwapCover";
export { type CoreSwapView, coreSwapOf } from "#/coreSwapView";
export { chooseCoverTimings, type MotionSettings } from "#/coverTimings";
export { PRESENTER_MANIFEST } from "#/devtools/presenterManifest";
export { MediaQueryColorSchemeAdapter } from "#/theme/MediaQueryColorSchemeAdapter";
