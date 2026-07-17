import type { ReactNode } from "react";

import { Blotter } from "#/ui/Blotter";
import { ConnectionBanner } from "#/ui/ConnectionBanner";
import { RfqTilesPanel } from "#/ui/credit/rfqTiles/RfqTilesPanel";

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
 * - `blotter/empty` — the Blotter tab with zero executed trades. Sim ports
 *   never auto-execute a trade, so this is always the static "No trades yet"
 *   state.
 * - `shell/connection-banner` — the connection-status pill. The simulator's
 *   `ConnectionEventsPort` (built fresh per host mount, not the shared
 *   `ConnectionEventsSimulator` used by the real app) emits a single
 *   synchronous `gatewayConnected`, so the pill always settles on "Live".
 * - `credit/rfq-tiles-empty` — the RFQ tiles panel's default "Live" filter.
 *   `CreditRfqSimulator`'s seed data (RFQs 235/237/238) is all terminal
 *   (Closed/Cancelled), so the default Live-only view is always empty ("No
 *   RFQs to display"); its later-arriving dealer responses use `Math.random`,
 *   but they're never triggered here (no RFQ is created).
 *
 * Explicitly avoided: the Rates tab (`PricingSimulator` ticks with
 * `Math.random`), Analytics (`AnalyticsSimulator`'s P&L history is seeded with
 * a `Math.random` walk at construction), and the Appearance sheet (owned by
 * the parallel Phase 2's Task 9, not this phase — A4).
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: "blotter/empty",
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
  {
    id: "credit/rfq-tiles-empty",
    skin: "terminal3d",
    mode: "dark",
    build: (): ReactNode => {
      return (
        <VisualScenarioHost skin="terminal3d" mode="dark">
          <RfqTilesPanel />
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
