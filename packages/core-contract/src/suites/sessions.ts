import { describe, expect, it } from "vitest";

import type { SessionInfo } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

/** `sessions` (ruling 3): a warm MIRROR over `SessionsPort.sessions$()` — no
 * seed, silent until the port emits, latest retained across a full
 * unsubscribe (`refCount: false`). */
export function describeSessionsContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("is silent until the port emits", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.sessions.sessions$);
        await settle();
        expect(c.values).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("mirrors each roster the port emits, in order", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.sessions.sessions$);
        const t1 = createSessionRoster(1);
        h.driver.emitSessions(t1);
        await settle();
        expect(c.values).toEqual([t1]);
        const t2 = createSessionRoster(2);
        h.driver.emitSessions(t2);
        await settle();
        expect(c.values).toEqual([t1, t2]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("retains the latest roster across a full unsubscribe for a late subscriber", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.sessions.sessions$);
        const t1 = createSessionRoster(1);
        h.driver.emitSessions(t1);
        await settle();
        c.unsubscribe();
        const late = collect(h.app.presenters.sessions.sessions$);
        expect(late.values).toEqual([t1]);
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}

function createSessionRoster(count: number): readonly SessionInfo[] {
  return Array.from({ length: count }, (_, index) => {
    return {
      id: `s${index}`,
      user: `trader${index}`,
      region: "us-east",
      lat: 40,
      lon: -74,
    };
  });
}
