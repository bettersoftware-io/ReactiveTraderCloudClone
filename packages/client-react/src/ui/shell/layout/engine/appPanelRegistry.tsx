import { AdminDashboard } from "#/ui/admin/AdminDashboard";
import { CreditBlotter } from "#/ui/credit/blotter/CreditBlotter";
import { NewRfqPanel } from "#/ui/credit/newRfq/NewRfqPanel";
import { RfqsPanel } from "#/ui/credit/rfqs/RfqsPanel";
import { SellSidePanel } from "#/ui/credit/sellSide/SellSidePanel";
import { EquitiesPanel } from "#/ui/equities/EquitiesPanel";
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
 * itself goes nowhere. */
function noop(): void {}

/** The real id→module-root map. Panel ids are owned by defaultLayoutPort;
 * each maps to the same module root Workspace.tsx imported before the engine. */
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
  "admin-dashboard": () => {
    return <AdminDashboard />;
  },
  equities: () => {
    return <EquitiesPanel />;
  },
};
