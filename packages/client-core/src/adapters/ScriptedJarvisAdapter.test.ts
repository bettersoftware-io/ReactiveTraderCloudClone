import { of } from "rxjs";
import { describe, expect, it } from "vitest";

import type {
  AnalyticsPort,
  BlotterPort,
  ExecutionPort,
  PricingPort,
  ReferenceDataPort,
} from "@rtc/domain";
import type { JarvisEvent } from "@rtc/shared";

import {
  ScriptedJarvisAdapter,
  type ScriptedJarvisDeps,
} from "./ScriptedJarvisAdapter";

describe("ScriptedJarvisAdapter (JarvisPort pass-through over ScriptedJarvisEngine)", () => {
  it("PASS-THROUGH: a scripted panel event reaches the adapter's ask() output unchanged", async () => {
    const adapter = new ScriptedJarvisAdapter(buildDeps());
    const received: JarvisEvent[] = [];

    await new Promise<void>((resolve) => {
      adapter.ask("show me GBP volatility").subscribe({
        next: (event: JarvisEvent) => {
          received.push(event);
        },
        complete: resolve,
      });
    });

    const panelEvents = received.filter((event) => {
      return event.type === "panel";
    });

    // `ScriptedJarvisAdapter` adds only the `JarvisPort` structural marker —
    // it forwards every `ScriptedJarvisEngine.ask()` event, panel included,
    // verbatim. `ScriptedJarvisEngine`'s own test suite
    // (`@rtc/shared`'s `ScriptedJarvisEngine.test.ts`) pins the panel's exact
    // content; this test only proves the adapter doesn't filter or reshape
    // the "panel" type on its way out.
    expect(panelEvents).toHaveLength(1);
    const panelEvent = panelEvents[0];

    if (panelEvent?.type !== "panel") {
      throw new Error("expected a panel event");
    }

    expect(panelEvent.panelId).toBe("panel-scripted-1");
    expect(panelEvent.spec.v).toBe(1);
    expect(
      received.map((event) => {
        return event.type;
      }),
    ).toEqual(["panel", "delta", "done"]);
  });
});

/** A stub port method that throws if this test's turn unexpectedly reaches
 * it — a showPanel turn never calls pricing/blotter/analytics/execution. */
function unexpectedCall(port: string): () => never {
  return (): never => {
    throw new Error(`${port} should not be called for a showPanel turn`);
  };
}

/** Minimal `ScriptedJarvisDeps` for a `showPanel` turn: the engine only reads
 * `referenceData.getCurrencyPairs()` before dispatching on intent, so every
 * other port is `unexpectedCall`'s throwing stub. `instantReveal$: of(true)`
 * collapses the trailing reply into a single delta, so the test needs no
 * fake-timer pacing. */
function buildDeps(): ScriptedJarvisDeps {
  const referenceData: ReferenceDataPort = {
    getCurrencyPairs: () => {
      return of([]);
    },
  };

  const pricing: PricingPort = {
    getPriceUpdates: unexpectedCall("pricing.getPriceUpdates"),
    getPriceHistory: unexpectedCall("pricing.getPriceHistory"),
    getRfqQuote: unexpectedCall("pricing.getRfqQuote"),
  };

  const blotter: BlotterPort = {
    getTradeStream: unexpectedCall("blotter.getTradeStream"),
  };

  const analytics: AnalyticsPort = {
    getAnalytics: unexpectedCall("analytics.getAnalytics"),
  };

  const execution: ExecutionPort = {
    executeTrade: unexpectedCall("execution.executeTrade"),
  };

  return {
    referenceData,
    pricing,
    blotter,
    analytics,
    execution,
    instantReveal$: of(true),
  };
}
