// Neutral manifest: a scenario name maps to a component key (resolved per
// framework by registry.tsx) and a fixture key (resolved from fixtures.ts).
export interface Scenario {
  readonly componentKey: string;
  readonly fixtureKey: string;
}

export const scenarios: Record<string, Scenario> = {
  "connection-status/connected": {
    componentKey: "ConnectionStatusBar",
    fixtureKey: "connection-connected",
  },
  "connection-status/disconnected": {
    componentKey: "ConnectionStatusBar",
    fixtureKey: "connection-disconnected",
  },
  "tile/eurusd-up": { componentKey: "Tile", fixtureKey: "tile-eurusd-up" },
  "tile/loading": { componentKey: "Tile", fixtureKey: "tile-loading" },
};
