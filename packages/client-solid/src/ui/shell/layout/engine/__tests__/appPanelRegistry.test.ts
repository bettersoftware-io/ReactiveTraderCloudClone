import type { Component } from "solid-js";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { PanelId } from "@rtc/client-core";

const PANEL_IDS: readonly PanelId[] = [
  "fx-rates",
  "fx-analytics",
  "fx-positions",
  "fx-blotter",
  "credit-new-rfq",
  "credit-rfqs",
  "credit-blotter",
  "credit-sell-side",
  "admin-dashboard",
  "eq-chart",
  "eq-blotter",
  "eq-ticket",
  "eq-watchlist",
  "eq-depth",
  "eq-sectors",
];

let appPanelRegistry: typeof import("../appPanelRegistry")["appPanelRegistry"];
// `Component<never>` rather than bare `Component` (= `Component<{}>`): NewRfqPanel
// takes a required prop, and parameter contravariance means only a `never` props
// type accepts every module root in one map.
let expectedByPanelId: ReadonlyMap<PanelId, Component<never>>;

beforeAll(async () => {
  // Generous timeout (default 10s): CI's cold transform of the whole App
  // module graph (pulled in by vi.resetModules() + this re-import wave) has
  // measured ~71s total import time on a cold runner, well past vitest's
  // default hookTimeout — passes locally only because the Vite transform
  // cache is already warm there.
  vi.resetModules();

  const [
    { AdminDashboard },
    { CreditBlotter },
    { NewRfqPanel },
    { RfqsPanel },
    { SellSidePanel },
    { EqBlotterPanel },
    { ChartPanel },
    { EqDepthDock },
    { OrderTicket },
    { EqSectorsDock },
    { WatchlistPanel },
    { AnalyticsPanel },
    { FxBlotter },
    { LiveRatesPanel },
    { PositionsPanel },
    registryModule,
  ] = await Promise.all([
    import("#/ui/admin/AdminDashboard"),
    import("#/ui/credit/blotter/CreditBlotter"),
    import("#/ui/credit/newRfq/NewRfqPanel"),
    import("#/ui/credit/rfqs/RfqsPanel"),
    import("#/ui/credit/sellSide/SellSidePanel"),
    import("#/ui/equities/blotter/EqBlotterPanel"),
    import("#/ui/equities/chart/ChartPanel"),
    import("#/ui/equities/chart/EqDepthDock"),
    import("#/ui/equities/ticket/OrderTicket"),
    import("#/ui/equities/watchlist/EqSectorsDock"),
    import("#/ui/equities/watchlist/WatchlistPanel"),
    import("#/ui/fx/analytics/AnalyticsPanel"),
    import("#/ui/fx/blotter/FxBlotter"),
    import("#/ui/fx/liveRates/LiveRatesPanel"),
    import("#/ui/fx/positions/PositionsPanel"),
    import("../appPanelRegistry"),
  ]);

  appPanelRegistry = registryModule.appPanelRegistry;
  expectedByPanelId = new Map<PanelId, Component<never>>([
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
  ]);
}, 60_000);

describe("appPanelRegistry", () => {
  it.each(PANEL_IDS)("maps %s to its own module root", (panelId) => {
    const entry = appPanelRegistry[panelId];

    expect(entry).toBeTypeOf("function");
    expect(createdBy(entry()).component).toBe(expectedByPanelId.get(panelId));
  });

  it("wires exactly the expected panel ids and no others", () => {
    // PanelRegistry is a total Record<PanelId, …>, so TypeScript already
    // rejects a MISSING id. What this adds is the reverse tripwire: a newly
    // introduced PanelId lands in the registry typed-clean but unasserted, and
    // this fails until someone states which module root it should mount.
    expect(Object.keys(appPanelRegistry).sort()).toEqual([...PANEL_IDS].sort());
  });

  it("gives every panel a distinct module root", () => {
    const roots = PANEL_IDS.map((panelId) => {
      return createdBy(appPanelRegistry[panelId]()).component;
    });

    expect(new Set(roots).size).toBe(PANEL_IDS.length);
  });

  it("hands New RFQ an onCreated callback", () => {
    // The three-panel credit dock has nowhere to redirect after a create, so
    // this is deliberately a noop (see appPanelRegistry.tsx) — but it must
    // still be PASSED: NewRfqPanel requires the prop, and dropping it would
    // break the panel at runtime while every other entry kept working.
    const { props } = createdBy(appPanelRegistry["credit-new-rfq"]());

    expect(props).toHaveProperty("onCreated");
    expect((props as NewRfqProps).onCreated).toBeTypeOf("function");
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

interface NewRfqProps {
  onCreated: unknown;
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
//
// WHY EVERY PANEL MODULE BELOW IS A FRESH DYNAMIC (RE-)IMPORT (Task 12/P5):
// the `AppShell` ui-contract token (`registry.tsx`) now statically imports
// the REAL `App`, which the shared `setup.ts` pulls into EVERY test file's
// module graph — including this one — before this file's own body (and its
// hoisted `vi.mock` below) ever runs. `../appPanelRegistry` therefore gets
// evaluated once already, with its `solid-js/web` import bound to the REAL
// `createComponent` — an ESM live binding vi.mock cannot rewrite in an
// already-executed module. `vi.resetModules()` + importing BOTH the registry
// AND every panel it maps to fresh (together, in the same wave, inside
// `beforeAll`) keeps the identity comparisons below internally consistent
// (fresh-vs-fresh) regardless of what setup.ts already loaded — the point is
// never to compare against setup.ts's copy, only against each other's. Panel
// ids themselves are plain string literals (no import needed), so `it.each`
// still names each case individually.

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
