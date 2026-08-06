// packages/client-core/src/composition.jarvisPreferences.test.ts
//
// The two Jarvis desk-assistant preferences (brain + effort) are resolved
// through JarvisPreferencesPresenter, wired in composition exactly like
// loginWaitPreferences (see composition.loginWait.test.ts). This pins the
// presenter's write-through + replay-to-late-subscriber behaviour on a real
// createApp wiring.

import { NEVER, type Observable } from "rxjs";
import { describe, expect, it } from "vitest";

import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import type { AppPorts } from "#/adapters/portFactory";
import { createSimulatorPorts } from "#/adapters/portFactory";
import { type App, createApp } from "#/composition";

const PASSWORD = "pw";

describe("jarvisPreferences presenter", () => {
  it("writes both preferences through the port", () => {
    const prefs = new PreferencesSimulator({});
    const app = appWithPrefs(prefs);

    app.presenters.jarvisPreferences.setBrain("claude-opus-5");
    app.presenters.jarvisPreferences.setEffort("high");

    expect(readOnce(prefs.jarvisBrain$())).toBe("claude-opus-5");
    expect(readOnce(prefs.jarvisEffort$())).toBe("high");
  });

  it("replays the current values to a late subscriber", () => {
    const app = appWithPrefs(
      new PreferencesSimulator({
        jarvisBrain: "claude-sonnet-5",
        jarvisEffort: "low",
      }),
    );

    expect(readOnce(app.presenters.jarvisPreferences.brain$)).toBe(
      "claude-sonnet-5",
    );
    expect(readOnce(app.presenters.jarvisPreferences.effort$)).toBe("low");
  });

  it("writes the narrator preference through the port", () => {
    const prefs = new PreferencesSimulator({});
    const app = appWithPrefs(prefs);

    app.presenters.jarvisPreferences.setNarrator("off");

    expect(readOnce(prefs.jarvisNarrator$())).toBe("off");
  });

  it("replays the current narrator value to a late subscriber", () => {
    const app = appWithPrefs(
      new PreferencesSimulator({
        jarvisNarrator: "off",
      }),
    );

    expect(readOnce(app.presenters.jarvisPreferences.narrator$)).toBe("off");
  });
});

function appWithPrefs(preferences: PreferencesSimulator): App {
  return createApp(portsWith(preferences));
}

function portsWith(preferences: PreferencesSimulator): AppPorts {
  return {
    ...createSimulatorPorts({
      preferences,
      auth: new AuthSimulator({ demo: PASSWORD }),
      sessionStore: new InMemorySessionStore(),
    }),
    connectionEvents: {
      events: () => {
        return NEVER;
      },
    },
  };
}

function readOnce<T>(source$: Observable<T>): T {
  let value: T | undefined;
  source$.subscribe((v) => {
    value = v;
  });

  if (value === undefined) {
    throw new Error("stream did not emit synchronously");
  }

  return value;
}
