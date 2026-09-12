import { describe, expect, it } from "vitest";

import {
  createSimulatorPorts,
  InMemorySessionStore,
  reconnect$,
} from "@rtc/client-core";
import { CONTRACT_SUITES, type ContractMember } from "@rtc/core-contract";
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import { composeMachinesWithBase, composeWithBase } from "#/composition";
import parity from "#/parity.json" with { type: "json" };

describe("parity manifest", () => {
  const ports = {
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
  };
  const { base, app } = composeWithBase(ports);
  const { base: baseMachines, machines } = composeMachinesWithBase(
    app.presenters,
  );

  it("lists every contract member exactly once", () => {
    const listed = [
      ...Object.keys(parity.presenters).map((k) => {
        return `presenters.${k}`;
      }),
      ...Object.keys(parity.machines).map((k) => {
        return `machines.${k}`;
      }),
    ].sort();

    const members = (Object.keys(CONTRACT_SUITES) as ContractMember[])
      .filter((m) => {
        return m !== "commands.reconnect";
      })
      .sort();
    expect(listed).toEqual(members);
  });

  it("matches reality: native members differ from the RxJS instance, delegated ones are it", () => {
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
  });
});

type Provenance = "native" | "delegated";
