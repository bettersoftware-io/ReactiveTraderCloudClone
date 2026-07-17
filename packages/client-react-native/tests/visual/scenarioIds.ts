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
] as const;
