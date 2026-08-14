import type { ComponentType, ReactElement } from "react";
import { describe, expect, it } from "vitest";

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
// perfectly valid-looking app with the wrong tabs in two panels.
//
// Registry entries are `() => <Head />` element descriptors, so CALLING one
// builds a React element without rendering it — no hooks run, no ViewModel
// provider needed. That makes component IDENTITY directly assertable, which is
// both stricter and far cheaper than rendering twelve panel heads.

const expected: ReadonlyArray<readonly [PanelId, ComponentType]> = [
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

    const element = entry?.() as ReactElement;

    expect(element.type).toBe(head);
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
      const head = appHeadRegistry[panelId];

      if (!head) {
        throw new Error(`no head registered for panel ${panelId}`);
      }

      return (head() as ReactElement).type;
    });

    // A copy-paste slip that points two ids at one head is the likeliest
    // failure mode here, and it is invisible in any single-panel assertion.
    expect(new Set(heads).size).toBe(expected.length);
  });

  it("returns a fresh element per call, never a cached node", () => {
    const first = appHeadRegistry["fx-rates"]?.();
    const second = appHeadRegistry["fx-rates"]?.();

    // The engine may mount a panel head more than once (maximize/restore
    // remounts it); a shared element instance would be a latent aliasing bug.
    expect(first).not.toBe(second);
  });
});
