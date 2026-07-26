import type { Component } from "solid-js";
import { describe, expect, it, vi } from "vitest";

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

// appPanelRegistry is pure wiring: panel id -> module root. As with the head
// registry, a swapped pair yields a completely plausible-looking app showing
// the wrong module in two panels — which no sociable render test detects,
// because both panels render fine.
//
// Coverage note: the react twin reaches 100% through the shared contract specs
// alone, because React evaluates `registry[panelId]?.()` eagerly while it
// renders. Solid's fine-grained JSX defers the same expression, so panels the
// specs never actually reveal leave their thunk uncalled — this file sat at
// 56% (9/16) for exactly that reason. Invoking every entry directly closes the
// gap AND asserts the mapping, which the react tier's incidental 100% does not.
//
// See ./appHeadRegistry.test.ts for why mocking `createComponent` is what makes
// identity assertable in Solid without rendering fifteen module roots.

// `Component<never>` rather than bare `Component` (= `Component<{}>`): NewRfqPanel
// takes a required prop, and parameter contravariance means only a `never` props
// type accepts every module root in one list.
const expected: ReadonlyArray<readonly [PanelId, Component<never>]> = [
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
    expect(createdBy(entry()).component).toBe(panel);
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
      return createdBy(appPanelRegistry[panelId]()).component;
    });

    expect(new Set(roots).size).toBe(expected.length);
  });

  it("hands New RFQ an onCreated callback", () => {
    // The three-panel credit dock has nowhere to redirect after a create, so
    // this is deliberately a noop (see appPanelRegistry.tsx) — but it must
    // still be PASSED: NewRfqPanel requires the prop, and dropping it would
    // break the panel at runtime while every other entry kept working.
    const { props } = createdBy(appPanelRegistry["credit-new-rfq"]());

    expect(props).toHaveProperty("onCreated");
    expect((props as { onCreated: unknown }).onCreated).toBeTypeOf("function");
  });

  it("returns a fresh result per call, never a cached node", () => {
    const first = appPanelRegistry["fx-rates"]();
    const second = appPanelRegistry["fx-rates"]();

    expect(first).not.toBe(second);
  });
});

interface CreatedComponent {
  component: unknown;
  props: unknown;
}

/** Unwraps the marker our mocked `createComponent` returns. Throws rather than
 * returning undefined, so a transform change surfaces as a loud failure
 * instead of undefined-equals-undefined assertions that pass vacuously. */
function createdBy(produced: unknown): CreatedComponent {
  const marker = produced as Partial<CreatedComponent> | undefined;

  if (marker?.component === undefined) {
    throw new Error(
      "expected a mocked createComponent marker — has solid's JSX transform changed?",
    );
  }

  return { component: marker.component, props: marker.props };
}

// Replaces only the JSX transform's component-construction seam, so a registry
// thunk reports which component it would build (and with which props) instead
// of building it. Every other solid-js/web export is passed through untouched.
vi.mock("solid-js/web", async (importOriginal) => {
  const actual = await importOriginal<typeof import("solid-js/web")>();

  return {
    ...actual,
    createComponent: (component: unknown, props: unknown) => {
      return { component, props };
    },
  };
});
