import type { ViewModel } from "@rtc/react-bindings";

import { analyticsSlice } from "./fake/analytics";
import { blotterSlice } from "./fake/blotter";
import { creditSlice } from "./fake/credit";
import { equitiesSlice } from "./fake/equities";
import { inertSlice } from "./fake/inert";
import { ratesSlice } from "./fake/rates";
import { buildShellSlice, type ShellSliceOptions } from "./fake/shell";

/**
 * The static `ViewModel` every visual scenario renders against.
 *
 * **Why this exists.** `VisualScenarioHost` used to compose a real app per
 * scenario — `createApp(createSimulatorPorts(…))` — and simulators tick.
 * `EquityMarketDataSimulator` walks its quotes on a live 500 ms `interval`,
 * `AnalyticsSimulator` seeds its P&L history from `Math.random`. Each time a
 * golden turned out to be unreproducible the fix was another per-simulator pin
 * (`pricingPinMs`, `blotterSeedBaseMs`, `pinnedRemainingMs`, a pinned `now`
 * threaded into `BootSceneProps`) — one patch per source of movement, each
 * added only after a capture had already proved unstable, and two scenarios
 * (`equities/markets`, `equities/trade`) left with no golden at all because
 * the equities simulator exposed no pin to add.
 *
 * A screenshot needs no live data. Replacing the composition with fixed
 * snapshots makes determinism **structural** rather than a property somebody
 * has to remember to preserve: there is no clock and no RNG in this directory
 * for a pin to be missing from, and `buildFakeViewModel.test.tsx` greps for
 * one so it stays that way.
 *
 * The components themselves needed no change. `src/ui` is already dumb — it is
 * grep-gated free of `rxjs`, `Date`, `localStorage`, `fetch`, `setTimeout` and
 * `setInterval` — so all the non-determinism lived on the far side of this one
 * seam. That is the clean-architecture claim being cashed in.
 *
 * The web client has worked this way from the start; see its sibling at
 * `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`.
 *
 * **The return type is `ViewModel`, with no cast.** The seven slices are
 * `Pick<ViewModel, …>` over a verified partition of all 67 hooks, so this
 * spread only compiles when every hook is present. A cast here would turn a
 * dropped hook into a runtime `undefined is not a function` during capture —
 * one scenario rendering blank, which is entirely plausible-looking in a list
 * of 21 filenames.
 */
export function buildFakeViewModel(
  options: FakeViewModelOptions = {},
): ViewModel {
  const { overrides, ...shellOptions } = options;

  return {
    ...inertSlice,
    ...buildShellSlice(shellOptions),
    ...blotterSlice,
    ...ratesSlice,
    ...creditSlice,
    ...equitiesSlice,
    ...analyticsSlice,
    ...overrides,
  };
}

export interface FakeViewModelOptions extends ShellSliceOptions {
  /**
   * Per-scenario hook replacements, applied last so a scenario can pin a state
   * the shared fixtures do not cover — an error arm, an empty collection, a
   * specific machine phase.
   *
   * `Partial<ViewModel>` rather than a bespoke type: every key is checked
   * against the real hook signature, so a scenario cannot pin a shape the
   * component would reject.
   */
  readonly overrides?: Partial<ViewModel>;
}
