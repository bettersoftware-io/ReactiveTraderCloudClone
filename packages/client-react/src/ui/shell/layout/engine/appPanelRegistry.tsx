import type { JarvisPanelVm, PanelId, PanelSpec } from "@rtc/client-core";

import { AdminDashboard } from "#/ui/admin/AdminDashboard";
import { CreditBlotter } from "#/ui/credit/blotter/CreditBlotter";
import { NewRfqPanel } from "#/ui/credit/newRfq/NewRfqPanel";
import { RfqsPanel } from "#/ui/credit/rfqs/RfqsPanel";
import { SellSidePanel } from "#/ui/credit/sellSide/SellSidePanel";
import { EqBlotterPanel } from "#/ui/equities/blotter/EqBlotterPanel";
import { ChartPanel } from "#/ui/equities/chart/ChartPanel";
import { EqDepthDock } from "#/ui/equities/chart/EqDepthDock";
import { OrderTicket } from "#/ui/equities/ticket/OrderTicket";
import { EqSectorsDock } from "#/ui/equities/watchlist/EqSectorsDock";
import { WatchlistPanel } from "#/ui/equities/watchlist/WatchlistPanel";
import { AnalyticsPanel } from "#/ui/fx/analytics/AnalyticsPanel";
import { FxBlotter } from "#/ui/fx/blotter/FxBlotter";
import { LiveRatesPanel } from "#/ui/fx/liveRates/LiveRatesPanel";
import { PositionsPanel } from "#/ui/fx/positions/PositionsPanel";
import { JarvisDockedPanelBody } from "#/ui/shell/jarvis/panels/JarvisDockedPanelBody";

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
  "eq-chart": () => {
    return <ChartPanel />;
  },
  "eq-blotter": () => {
    return <EqBlotterPanel />;
  },
  "eq-ticket": () => {
    return <OrderTicket />;
  },
  "eq-watchlist": () => {
    return <WatchlistPanel />;
  },
  // eq-depth / eq-sectors are registered but not placed in the default
  // four-panel tree (they survive outside it, mounted directly by their own
  // contract/visual specs); these dock wrappers feed them the shared
  // eqWorkspace selection for when the app registry does mount them.
  "eq-depth": () => {
    return <EqDepthDock />;
  },
  "eq-sectors": () => {
    return <EqSectorsDock />;
  },
};

/** The DYNAMIC id→component slice for the currently DOCKED desk panels —
 * merged with `appPanelRegistry` above in `App.tsx`'s `WorkspaceEngine`
 * (`{ ...appPanelRegistry, ...dockedRegistryFor(dockedPanels) }`), rebuilt
 * fresh every render from the live `dockedPanels` VM list (cheap: plain
 * object literals over ≤`MAX_DOCKED_PANELS` entries), so a dock/undock or a
 * live spec edit is reflected without any manual invalidation. Each entry
 * closes over its own `JarvisPanelVm` row rather than re-deriving it by id
 * inside `JarvisDockedPanelBody` — see that component's doc. */
export function dockedRegistryFor(
  dockedPanels: readonly JarvisPanelVm[],
): PanelRegistry {
  const entries = dockedPanels.map((panel) => {
    return [
      panel.panelId,
      () => {
        return <JarvisDockedPanelBody panel={panel} />;
      },
    ] as const;
  });
  return Object.fromEntries(entries);
}

/** The DYNAMIC `specs` slice for the currently docked panels — merged with
 * `PANEL_SPECS` (`@rtc/client-core`) the same way `dockedRegistryFor` merges
 * with `appPanelRegistry`. `InhouseLayoutEngine` reads `specs[panelId]` for
 * the head's title fallback, `maximizable`, and `maximizeScope`; a docked
 * desk panel accepts every default (full-dock maximize, maximizable) —
 * just `{id, title}`, mirroring `PANEL_SPECS`'s own static entries. (Note:
 * `PanelSpec.pinned?: boolean` is an UNRELATED existing flag — "kept out of
 * a resizable split's sizing" — not this L3 "docked" concept; a docked
 * desk panel does not set it.) */
export function dockedSpecsFor(
  dockedPanels: readonly JarvisPanelVm[],
): Readonly<Record<PanelId, PanelSpec>> {
  const entries = dockedPanels.map((panel) => {
    return [panel.panelId, { id: panel.panelId, title: panel.title }] as const;
  });
  return Object.fromEntries(entries);
}
