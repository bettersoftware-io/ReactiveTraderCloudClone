import { act, renderHook } from "@testing-library/react";
import { type Observable, of } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type AppPorts,
  createApp,
  createMachineFactories,
  createSimulatorPorts,
  InMemorySessionStore,
} from "@rtc/client-core";
import {
  type AuthOutcome,
  type AuthPort,
  ConnectionEventsSimulator,
  PreferencesSimulator,
  type SessionUser,
} from "@rtc/domain";

import { createViewModel, type ViewModel } from "#/createViewModel";

describe("useAuth", () => {
  it("starts unauthenticated with no user", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useAuth();
    });
    expect(result.current.state.status).toBe("unauthenticated");
    expect(result.current.state.user).toBeNull();
  });

  it("login transitions to authenticated and sets the user", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useAuth();
    });

    act(() => {
      result.current.login("demo", "pw");
    });

    expect(result.current.state.status).toBe("authenticated");
    expect(result.current.state.user).toEqual(DEMO_USER);
  });
});

function makeHooks(): ViewModel {
  const { presenters, commands } = createApp(createSimPorts());
  return createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
  );

  function createSimPorts(): AppPorts {
    return {
      ...createSimulatorPorts({
        preferences: new PreferencesSimulator(),
        auth: createFakeAuthPort(),
        sessionStore: new InMemorySessionStore(),
      }),
      connectionEvents: new ConnectionEventsSimulator(),
    };
  }
}

const DEMO_USER: SessionUser = {
  name: "Demo Trader",
  initials: "DT",
  role: "Trader",
  id: "demo-1",
  email: "demo@example.com",
  desk: "FX",
  clearance: "standard",
};

/** Deterministic fake AuthPort — resolves synchronously so `login`'s effect
 * lands within the same `act()` (mirrors `of(...)`'s synchronous emission). */
function createFakeAuthPort(): AuthPort {
  return {
    login(username: string, password: string): Observable<AuthOutcome> {
      if (username === "demo" && password === "pw") {
        return of({ ok: true, token: "t", user: DEMO_USER });
      }

      return of({ ok: false, reason: "invalid" });
    },
  };
}
