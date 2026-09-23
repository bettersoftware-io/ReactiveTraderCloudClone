import { describe, expect, it } from "vitest";

import type { IncidentKind, IncidentState } from "@rtc/core-api";
import type { ConnectionEvent, MetricControl } from "@rtc/domain";

import { createIncidentMachine } from "#/machines/incident";

describe("createIncidentMachine (async)", () => {
  it("inject perturbs every control, then pushes, then updates state — in that order, synchronously", () => {
    const rig = createRig();
    rig.machine.intents.inject("latencySpike");

    expect(rig.log).toEqual([
      "c0.perturb(latencySpike)",
      "c1.perturb(latencySpike)",
      "push(gatewayDisconnected)",
      "state([latencySpike])",
    ]);
  });

  it("errorBurst pushes nothing; a repeated inject perturbs and pushes again but does not duplicate the kind", () => {
    const rig = createRig();
    rig.machine.intents.inject("errorBurst");
    rig.machine.intents.inject("serviceDown");
    rig.log.length = 0;
    rig.machine.intents.inject("serviceDown");

    expect(rig.log).toEqual([
      "c0.perturb(serviceDown)",
      "c1.perturb(serviceDown)",
      "push(gatewayDisconnected)",
    ]);
    expect(rig.machine.state$.getValue()).toEqual({
      active: ["errorBurst", "serviceDown"],
    });
  });

  it("clear resets every control, pushes gatewayConnected even when nothing is active, and resets state", () => {
    const rig = createRig();
    rig.machine.intents.clear();

    expect(rig.log).toEqual([
      "c0.clear",
      "c1.clear",
      "push(gatewayConnected)",
      "state([])",
    ]);
    rig.machine.intents.inject("errorBurst");
    rig.log.length = 0;
    rig.machine.intents.clear();
    expect(rig.log).toEqual([
      "c0.clear",
      "c1.clear",
      "push(gatewayConnected)",
      "state([])",
    ]);
  });

  // Subscribed FIRST and kept: after dispose() a cold getValue() would read
  // the seed whether or not the guard ran (see eqWorkspace.test.ts).
  it("an intent after the lifetime aborts touches no control, pushes nothing and changes no state", () => {
    const rig = createRig();
    const seen: IncidentState[] = [];
    const sub = rig.machine.state$.subscribe((s) => {
      seen.push(s);
    });
    rig.lifetime.abort();
    rig.log.length = 0;
    rig.machine.intents.inject("serviceDown");
    rig.machine.intents.clear();

    expect(rig.log).toEqual([]);
    expect(seen).toEqual([{ active: [] }]);
    sub.unsubscribe();
  });

  it("dispose() is idempotent and ends intents the same way", () => {
    const rig = createRig();
    rig.machine.dispose();
    rig.machine.dispose();
    rig.log.length = 0;
    rig.machine.intents.inject("serviceDown");

    expect(rig.log).toEqual([]);
  });
});

interface Rig {
  readonly machine: ReturnType<typeof createIncidentMachine>;
  readonly log: string[];
  readonly lifetime: AbortController;
}

function createRig(): Rig {
  const log: string[] = [];
  const lifetime = new AbortController();
  const controls = [0, 1].map((i): MetricControl => {
    return {
      perturb: (kind: IncidentKind) => {
        log.push(`c${i}.perturb(${kind})`);
      },
      clearPerturbation: () => {
        log.push(`c${i}.clear`);
      },
    };
  });

  const machine = createIncidentMachine(
    {
      controls,
      pushConnectionEvent: (event: ConnectionEvent) => {
        log.push(`push(${event.type})`);
      },
    },
    lifetime.signal,
  );
  let seeded = false;
  // Every emission after the seed is logged — a reset to [] included — so the
  // order assertions see WHEN state changed relative to the side effects.
  machine.state$.subscribe((s) => {
    if (seeded) {
      log.push(`state([${s.active.join(",")}])`);
    }

    seeded = true;
  });

  return { machine, log, lifetime };
}
