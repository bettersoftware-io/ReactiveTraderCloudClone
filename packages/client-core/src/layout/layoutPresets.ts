/** Lives in `@rtc/core-api` (Phase 6b layout presets, Task 4) — re-exported
 * here so `@rtc/ui-contract` and both web clients can name these types via
 * `@rtc/client-core` without adding a new dependency edge, mirroring
 * `../adapters/dockLayoutStore.ts`'s re-export of `DockLayoutStore`. */
export type {
  LayoutPresetNameProblem,
  LayoutPresetSummary,
  LayoutPresetsPresenter,
  SaveLayoutPresetOptions,
  SaveLayoutPresetResult,
} from "@rtc/core-api";
