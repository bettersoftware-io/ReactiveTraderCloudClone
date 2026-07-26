import type { ComponentType, ReactElement } from "react";
import { describe, expect, it } from "vitest";

import type { PanelId } from "@rtc/client-core";

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

import { appPanelRegistry } from "../appPanelRegistry";

// appPanelRegistry is pure wiring: panel id -> module root. A swapped pair
// yields a completely plausible-looking app showing the wrong module in two
// panels, which no rendering test detects — both panels render fine.
//
// WHY THIS EXISTS EVEN THOUGH THE FILE ALREADY READ 100%. The shared contract
// specs drive every thunk here, because React evaluates `registry[panelId]?.()`
// eagerly while rendering the layout — so istanbul saw the file fully covered.
// That coverage is INCIDENTAL: it proves each thunk ran, never that any of them
// returns the right module. Swap two entries and the number stays 100% and the
// suite stays green. The solid twin made this visible: its fine-grained JSX
// defers the same expression, so the identical file sat at 56% until
// client-solid/src/ui/shell/layout/engine/__tests__/appPanelRegistry.test.ts
// was written — and the assertions that closed it are the ones missing here.
//
// Registry entries are `() => <Panel />` element descriptors, so CALLING one
// builds a React element without rendering it — no hooks run, no ViewModel
// provider needed, and component IDENTITY is directly assertable.

const expected: ReadonlyArray<readonly [PanelId, ComponentType<never>]> = [
  ["fx-rates", LiveRatesPanel],
  ["fx-analytics", AnalyticsPanel],
  ["fx-positions", PositionsPanel],
  ["fx-blotter", FxBlotter],
  ["credit-new-rfq", NewRfqPanel],
  ["credit-rfqs", RfqsPanel],
  ["credit-blotter", CreditBlotter],
  ["credit-sell-side", SellSidePanel],
  ["admin-dashboard", AdminDashboard],
  ["eq-chart", ChartPanel],
  ["eq-blotter", EqBlotterPanel],
  ["eq-ticket", OrderTicket],
  ["eq-watchlist", WatchlistPanel],
  ["eq-depth", EqDepthDock],
  ["eq-sectors", EqSectorsDock],
];

describe("appPanelRegistry", () => {
  it.each(expected)("maps %s to its own module root", (panelId, panel) => {
    const entry = appPanelRegistry[panelId];

    expect(entry).toBeTypeOf("function");
    expect((entry() as ReactElement).type).toBe(panel);
  });

  it("wires exactly the expected panel ids and no others", () => {
    // PanelRegistry is a total Record<PanelId, …>, so TypeScript already
    // rejects a MISSING id. What this adds is the reverse tripwire: a newly
    // introduced PanelId lands in the registry typed-clean but unasserted, and
    // this fails until someone states which module root it should mount.
    expect(Object.keys(appPanelRegistry).sort()).toEqual(
      expected
        .map(([panelId]) => {
          return panelId;
        })
        .sort(),
    );
  });

  it("gives every panel a distinct module root", () => {
    const roots = expected.map(([panelId]) => {
      return (appPanelRegistry[panelId]() as ReactElement).type;
    });

    // A copy-paste slip pointing two ids at one module is the likeliest failure
    // here, and it is invisible in any single-panel assertion.
    expect(new Set(roots).size).toBe(expected.length);
  });

  it("hands New RFQ an onCreated callback", () => {
    // Deliberately a noop (the three-panel credit dock has nowhere to redirect
    // after a create) — but it must still be PASSED: NewRfqPanel requires the
    // prop, so dropping it breaks that one panel while every other entry
    // keeps working.
    const element = appPanelRegistry[
      "credit-new-rfq"
    ]() as ReactElement<NewRfqProps>;

    expect(element.props.onCreated).toBeTypeOf("function");
  });

  it("returns a fresh element per call, never a cached node", () => {
    const first = appPanelRegistry["fx-rates"]();
    const second = appPanelRegistry["fx-rates"]();

    // The engine may mount a panel more than once (maximize/restore remounts
    // it); a shared element instance would be a latent aliasing bug.
    expect(first).not.toBe(second);
  });
});

interface NewRfqProps {
  onCreated: unknown;
}
