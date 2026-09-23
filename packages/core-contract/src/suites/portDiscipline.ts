import { describe, expect, it } from "vitest";

import { ROSTER } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

/** Every port method is called at construction only, in every core. A
 * synchronous read (`cycle()`, `current()`) reads through a fresh
 * SUBSCRIPTION of the Observable captured at construction, never through a
 * fresh CALL of the port method; a stream re-subscribes the same Observable
 * on every warm period. So the count after construction is the BASELINE, and
 * the property this suite witnesses is that the count does not change across
 * warm periods or synchronous reads — constancy, not a fixed absolute value.
 * The absolute baseline itself differs by core: 1 for the RxJS core, but 2
 * for a delegating (strangler) core — `composeWithBase` builds the whole
 * RxJS base app first (every presenter calls its port method once there
 * too) before overlaying the native presenters (once more). Asserting the
 * absolute count is 1 everywhere is a slice-8 tightening, once delegation to
 * the RxJS base is fully removed. This suite is not keyed by member: it
 * witnesses a property of the whole composition. */
export function describePortDisciplineContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(`${label} :: portDiscipline`, () => {
    it("themePreference: cycle() twice and two warm periods of mode$ do not call themeMode$() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("themeMode$");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.themePreference;
        const first = collect(p.mode$);
        first.unsubscribe();
        await settle();
        const second = collect(p.mode$);
        p.cycle();
        p.cycle();
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("themeMode$")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("themePreference: two warm periods of mode$ do not call colorScheme.prefersDark$() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("colorScheme.prefersDark$");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.themePreference;
        const first = collect(p.mode$);
        first.unsubscribe();
        await settle();
        const second = collect(p.mode$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("colorScheme.prefersDark$")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("eqWatchlistSortPreference: cycle() twice does not call eqWatchlistSort$() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("eqWatchlistSort$");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.eqWatchlistSortPreference;
        p.cycle();
        p.cycle();
        await settle();
        expect(h.driver.portCalls("eqWatchlistSort$")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("bootPreference: current() twice does not call bootVariant$() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("bootVariant$");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.bootPreference;
        p.current();
        p.current();
        expect(h.driver.portCalls("bootVariant$")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("connection: two warm periods of status$ do not call connectionEvents.events() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("connectionEvents.events");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.connection;
        const first = collect(p.status$);
        first.unsubscribe();
        await settle();
        const second = collect(p.status$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("connectionEvents.events")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("currencyPairs: subscribe, unsubscribe, subscribe again does not call referenceData.getCurrencyPairs() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("referenceData.getCurrencyPairs");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.currencyPairs;
        const first = collect(p.pairs$);
        first.unsubscribe();
        await settle();
        const second = collect(p.pairs$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("referenceData.getCurrencyPairs")).toBe(
          before,
        );
      } finally {
        await h.teardown();
      }
    });

    it("blotter: subscribe, unsubscribe, subscribe again does not call blotter.getTradeStream() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("blotter.getTradeStream");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.blotter;
        const first = collect(p.trades$);
        first.unsubscribe();
        await settle();
        const second = collect(p.trades$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("blotter.getTradeStream")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("analytics: subscribe, unsubscribe, subscribe again does not call analytics.getAnalytics() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("analytics.getAnalytics");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.analytics;
        const first = collect(p.position$);
        first.unsubscribe();
        await settle();
        const second = collect(p.position$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("analytics.getAnalytics")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("rfqs: two warm periods of rfqs$ and of events$ do not call workflow.events() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("workflow.events");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.rfqs;
        const firstRfqs = collect(p.rfqs$);
        firstRfqs.unsubscribe();
        await settle();
        const secondRfqs = collect(p.rfqs$);
        await settle();
        secondRfqs.unsubscribe();
        const firstEvents = collect(p.events$);
        firstEvents.unsubscribe();
        await settle();
        const secondEvents = collect(p.events$);
        await settle();
        secondEvents.unsubscribe();
        expect(h.driver.portCalls("workflow.events")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("dealers: subscribe, unsubscribe, subscribe again does not call dealers.getDealers() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("dealers.getDealers");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.dealers;
        const first = collect(p.list$);
        first.unsubscribe();
        await settle();
        const second = collect(p.list$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("dealers.getDealers")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("instruments: subscribe, unsubscribe, subscribe again does not call instruments.getInstruments() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("instruments.getInstruments");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.instruments;
        const first = collect(p.list$);
        first.unsubscribe();
        await settle();
        const second = collect(p.list$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("instruments.getInstruments")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("watchlist: subscribe, unsubscribe, subscribe again does not call marketData.watchlist() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("marketData.watchlist");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.watchlist;
        const first = collect(p.watchlist$);
        first.unsubscribe();
        await settle();
        const second = collect(p.watchlist$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("marketData.watchlist")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("positions: subscribe, unsubscribe, subscribe again does not call positions.positions() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("positions.positions");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.positions;
        const first = collect(p.positions$);
        first.unsubscribe();
        await settle();
        const second = collect(p.positions$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("positions.positions")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("throughputMetric: two warm periods of samples$ do not call telemetry.throughput$() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("telemetry.throughput$");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.throughputMetric;
        const first = collect(p.samples$);
        first.unsubscribe();
        await settle();
        const second = collect(p.samples$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("telemetry.throughput$")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("latencyMetric: two warm periods of samples$ do not call telemetry.latency$() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("telemetry.latency$");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.latencyMetric;
        const first = collect(p.samples$);
        first.unsubscribe();
        await settle();
        const second = collect(p.samples$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("telemetry.latency$")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("errorRateMetric: two warm periods of samples$ do not call telemetry.errorRate$() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("telemetry.errorRate$");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.errorRateMetric;
        const first = collect(p.samples$);
        first.unsubscribe();
        await settle();
        const second = collect(p.samples$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("telemetry.errorRate$")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("topology: two warm periods of topology$ do not call serviceHealth.topology$() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("serviceHealth.topology$");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.topology;
        const first = collect(p.topology$);
        first.unsubscribe();
        await settle();
        const second = collect(p.topology$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("serviceHealth.topology$")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("eventLog: two warm periods of events$ do not call eventLog.events$() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("eventLog.events$");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.eventLog;
        const first = collect(p.events$);
        first.unsubscribe();
        await settle();
        const second = collect(p.events$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("eventLog.events$")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    it("sessions: two warm periods of sessions$ do not call sessions.sessions$() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("sessions.sessions$");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      // Not necessarily 1: `sessionsKpi` also calls `sessions.sessions$()`
      // once at construction (ruling 9) — the rule this suite witnesses is
      // constancy across warm periods, not an absolute count.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.sessions;
        const first = collect(p.sessions$);
        first.unsubscribe();
        await settle();
        const second = collect(p.sessions$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("sessions.sessions$")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    // Counts CALLS, not subscriptions — the distinction slice 5's ruling 5
    // turns on. How often the load is SUBSCRIBED across a cold resubscribe is
    // deliberately uncontracted (the RxJS core re-runs it; a sibling may keep
    // it warm), but the port method itself is obtained once, when the
    // presenter is built. A core that called `getThroughput()` afresh per
    // subscriber would fail here, which is the constancy this file exists for.
    it("throughput: two warm periods of state$ do not call admin.getThroughput() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("admin.getThroughput");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.throughput;
        const first = collect(p.state$);
        first.unsubscribe();
        await settle();
        const second = collect(p.state$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("admin.getThroughput")).toBe(before);
      } finally {
        await h.teardown();
      }
    });

    // Resuming a stored session reads the STORE, never the auth port: a core
    // that re-validated the session over the wire at composition would make
    // a login call nobody asked for. Each intent then costs exactly one call.
    it("auth: no login call at composition or resume; one per login() and one per unlock()", async () => {
      const h = makeHarness({
        session: {
          token: "stored",
          user: ROSTER[0].user,
          username: ROSTER[0].username,
          exp: Date.now() + 60_000,
        },
      });

      try {
        const auth = h.app.presenters.auth;
        const c = collect(auth.state$);
        expect(h.driver.portCalls("auth.login")).toBe(0);
        auth.lock();
        auth.unlock("pw");
        expect(h.driver.portCalls("auth.login")).toBe(1);
        auth.logout();
        auth.login(ROSTER[0].username, "pw");
        expect(h.driver.portCalls("auth.login")).toBe(2);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
