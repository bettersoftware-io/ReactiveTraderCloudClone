// packages/client-core/src/composition.authGate.test.ts
//
// The transport must stay closed until the user is authenticated. Opening it
// at composition time sends a tokenless upgrade the server rejects (401 via
// `verifyClient`), which the adapter then retries every few seconds behind the
// login screen — the "WebSocket connects before login" defect.

import { NEVER } from "rxjs";
import { describe, expect, it, type Mock, vi } from "vitest";

import {
  AuthSimulator,
  findRosterUser,
  PreferencesSimulator,
} from "@rtc/domain";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import type { AppPorts, AuthGatedTransport } from "#/adapters/portFactory";
import { createSimulatorPorts } from "#/adapters/portFactory";
import { createApp } from "#/composition";

const PASSWORD = "pw";

describe("createApp transport auth gate", () => {
  it("does not open the transport for an unauthenticated boot", () => {
    const transport = fakeTransport();

    createApp(portsWith(transport));

    expect(transport.connect).not.toHaveBeenCalled();
  });

  it("opens the transport once login succeeds", () => {
    const transport = fakeTransport();
    const app = createApp(portsWith(transport));

    app.presenters.auth.login("demo", PASSWORD);

    expect(transport.connect).toHaveBeenCalled();
  });

  it("leaves the transport closed when login fails", () => {
    const transport = fakeTransport();
    const app = createApp(portsWith(transport));

    app.presenters.auth.login("demo", "wrong");

    expect(transport.connect).not.toHaveBeenCalled();
  });

  it("closes the transport on sign-out", () => {
    const transport = fakeTransport();
    const app = createApp(portsWith(transport));
    app.presenters.auth.login("demo", PASSWORD);

    app.presenters.auth.logout();

    expect(transport.disconnect).toHaveBeenCalled();
  });

  it("opens the transport immediately for a resumed session", () => {
    // A returning user is already authenticated at composition time, so the
    // gate must not strand them behind a closed transport.
    const entry = findRosterUser("demo");

    if (!entry) {
      throw new Error("roster is missing the demo account");
    }

    const store = new InMemorySessionStore();
    store.write({
      username: "demo",
      token: "tok",
      user: entry.user,
      exp: Date.now() + 60_000,
    });

    const transport = fakeTransport();
    createApp(portsWith(transport, store));

    expect(transport.connect).toHaveBeenCalled();
  });
});

interface FakeTransport {
  connect: Mock;
  disconnect: Mock;
}

function fakeTransport(): FakeTransport {
  return { connect: vi.fn(), disconnect: vi.fn() };
}

function portsWith(
  transport: AuthGatedTransport,
  sessionStore = new InMemorySessionStore(),
): AppPorts {
  return {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator(),
      auth: new AuthSimulator({ demo: PASSWORD }),
      sessionStore,
    }),
    connectionEvents: {
      events: () => {
        return NEVER;
      },
    },
    transport,
  };
}
