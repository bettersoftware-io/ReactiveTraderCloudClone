import { describe, expect, it } from "vitest";

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

    it("eqWatchlistSortPreference: cycle() twice does not call eqWatchlistSort$() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("eqWatchlistSort$");

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
  });
}
