import type { Accessor } from "solid-js";

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
 * itself goes nowhere. Mirrors the react `appPanelRegistry.tsx`'s own noop. */
function noop(): void {}

/** The real id→module-root map. Panel ids are owned by defaultLayoutPort;
 * each maps to the same module root the react `appPanelRegistry.tsx` uses.
 *
 * All four domains present (Tasks 13-16) — the full id set mirrors the react
 * registry's exactly; every tab mounts this registry through its own
 * workspace in App.tsx. */
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
 * (`{ ...appPanelRegistry, ...dockedRegistryFor(dockedIds, dockedPanels) }`).
 *
 * Takes the DOCKED ID SET (`dockedIds: readonly string[]`, `App.tsx`'s
 * `dockedIds` memo — value-stable across a same-membership tick), NOT the
 * `JarvisPanelVm` row array — see the identity-churn fix documented on
 * `App.tsx`'s `registry` memo for why: this function's OUTPUT is a map of
 * COMPONENT-PRODUCING closures rendered through a tracked JSX insert
 * position in `InhouseLayoutEngine`, so its own identity churning on every
 * unrelated panels-machine tick would remount every leaf in the tree, not
 * just a docked one.
 *
 * Each closure captures only the stable `panelId` plus the `dockedPanels`
 * ACCESSOR itself (a function reference, never re-created — passing it does
 * NOT establish a dependency the way calling it would) — `JarvisDockedPanelBody`
 * does its OWN reactive lookup into `dockedPanels()` by id, so a restyle
 * ("make it a table") updates that one already-mounted leaf's body in
 * place, without this registry (or `App.tsx`'s `registry` memo) ever
 * needing to change. */
export function dockedRegistryFor(
  dockedIds: readonly string[],
  dockedPanels: Accessor<readonly JarvisPanelVm[]>,
): PanelRegistry {
  const entries = dockedIds.map((panelId) => {
    return [
      panelId,
      () => {
        return (
          <JarvisDockedPanelBody
            panelId={panelId}
            dockedPanels={dockedPanels}
          />
        );
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
 * desk panel does not set it.)
 *
 * `specs` is plain data, not a component map, so (unlike `dockedRegistryFor`
 * above) its own identity churning is harmless for remounting — but it
 * takes the same `dockedIds` + an UNTRACKED `dockedPanels` snapshot shape
 * for consistency with the fix's uniform identity story (see `App.tsx`'s
 * `specs` memo doc): `title` is captured once per membership change, not
 * kept live — the docked head's own reactive title lookup is what stays
 * live for a title rename while docked; this fallback is read only by the
 * engine's own generic maximize/collapse aria-labels. */
export function dockedSpecsFor(
  dockedIds: readonly string[],
  dockedPanels: readonly JarvisPanelVm[],
): Readonly<Record<PanelId, PanelSpec>> {
  const entries = dockedIds.map((panelId) => {
    const panel = dockedPanels.find((row) => {
      return row.panelId === panelId;
    });
    return [panelId, { id: panelId, title: panel?.title ?? panelId }] as const;
  });
  return Object.fromEntries(entries);
}
