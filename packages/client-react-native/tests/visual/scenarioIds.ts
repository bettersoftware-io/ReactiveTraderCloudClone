/**
 * The visual-harness scenario ids — the pure, Node-safe source of truth the
 * `simctl` / Maestro runners iterate.
 *
 * Kept free of ANY React Native import: the tsx/Node runners load this file
 * directly, whereas importing the full `scenarios.tsx` registry pulls RN leaf
 * components (Blotter, ConnectionBanner, …) that esbuild cannot transform
 * outside Metro (react-native's flow-typed `index.js` throws
 * "Unexpected typeof"). `scenarios.tsx` builds its registry against these ids
 * and `scenarios.test.tsx` asserts the two stay in sync.
 */
export const SCENARIO_IDS = [
  "blotter/seeded",
  "shell/connection-banner",
  // Phase 2 Task 9: the pinned Appearance sheet — ambient frozen via
  // VisualScenarioHost's `forceReduceMotion`.
  "shell/appearance",
  // NB: `credit/rfq-tiles-empty` was dropped after on-device golden
  // verification — it is NON-deterministic. `CreditRfqSimulator` emits new
  // Live RFQs over time, so the default "No RFQs to display" view is only
  // momentary (re-capture diffs swung 0.7% ↔ 11.9% vs a fixed golden). The two
  // fixtures above are rock-stable (0.02%). Restore a Credit fixture only with
  // a frozen-clock / cascade-disabled harness variant.
  // Phase 6a Task 10: the two ported boot scenes and the static-splash
  // fallback, each pinned to a fixed `elapsedSec`/state rather than mounted
  // live — see `scenarios.tsx`'s header comment for why a free-running boot
  // canvas can never be a stable golden.
  "boot/core",
  "boot/laser",
  // Phase 6b-1 Task 10: the `docking` boot scene, pinned to the same shared
  // `BOOT_SCENE_ELAPSED_SEC` as `boot/core`/`boot/laser` — see
  // `scenarios.tsx`'s header comment for why that instant still lands well.
  "boot/docking",
  // Phase 6b-2a Tasks 5/8: the two projected-3D scenes, on the same shared
  // `BOOT_SCENE_ELAPSED_SEC`. That instant is mid-boot, which for these two is
  // deliberately the busiest frame rather than a convenient one — `hologram`
  // has columns still assembling AND risen columns drawn together, and
  // `layers` is inside its inspection window with a panel pulled out. A
  // quieter instant would leave most of both scenes uncovered by the golden.
  "boot/hologram",
  "boot/layers",
  "boot/static",
  // Phase 6a Task 9: the hold-to-unlock ring at a fixed mid-fill progress.
  "lock/hold",
] as const;
