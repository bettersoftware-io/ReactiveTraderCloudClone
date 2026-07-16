import { CreditBlotter } from "#/ui/credit/blotter/CreditBlotter";
import { NewRfqPanel } from "#/ui/credit/newRfq/NewRfqPanel";
import { RfqsPanel } from "#/ui/credit/rfqs/RfqsPanel";
import { SellSidePanel } from "#/ui/credit/sellSide/SellSidePanel";
import { AnalyticsPanel } from "#/ui/fx/analytics/AnalyticsPanel";
import { FxBlotter } from "#/ui/fx/blotter/FxBlotter";
import { LiveRatesPanel } from "#/ui/fx/liveRates/LiveRatesPanel";
import { PositionsPanel } from "#/ui/fx/positions/PositionsPanel";

import type { PanelRegistry } from "./panelRegistry";

/** The three-panel credit dock has no view to redirect back to once an RFQ is
 * created (unlike the old tabbed CreditWorkspace) — New RFQ stays docked, so
 * the submission machine's post-confirm onRedirect (a navigation hook) is a
 * no-op here. The form's own reset back to an empty draft does NOT depend on
 * onRedirect — it's driven by the confirmed→editing transition that the
 * submission machine (RfqsPresenter.createSubmission) and NewRfqPanel both
 * react to independently, so it still fires correctly even though onRedirect
 * itself goes nowhere. Mirrors the react `appPanelRegistry.tsx`'s own noop. */
function noop(): void {}

/** The real id→module-root map. Panel ids are owned by defaultLayoutPort;
 * each maps to the same module root the react `appPanelRegistry.tsx` uses.
 *
 * FX + Credit so far (Tasks 13-14): Equities/Admin panel modules don't exist
 * in `@rtc/client-solid` yet — their entries land with Tasks 15-16, mirroring
 * the react registry's full id set at that point. Until then, App.tsx keeps
 * every non-FX/non-Credit tab on its own `pending-panel` placeholder rather
 * than mounting this registry for them. */
export const appPanelRegistry: PanelRegistry = {
  "fx-rates": () => {
    return <LiveRatesPanel />;
  },
  "fx-analytics": () => {
    return <AnalyticsPanel />;
  },
  "fx-positions": () => {
    return <PositionsPanel />;
  },
  "fx-blotter": () => {
    return <FxBlotter />;
  },
  "credit-new-rfq": () => {
    return <NewRfqPanel onCreated={noop} />;
  },
  "credit-rfqs": () => {
    return <RfqsPanel />;
  },
  "credit-blotter": () => {
    return <CreditBlotter />;
  },
  "credit-sell-side": () => {
    return <SellSidePanel />;
  },
};
