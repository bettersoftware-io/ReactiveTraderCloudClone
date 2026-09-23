import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import type { IncidentKind, IncidentState } from "@rtc/core-api";
import type { ConnectionEvent, MetricControl } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createIncidentMachine } from "#/machines/incident";

describe("createIncidentMachine (effect)", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  // The controls and the push are synchronous within the intent; the new
  // state follows the ref on a fiber (refToWarmStateStream), so it lands a
  // tick later — still after both side effects.
  it("inject perturbs every control, then pushes, then updates state — in that order", async () => {
    const rig = createRig(useHost());
    rig.machine.intents.inject("latencySpike");
    await tick();

    expect(rig.log).toEqual([
      "c0.perturb(latencySpike)",
      "c1.perturb(latencySpike)",
      "push(gatewayDisconnected)",
      "state([latencySpike])",
    ]);
  });

  it("errorBurst pushes nothing; a repeated inject perturbs and pushes again but does not duplicate the kind", async () => {
    const rig = createRig(useHost());
    rig.machine.intents.inject("errorBurst");
    await tick();
    expect(rig.log).toEqual([
      "c0.perturb(errorBurst)",
      "c1.perturb(errorBurst)",
      "state([errorBurst])",
    ]);
    rig.machine.intents.inject("serviceDown");
    await tick();
    rig.log.length = 0;
    rig.machine.intents.inject("serviceDown");
    await tick();

    expect(rig.log).toEqual([
      "c0.perturb(serviceDown)",
      "c1.perturb(serviceDown)",
      "push(gatewayDisconnected)",
    ]);
    expect(rig.machine.state$.getValue()).toEqual({
      active: ["errorBurst", "serviceDown"],
    });
  });

  it("clear resets every control, then pushes gatewayConnected, then resets state", async () => {
    const rig = createRig(useHost());
    rig.machine.intents.inject("errorBurst");
    await tick();
    rig.log.length = 0;
    rig.machine.intents.clear();
    await tick();

    expect(rig.log).toEqual([
      "c0.clear",
      "c1.clear",
      "push(gatewayConnected)",
      "state([])",
    ]);
  });

  it("clear pushes gatewayConnected even when nothing is active", () => {
    const rig = createRig(useHost());
    rig.machine.intents.clear();

    expect(rig.log).toContain("push(gatewayConnected)");
  });

  // State is read from a FRESH subscriber's seed, which reads the ref: an
  // earlier subscriber follows the ref on a fiber the close interrupted, and
  // would read the old state whether or not the guard ran.
  it("an intent after the host scope closes touches no control, pushes nothing and changes no state", async () => {
    const host = useHost();
    const rig = createRig(host);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    rig.log.length = 0;
    rig.machine.intents.inject("serviceDown");
    await tick();

    expect(rig.log).toEqual([]);
    rig.stop();
    const fresh: IncidentState[] = [];
    rig.machine.state$
      .subscribe((s) => {
        fresh.push(s);
      })
      .unsubscribe();
    expect(fresh).toEqual([{ active: [] }]);
  });

  it("dispose() is idempotent and ends intents the same way", () => {
    const rig = createRig(useHost());
    rig.machine.dispose();
    rig.machine.dispose();
    rig.log.length = 0;
    rig.machine.intents.inject("serviceDown");

    expect(rig.log).toEqual([]);
  });

  const hosts: TestHost[] = [];

  function useHost(): TestHost {
    const host: TestHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}

interface Rig {
  readonly machine: ReturnType<typeof createIncidentMachine>;
  readonly log: string[];
  /** Unsubscribe the rig's own logging subscriber. */
  stop(): void;
}

function createRig(host: EffectHost): Rig {
  const log: string[] = [];
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

  const machine = createIncidentMachine(host, {
    controls,
    pushConnectionEvent: (event: ConnectionEvent) => {
      log.push(`push(${event.type})`);
    },
  });
  let seeded = false;
  // Every emission after the seed is logged — a reset to [] included — so the
  // order assertions see WHEN state changed relative to the side effects.
  const logging = machine.state$.subscribe((s) => {
    if (seeded) {
      log.push(`state([${s.active.join(",")}])`);
    }

    seeded = true;
  });

  return {
    machine,
    log,
    stop: () => {
      logging.unsubscribe();
    },
  };
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
