import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

/** Every port method is called once, at construction, in every core — the
 * RxJS presenters' shape, adopted as the rule for all three (residual sweep,
 * 2026-09-19). A synchronous read (`cycle()`, `current()`) reads through a
 * fresh SUBSCRIPTION of the Observable captured at construction, never
 * through a fresh CALL of the port method; a stream re-subscribes the same
 * Observable on every warm period. This suite is not keyed by member: it
 * witnesses a property of the whole composition. */
export function describePortDisciplineContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(`${label} :: portDiscipline`, () => {
    it("themePreference: cycle() twice and two warm periods of mode$ call themeMode$() once", async () => {
      const h = makeHarness();

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
        expect(h.driver.portCalls("themeMode$")).toBe(1);
      } finally {
        await h.teardown();
      }
    });

    it("eqWatchlistSortPreference: cycle() twice calls eqWatchlistSort$() once", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.eqWatchlistSortPreference;
        p.cycle();
        p.cycle();
        await settle();
        expect(h.driver.portCalls("eqWatchlistSort$")).toBe(1);
      } finally {
        await h.teardown();
      }
    });

    it("bootPreference: current() twice calls bootVariant$() once", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.bootPreference;
        p.current();
        p.current();
        expect(h.driver.portCalls("bootVariant$")).toBe(1);
      } finally {
        await h.teardown();
      }
    });

    it("connection: two warm periods of status$ call connectionEvents.events() once", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.connection;
        const first = collect(p.status$);
        first.unsubscribe();
        await settle();
        const second = collect(p.status$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("connectionEvents.events")).toBe(1);
      } finally {
        await h.teardown();
      }
    });
  });
}
