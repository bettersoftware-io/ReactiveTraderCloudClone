import type { Component } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import type { PanelId } from "@rtc/client-core";

import { AdminHead } from "#/ui/admin/AdminHead";
import { CreditBlotterHead } from "#/ui/credit/blotter/CreditBlotterHead";
import { NewRfqHead } from "#/ui/credit/newRfq/NewRfqHead";
import { RfqsHead } from "#/ui/credit/rfqs/RfqsHead";
import { EqBlotterHead } from "#/ui/equities/blotter/EqBlotterHead";
import { EqChartHead } from "#/ui/equities/chart/EqChartHead";
import { EqTicketHead } from "#/ui/equities/ticket/EqTicketHead";
import { EqWatchlistHead } from "#/ui/equities/watchlist/EqWatchlistHead";
import { AnalyticsHead } from "#/ui/fx/analytics/AnalyticsHead";
import { FxBlotterHead } from "#/ui/fx/blotter/FxBlotterHead";
import { LiveRatesHead } from "#/ui/fx/liveRates/LiveRatesHead";
import { PositionsHead } from "#/ui/fx/positions/PositionsHead";

import { appHeadRegistry } from "../appHeadRegistry";

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

const expected: ReadonlyArray<readonly [PanelId, Component]> = [
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
];

describe("appHeadRegistry", () => {
  it.each(expected)("maps %s to its own head component", (panelId, head) => {
    const entry = appHeadRegistry[panelId];

    expect(entry).toBeTypeOf("function");
    expect(componentOf(entry?.())).toBe(head);
  });

  it("wires exactly the expected panel ids and no others", () => {
    // Catches BOTH directions: a head silently dropped (the panel falls back to
    // the engine's plain title span, losing its tabs) and a stray id added.
    expect(Object.keys(appHeadRegistry).sort()).toEqual(
      expected
        .map(([panelId]) => {
          return panelId;
        })
        .sort(),
    );
  });

  it("gives every panel a distinct head", () => {
    const heads = expected.map(([panelId]) => {
      return componentOf(appHeadRegistry[panelId]?.());
    });

    // A copy-paste slip that points two ids at one head is the likeliest
    // failure mode here, and it is invisible in any single-panel assertion.
    expect(new Set(heads).size).toBe(expected.length);
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
