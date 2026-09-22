import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { ConnectionEvent, MetricControl, Perturbation } from "@rtc/domain";

import type {
  IncidentEvent,
  IncidentKind,
  IncidentState,
} from "../IncidentMachine";
import {
  createIncidentMachine,
  incidentConnectionEvent,
  reduceIncident,
} from "../IncidentMachine";

describe("IncidentMachine", () => {
  it("inject(latencySpike) perturbs controls and pushes gatewayDisconnected", async () => {
    const control = createFakeControl();
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
    const control = createFakeControl();
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

  it("inject(errorBurst) perturbs controls but does NOT push gatewayDisconnected", async () => {
    const control = createFakeControl();
    const pushed: ConnectionEvent[] = [];
    const m = createIncidentMachine({
      controls: [control],
      pushConnectionEvent: (ev: ConnectionEvent): void => {
        pushed.push(ev);
      },
    });

    m.intents.inject("errorBurst");

    expect(control.calls).toContain("errorBurst");
    expect(pushed).not.toContainEqual({ type: "gatewayDisconnected" });
    const state = await firstValueFrom(m.state$);
    expect(state.active).toContain("errorBurst");
    m.dispose();
  });

  it("inject(serviceDown) pushes gatewayDisconnected", async () => {
    const control = createFakeControl();
    const pushed: ConnectionEvent[] = [];
    const m = createIncidentMachine({
      controls: [control],
      pushConnectionEvent: (ev: ConnectionEvent): void => {
        pushed.push(ev);
      },
    });

    m.intents.inject("serviceDown");

    expect(control.calls).toContain("serviceDown");
    expect(pushed).toContainEqual({ type: "gatewayDisconnected" });
    m.dispose();
  });
});

describe("reduceIncident", () => {
  it("inject adds the kind to an empty active list", () => {
    const next = reduceIncident(
      { active: [] },
      createInjectEvent("latencySpike"),
    );

    expect(next.active).toEqual(["latencySpike"]);
  });

  it("injecting the same kind twice leaves the state unchanged", () => {
    const first = reduceIncident(
      { active: [] },
      createInjectEvent("latencySpike"),
    );
    const second = reduceIncident(first, createInjectEvent("latencySpike"));

    expect(second).toBe(first);
    expect(second.active).toEqual(["latencySpike"]);
  });

  it("keeps inject order", () => {
    const first = reduceIncident(
      { active: [] },
      createInjectEvent("errorBurst"),
    );
    const second = reduceIncident(first, createInjectEvent("serviceDown"));

    expect(second.active).toEqual(["errorBurst", "serviceDown"]);
  });

  it("clear resets to the initial empty state from any state", () => {
    const populated: IncidentState = {
      active: ["latencySpike", "errorBurst"],
    };

    expect(reduceIncident(populated, createClearEvent())).toEqual({
      active: [],
    });
  });
});

describe("incidentConnectionEvent", () => {
  it("inject(latencySpike) disconnects the gateway", () => {
    expect(incidentConnectionEvent(createInjectEvent("latencySpike"))).toEqual({
      type: "gatewayDisconnected",
    });
  });

  it("inject(serviceDown) disconnects the gateway", () => {
    expect(incidentConnectionEvent(createInjectEvent("serviceDown"))).toEqual({
      type: "gatewayDisconnected",
    });
  });

  it("inject(errorBurst) does not disconnect the gateway", () => {
    expect(incidentConnectionEvent(createInjectEvent("errorBurst"))).toBeNull();
  });

  it("clear reconnects the gateway", () => {
    expect(incidentConnectionEvent(createClearEvent())).toEqual({
      type: "gatewayConnected",
    });
  });
});

type FakeControl = MetricControl & {
  calls: Perturbation[];
  cleared: number;
};

function createInjectEvent(incident: IncidentKind): IncidentEvent {
  return { kind: "inject", incident };
}

function createClearEvent(): IncidentEvent {
  return { kind: "clear" };
}

function createFakeControl(): FakeControl {
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
