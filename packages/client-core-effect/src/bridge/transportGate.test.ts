import { Effect, Exit, Scope } from "effect";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { AuthGatedTransport, AuthViewState } from "@rtc/core-api";
import { DEFAULT_LOGIN_WAIT_VARIANT } from "@rtc/domain";

import { createDetachedHost } from "#/bridge/out";
import { gateTransportOnAuth } from "#/bridge/transportGate";

describe("bridge/transportGate", () => {
  it("stops gating, and lets go of auth, when the host scope closes", async () => {
    const host = createDetachedHost();
    const auth$ = new BehaviorSubject(createAuthState("unauthenticated"));
    const calls: string[] = [];
    gateTransportOnAuth(host, createRecordingTransport(calls), auth$);
    auth$.next(createAuthState("authenticated"));
    expect(calls).toEqual(["disconnect", "connect"]);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    expect(auth$.observed).toBe(false);
    auth$.next(createAuthState("unauthenticated"));
    expect(calls).toEqual(["disconnect", "connect"]);
  });

  it("with no transport, subscribes to nothing", () => {
    const auth$ = new BehaviorSubject(createAuthState("authenticated"));
    gateTransportOnAuth(createDetachedHost(), undefined, auth$);
    expect(auth$.observed).toBe(false);
  });
});

function createRecordingTransport(calls: string[]): AuthGatedTransport {
  return {
    connect: () => {
      calls.push("connect");
    },
    disconnect: () => {
      calls.push("disconnect");
    },
  };
}

function createAuthState(status: AuthViewState["status"]): AuthViewState {
  return {
    status,
    user: null,
    locked: false,
    unlocking: false,
    error: null,
    waitVariant: DEFAULT_LOGIN_WAIT_VARIANT,
  };
}
