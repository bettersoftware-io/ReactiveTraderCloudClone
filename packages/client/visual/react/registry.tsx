import type { ReactElement } from "react";
import { ConnectionStatusBar } from "../../src/ui/shell/connection/ConnectionStatusBar";
import { Tile } from "../../src/ui/fx/liveRates/tile/Tile";
import { AnalyticsPanel } from "../../src/ui/fx/analytics/AnalyticsPanel";
import { ConnectionOverlay } from "../../src/ui/shell/connection/ConnectionOverlay";
import { LiveRatesPanel } from "../../src/ui/fx/liveRates/LiveRatesPanel";
import { App } from "../../src/ui/App";
import { fixtures } from "../shared/fixtures";

// Maps a neutral componentKey to a concrete React element, given the scenario's
// fixture key so prop-bearing components can pull their props from the data.
// The SolidJS port supplies its own registry with the same keys.
export const registry: Record<string, (fixtureKey: string) => ReactElement> = {
  ConnectionStatusBar: () => <ConnectionStatusBar />,
  Tile: (fixtureKey) => {
    const pair = fixtures[fixtureKey].currencyPairs[0];
    return <Tile pair={pair} showChart={false} />;
  },
  AnalyticsPanel: () => <AnalyticsPanel />,
  ConnectionOverlay: () => <ConnectionOverlay />,
  LiveRatesPanel: () => <LiveRatesPanel />,
  App: () => <App />,
};
