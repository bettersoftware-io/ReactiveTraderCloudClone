import { Effect, Exit, Scope } from "effect";
import { BehaviorSubject, NEVER, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { AuthGatedTransport, AuthViewState } from "@rtc/core-api";
import { DEFAULT_LOGIN_WAIT_VARIANT } from "@rtc/domain";

import { createDetachedHost } from "#/bridge/out";
import {
  gateTransportOnAuth,
  relaySessionEndToAuth,
} from "#/bridge/transportGate";

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

describe("bridge/transportGate relaySessionEndToAuth", () => {
  it("signs out once per session end, and lets go of the stream when the host scope closes", async () => {
    const host = createDetachedHost();
    const ended$ = new Subject<void>();
    let ends = 0;
    relaySessionEndToAuth(host, createSessionEndTransport(ended$), {
      endSession: () => {
        ends += 1;
      },
    });
    ended$.next();
    ended$.next();
    expect(ends).toBe(2);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    expect(ended$.observed).toBe(false);
  });

  it("with no transport, does nothing", () => {
    expect(() => {
      relaySessionEndToAuth(createDetachedHost(), undefined, {
        endSession: () => {
          throw new Error("never called");
        },
      });
    }).not.toThrow();
  });
});

function createSessionEndTransport(ended$: Subject<void>): AuthGatedTransport {
  return {
    connect: () => {},
    disconnect: () => {},
    sessionEnded: () => {
      return ended$;
    },
  };
}

function createRecordingTransport(calls: string[]): AuthGatedTransport {
  return {
    connect: () => {
      calls.push("connect");
    },
    disconnect: () => {
      calls.push("disconnect");
    },
    sessionEnded: () => {
      return NEVER;
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
    failure: null,
    waitVariant: DEFAULT_LOGIN_WAIT_VARIANT,
  };
}
