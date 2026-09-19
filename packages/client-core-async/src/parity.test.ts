import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createSimulatorPorts,
  InMemorySessionStore,
  reconnect$,
} from "@rtc/client-core";
import { CONTRACT_SUITES, type ContractMember } from "@rtc/core-contract";
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import {
  type ComposedApp,
  type ComposedMachines,
  composeMachinesWithBase,
  composeWithBase,
} from "#/composition";
import parity from "#/parity.json" with { type: "json" };

describe("parity manifest", () => {
  beforeAll(() => {
    composed = composeWithBase({
      ...createSimulatorPorts({
        preferences: new PreferencesSimulator(),
        auth: new AuthSimulator({ demo: "demo" }),
        sessionStore: new InMemorySessionStore(),
      }),
      connectionEvents: {
        events: () => {
          return reconnect$;
        },
      },
    });
    composedMachines = composeMachinesWithBase(composed.app.presenters);
  });

  afterAll(async () => {
    await composed.app.dispose();
  });

  it("lists every contract member exactly once", () => {
    const listed = [
      ...Object.keys(parity.presenters).map((k) => {
        return `presenters.${k}`;
      }),
      ...Object.keys(parity.machines).map((k) => {
        return `machines.${k}`;
      }),
      ...Object.keys(parity.commands).map((k) => {
        return `commands.${k}`;
      }),
    ].sort();

    const members = (Object.keys(CONTRACT_SUITES) as ContractMember[]).sort();
    expect(listed).toEqual(members);
  });

  it("matches reality: native members differ from the RxJS instance, delegated ones are it", () => {
    const { base, app } = composed;
    const { base: baseMachines, machines } = composedMachines;

    for (const [member, provenance] of Object.entries(parity.presenters) as [
      keyof typeof base.presenters,
      Provenance,
    ][]) {
      const same = Object.is(app.presenters[member], base.presenters[member]);
      expect(same, `presenters.${member} is marked ${provenance}`).toBe(
        provenance === "delegated",
      );
    }

    for (const [member, provenance] of Object.entries(parity.machines) as [
      keyof typeof machines,
      Provenance,
    ][]) {
      const same = Object.is(machines[member], baseMachines[member]);
      expect(same, `machines.${member} is marked ${provenance}`).toBe(
        provenance === "delegated",
      );
    }

    for (const [member, provenance] of Object.entries(parity.commands) as [
      keyof typeof base.commands,
      Provenance,
    ][]) {
      const same = Object.is(app.commands[member], base.commands[member]);
      expect(same, `commands.${member} is marked ${provenance}`).toBe(
        provenance === "delegated",
      );
    }
  });

  let composed: ComposedApp;

  let composedMachines: ComposedMachines;
});

type Provenance = "native" | "delegated";
