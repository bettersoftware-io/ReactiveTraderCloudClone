import type { Component } from "solid-js";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { PanelId } from "@rtc/client-core";

const PANEL_IDS: readonly PanelId[] = [
  "fx-rates",
  "fx-analytics",
  "fx-positions",
  "fx-blotter",
  "eq-chart",
  "eq-blotter",
  "eq-ticket",
  "eq-watchlist",
  "admin-dashboard",
  "credit-new-rfq",
  "credit-rfqs",
  "credit-blotter",
];

let appHeadRegistry: typeof import("../appHeadRegistry")["appHeadRegistry"];
let expectedByPanelId: ReadonlyMap<PanelId, Component>;

beforeAll(async () => {
  vi.resetModules();

  const [
    { AdminHead },
    { CreditBlotterHead },
    { NewRfqHead },
    { RfqsHead },
    { EqBlotterHead },
    { EqChartHead },
    { EqTicketHead },
    { EqWatchlistHead },
    { AnalyticsHead },
    { FxBlotterHead },
    { LiveRatesHead },
    { PositionsHead },
    registryModule,
  ] = await Promise.all([
    import("#/ui/admin/AdminHead"),
    import("#/ui/credit/blotter/CreditBlotterHead"),
    import("#/ui/credit/newRfq/NewRfqHead"),
    import("#/ui/credit/rfqs/RfqsHead"),
    import("#/ui/equities/blotter/EqBlotterHead"),
    import("#/ui/equities/chart/EqChartHead"),
    import("#/ui/equities/ticket/EqTicketHead"),
    import("#/ui/equities/watchlist/EqWatchlistHead"),
    import("#/ui/fx/analytics/AnalyticsHead"),
    import("#/ui/fx/blotter/FxBlotterHead"),
    import("#/ui/fx/liveRates/LiveRatesHead"),
    import("#/ui/fx/positions/PositionsHead"),
    import("../appHeadRegistry"),
  ]);

  appHeadRegistry = registryModule.appHeadRegistry;
  expectedByPanelId = new Map<PanelId, Component>([
    ["fx-rates", LiveRatesHead],
    ["fx-analytics", AnalyticsHead],
    ["fx-positions", PositionsHead],
    ["fx-blotter", FxBlotterHead],
    ["eq-chart", EqChartHead],
    ["eq-blotter", EqBlotterHead],
    ["eq-ticket", EqTicketHead],
    ["eq-watchlist", EqWatchlistHead],
    ["admin-dashboard", AdminHead],
    ["credit-new-rfq", NewRfqHead],
    ["credit-rfqs", RfqsHead],
    ["credit-blotter", CreditBlotterHead],
  ]);
});

describe("appHeadRegistry", () => {
  it.each(PANEL_IDS)("maps %s to its own head component", (panelId) => {
    const entry = appHeadRegistry[panelId];

    expect(entry).toBeTypeOf("function");
    expect(componentOf(entry?.())).toBe(expectedByPanelId.get(panelId));
  });

  it("wires exactly the expected panel ids and no others", () => {
    // Catches BOTH directions: a head silently dropped (the panel falls back to
    // the engine's plain title span, losing its tabs) and a stray id added.
    expect(Object.keys(appHeadRegistry).sort()).toEqual([...PANEL_IDS].sort());
  });

  it("gives every panel a distinct head", () => {
    const heads = PANEL_IDS.map((panelId) => {
      return componentOf(appHeadRegistry[panelId]?.());
    });

    // A copy-paste slip that points two ids at one head is the likeliest
    // failure mode here, and it is invisible in any single-panel assertion.
    expect(new Set(heads).size).toBe(PANEL_IDS.length);
  });

  it("returns a fresh result per call, never a cached node", () => {
    const first = appHeadRegistry["fx-rates"]?.();
    const second = appHeadRegistry["fx-rates"]?.();

    // The engine may mount a panel head more than once (maximize/restore
    // remounts it); a hoisted `const node = <Head />` shared by every call
    // would be a latent aliasing bug that this catches and identity does not.
    expect(first).not.toBe(second);
  });
});

interface CreatedComponent {
  __component: unknown;
}

/** Unwraps the marker our mocked `createComponent` returns, so a thunk's result
 * yields the component the transform would have invoked. Throws rather than
 * returning undefined: a silent undefined would make every identity assertion
 * compare undefined to undefined and pass. */
function componentOf(produced: unknown): unknown {
  const marker = produced as CreatedComponent | undefined;

  if (marker?.__component === undefined) {
    throw new Error(
      "expected a mocked createComponent marker — has solid's JSX transform changed?",
    );
  }

  return marker.__component;
}

// appHeadRegistry is pure wiring: panel id -> head-slot component. Wiring is
// exactly what a sociable test can't see — every head renders *some* plausible
// chrome, so swapping two entries (eq-blotter -> FxBlotterHead) produces a
// perfectly valid-looking app with the wrong tabs in two panels. The react twin
// (client-react/src/ui/shell/layout/engine/__tests__/appHeadRegistry.test.tsx)
// asserts the same four properties.
//
// HOW THIS WORKS IN SOLID, AND WHY IT DIFFERS FROM REACT. React entries are
// `() => <Head />` element descriptors, so calling one builds an inert object
// whose `.type` IS the component — identity for free, nothing rendered. Solid
// has no such descriptor: its JSX compiles `<Head />` to
// `createComponent(Head, {})`, which CALLS Head immediately, so calling a thunk
// here would execute a real component and demand a ViewModel provider and an
// owner. Mocking `createComponent` (the exact seam the transform emits) instead
// hands back the component reference untouched, which recovers React's cheap
// identity assertion without rendering twelve panel heads. It is the same
// coupling react's test already takes on `element.type` — one level lower.
//
// If solid's JSX transform ever stops emitting `createComponent`, these tests
// fail loudly on a missing `componentOf` marker rather than passing vacuously.
//
// WHY EVERY HEAD MODULE BELOW IS A FRESH DYNAMIC (RE-)IMPORT (Task 12/P5): the
// `AppShell` ui-contract token (`registry.tsx`) now statically imports the
// REAL `App`, which the shared `setup.ts` pulls into EVERY test file's module
// graph — including this one — before this file's own body (and its hoisted
// `vi.mock` below) ever runs. `../appHeadRegistry` therefore gets evaluated
// once already, with its `solid-js/web` import bound to the REAL
// `createComponent` — an ESM live binding vi.mock cannot rewrite in an
// already-executed module. `vi.resetModules()` + importing BOTH the registry
// AND every head it maps to fresh (together, in the same wave, inside
// `beforeAll`) keeps the identity comparisons below internally consistent
// (fresh-vs-fresh) regardless of what setup.ts already loaded — see
// ./appPanelRegistry.test.ts's identical fix for the full mechanism. Panel
// ids themselves are plain string literals (no import needed), so `it.each`
// still names each case individually.

// Replaces only the JSX transform's component-construction seam, so a registry
// thunk reports which component it would build instead of building it. Every
// other solid-js/web export is passed through untouched.
vi.mock("solid-js/web", async (importOriginal) => {
  const actual = await importOriginal<typeof import("solid-js/web")>();

  return {
    ...actual,
    createComponent: (component: unknown) => {
      return { __component: component };
    },
  };
});
