import type { ReactNode } from "react";

import { Blotter } from "#/ui/Blotter";
import { ConnectionBanner } from "#/ui/ConnectionBanner";

import type { Scenario } from "./driver";
import { VisualScenarioHost } from "./VisualScenarioHost";

/**
 * Rehaul Phase 1 amendment A3: the module screens the base plan originally
 * pinned (`fx/tile-up-holo3d` etc.) are rebuilt in Phases 4-6, so pinning
 * their goldens now would churn immediately. These three "prove-the-harness"
 * fixtures exist on `main` today and render deterministically on sim ports —
 * each is a leaf whose default sim-port state carries no `Math.random()` or
 * live-ticking data (verified against the domain simulators):
 *
 * - `blotter/seeded` — the Blotter tab on sim ports. On-device capture
 *   (rehaul Phase 1 driver-tier verification) found this is NOT empty:
 *   `TradeStoreSimulator` (`packages/domain/src/simulators/TradeStoreSimulator.ts`)
 *   pre-seeds 5 trades at construction time — EURUSD Buy Done, USDJPY Sell
 *   Done, GBPUSD Buy Rejected, EURJPY Sell Done, AUDUSD Buy Done — so the
 *   default state is always the populated list, not "No trades yet". The
 *   seed is a static literal array (no `Math.random`, no live ticking), so
 *   the populated list is exactly as deterministic as an empty one would
 *   have been — renamed to match reality rather than forcing an artificial
 *   empty premise.
 * - `shell/connection-banner` — the connection-status pill. The simulator's
 *   `ConnectionEventsPort` (built fresh per host mount, not the shared
 *   `ConnectionEventsSimulator` used by the real app) emits a single
 *   synchronous `gatewayConnected`, so the pill always settles on "Live".
 * A third fixture, `credit/rfq-tiles-empty`, was TRIED and DROPPED: on-device
 * golden verification proved it non-deterministic. `CreditRfqSimulator` emits
 * NEW Live RFQs over time, so the default "No RFQs to display" view is only
 * momentary — re-capture diffs swung 0.7% ↔ 11.9% against a fixed golden
 * (static analysis had wrongly assumed the seed RFQs stay terminal). Restore a
 * Credit fixture only behind a frozen-clock / cascade-disabled harness variant.
 *
 * Explicitly avoided: the Rates tab (`PricingSimulator` ticks with
 * `Math.random`), Analytics (`AnalyticsSimulator`'s P&L history is seeded with
 * a `Math.random` walk at construction), and the Appearance sheet (owned by
 * the parallel Phase 2's Task 9, not this phase — A4).
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: "blotter/seeded",
    skin: "holo3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="holo3d" mode="dark">
          <Blotter />
        </VisualScenarioHost>
      );
    },
  },
  {
    id: "shell/connection-banner",
    skin: "classic",
    mode: "light",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="classic" mode="light">
          <ConnectionBanner />
        </VisualScenarioHost>
      );
    },
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => {
    return s.id === id;
  });
}
