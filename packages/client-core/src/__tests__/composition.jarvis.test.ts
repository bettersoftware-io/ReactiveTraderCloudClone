import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import { createSimulatorPorts } from "#/adapters/portFactory";
import { createApp } from "#/composition";

describe("composition — jarvis wiring", () => {
  it("app.presenters.jarvis starts with the greeting entry and the default skin", async () => {
    const { presenters } = createApp({
      ...createSimulatorPorts({
        preferences: new PreferencesSimulator(),
        auth: new AuthSimulator({}),
        sessionStore: new InMemorySessionStore(),
      }),
      connectionEvents: new ConnectionEventsSimulator(),
    });

    const state = await firstValueFrom(presenters.jarvis.state$);

    expect(state.entries.length).toBe(1);
    expect(state.skin).toBe("singularity");

    presenters.jarvis.dispose();
  });

  it("intents.setSkin round-trips through the preferences port", async () => {
    const preferences = new PreferencesSimulator();
    const { presenters } = createApp({
      ...createSimulatorPorts({
        preferences,
        auth: new AuthSimulator({}),
        sessionStore: new InMemorySessionStore(),
      }),
      connectionEvents: new ConnectionEventsSimulator(),
    });

    presenters.jarvis.intents.setSkin("reactor");

    const state = await firstValueFrom(presenters.jarvis.state$);
    expect(state.skin).toBe("reactor");
    expect(await firstValueFrom(preferences.jarvisSkin$())).toBe("reactor");

    presenters.jarvis.dispose();
  });
});
