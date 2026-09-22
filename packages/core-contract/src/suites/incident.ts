import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

/** `incident` (ruling 6): a composition singleton (`h.app.presenters
 * .incident`). `inject(kind)` perturbs every `metricControls` entry, in
 * order, SYNCHRONOUSLY within the call; `latencySpike`/`serviceDown` push a
 * `gatewayDisconnected` connection event, `errorBurst` pushes nothing; a
 * repeated `inject` does not duplicate the kind in `active` but does
 * perturb and push again; `active` keeps first-injection order. `clear()`
 * clears every control, always pushes `gatewayConnected` (even with
 * nothing active), and resets to `{ active: [] }`. */
export function describeIncidentContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts with nothing active, synchronously", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.incident.state$);
        expect(c.values).toEqual([{ active: [] }]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("inject(latencySpike) perturbs every control in order, checked synchronously, and disconnects the gateway", async () => {
      const h = makeHarness();

      try {
        const conn = collect(h.driver.connectionEvents$());
        const m = h.app.presenters.incident;
        const c = collect(m.state$);
        m.intents.inject("latencySpike");
        expect(h.driver.controlCalls()).toEqual([
          { control: 0, call: "perturb", kind: "latencySpike" },
          { control: 1, call: "perturb", kind: "latencySpike" },
          { control: 2, call: "perturb", kind: "latencySpike" },
        ]);
        await settle();
        expect(c.values.at(-1)).toEqual({ active: ["latencySpike"] });
        expect(conn.values).toEqual([{ type: "gatewayDisconnected" }]);
        c.unsubscribe();
        conn.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("inject(errorBurst) perturbs every control but never disconnects the gateway", async () => {
      const h = makeHarness();

      try {
        const conn = collect(h.driver.connectionEvents$());
        const m = h.app.presenters.incident;
        const c = collect(m.state$);
        m.intents.inject("errorBurst");
        await settle();
        expect(h.driver.controlCalls()).toEqual([
          { control: 0, call: "perturb", kind: "errorBurst" },
          { control: 1, call: "perturb", kind: "errorBurst" },
          { control: 2, call: "perturb", kind: "errorBurst" },
        ]);
        expect(c.values.at(-1)).toEqual({ active: ["errorBurst"] });
        expect(conn.values).toEqual([]);
        c.unsubscribe();
        conn.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("inject(serviceDown) disconnects the gateway", async () => {
      const h = makeHarness();

      try {
        const conn = collect(h.driver.connectionEvents$());
        const m = h.app.presenters.incident;
        const c = collect(m.state$);
        m.intents.inject("serviceDown");
        await settle();
        expect(c.values.at(-1)).toEqual({ active: ["serviceDown"] });
        expect(conn.values).toEqual([{ type: "gatewayDisconnected" }]);
        c.unsubscribe();
        conn.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a repeated inject does not duplicate the kind in active, but perturbs every control again", async () => {
      const h = makeHarness();

      try {
        const m = h.app.presenters.incident;
        const c = collect(m.state$);
        m.intents.inject("errorBurst");
        m.intents.inject("errorBurst");
        await settle();
        expect(c.values.at(-1)).toEqual({ active: ["errorBurst"] });
        expect(h.driver.controlCalls()).toHaveLength(6);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("active keeps first-injection order across kinds", async () => {
      const h = makeHarness();

      try {
        const m = h.app.presenters.incident;
        const c = collect(m.state$);
        m.intents.inject("serviceDown");
        m.intents.inject("errorBurst");
        await settle();
        expect(c.values.at(-1)).toEqual({
          active: ["serviceDown", "errorBurst"],
        });
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("clear() with incidents active clears every control in order, reconnects, and resets to empty", async () => {
      const h = makeHarness();

      try {
        const conn = collect(h.driver.connectionEvents$());
        const m = h.app.presenters.incident;
        const c = collect(m.state$);
        m.intents.inject("serviceDown");
        m.intents.inject("errorBurst");
        await settle();
        m.intents.clear();
        expect(h.driver.controlCalls().slice(-3)).toEqual([
          { control: 0, call: "clear" },
          { control: 1, call: "clear" },
          { control: 2, call: "clear" },
        ]);
        await settle();
        expect(c.values.at(-1)).toEqual({ active: [] });
        expect(conn.values.at(-1)).toEqual({ type: "gatewayConnected" });
        c.unsubscribe();
        conn.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("clear() with nothing active still clears every control and reconnects", async () => {
      const h = makeHarness();

      try {
        const conn = collect(h.driver.connectionEvents$());
        const m = h.app.presenters.incident;
        const c = collect(m.state$);
        m.intents.clear();
        await settle();
        expect(h.driver.controlCalls()).toEqual([
          { control: 0, call: "clear" },
          { control: 1, call: "clear" },
          { control: 2, call: "clear" },
        ]);
        expect(c.values.at(-1)).toEqual({ active: [] });
        expect(conn.values).toEqual([{ type: "gatewayConnected" }]);
        c.unsubscribe();
        conn.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
