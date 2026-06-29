import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { ConnectionEvent, MetricControl, Perturbation } from "@rtc/domain";

import { createIncidentMachine } from "../IncidentMachine";

function fakeControl(): MetricControl & {
  calls: Perturbation[];
  cleared: number;
} {
  const calls: Perturbation[] = [];
  let cleared = 0;
  return {
    calls,
    get cleared(): number {
      return cleared;
    },
    perturb: (k: Perturbation): void => {
      calls.push(k);
    },
    clearPerturbation: () => {
      cleared += 1;
    },
  };
}

describe("IncidentMachine", () => {
  it("inject(latencySpike) perturbs controls and pushes gatewayDisconnected", async () => {
    const control = fakeControl();
    const pushed: ConnectionEvent[] = [];
    const m = createIncidentMachine({
      controls: [control],
      pushConnectionEvent: (ev: ConnectionEvent): void => {
        pushed.push(ev);
      },
    });

    m.intents.inject("latencySpike");

    expect(control.calls).toContain("latencySpike");
    expect(pushed).toContainEqual({ type: "gatewayDisconnected" });
    const state = await firstValueFrom(m.state$);
    expect(state.active).toContain("latencySpike");
    m.dispose();
  });

  it("clear() reverses perturbations and pushes gatewayConnected", async () => {
    const control = fakeControl();
    const pushed: ConnectionEvent[] = [];
    const m = createIncidentMachine({
      controls: [control],
      pushConnectionEvent: (ev: ConnectionEvent): void => {
        pushed.push(ev);
      },
    });

    m.intents.inject("serviceDown");
    m.intents.clear();

    expect(control.cleared).toBeGreaterThan(0);
    expect(pushed).toContainEqual({ type: "gatewayConnected" });
    const state = await firstValueFrom(m.state$);
    expect(state.active).toEqual([]);
    m.dispose();
  });
});
