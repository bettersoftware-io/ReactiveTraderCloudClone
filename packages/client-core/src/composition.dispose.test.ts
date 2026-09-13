// packages/client-core/src/composition.dispose.test.ts
//
// `App.dispose()` is the core-swap seam: the RxJS core owns no runtime of its
// own, so its dispose is an idempotent no-op — but every core behind
// `CoreFactory` must honour the same contract, so the contract gets a test
// here rather than living only in the type.

import { NEVER } from "rxjs";
import { describe, expect, it } from "vitest";

import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import type { AppPorts } from "#/adapters/portFactory";
import { createSimulatorPorts } from "#/adapters/portFactory";
import { createApp } from "#/composition";

describe("createApp().dispose", () => {
  it("resolves and is idempotent", async () => {
    const app = createApp(simulatorPorts());

    await expect(app.dispose()).resolves.toBeUndefined();
    await expect(app.dispose()).resolves.toBeUndefined();
  });
});

function simulatorPorts(): AppPorts {
  return {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator({}),
      auth: new AuthSimulator({ demo: "pw" }),
      sessionStore: new InMemorySessionStore(),
    }),
    connectionEvents: {
      events: () => {
        return NEVER;
      },
    },
  };
}
