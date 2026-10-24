import { BehaviorSubject, NEVER, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { AuthGatedTransport, AuthViewState } from "@rtc/core-api";
import { DEFAULT_LOGIN_WAIT_VARIANT } from "@rtc/domain";

import {
  gateTransportOnAuth,
  relaySessionEndToAuth,
} from "#/bridge/transportGate";

describe("bridge/transportGate", () => {
  it("stops gating, and lets go of auth, when the lifetime aborts", () => {
    const lifetime = new AbortController();
    const auth$ = new BehaviorSubject(createAuthState("unauthenticated"));
    const calls: string[] = [];
    gateTransportOnAuth(
      createRecordingTransport(calls),
      auth$,
      lifetime.signal,
    );
    auth$.next(createAuthState("authenticated"));
    expect(calls).toEqual(["disconnect", "connect"]);
    lifetime.abort();
    expect(auth$.observed).toBe(false);
    auth$.next(createAuthState("unauthenticated"));
    expect(calls).toEqual(["disconnect", "connect"]);
  });

  it("with no transport, subscribes to nothing", () => {
    const auth$ = new BehaviorSubject(createAuthState("authenticated"));
    gateTransportOnAuth(undefined, auth$, new AbortController().signal);
    expect(auth$.observed).toBe(false);
  });
});

describe("bridge/transportGate relaySessionEndToAuth", () => {
  it("signs out once per session end, and lets go of the stream when the lifetime aborts", () => {
    const lifetime = new AbortController();
    const ended$ = new Subject<void>();
    let ends = 0;
    relaySessionEndToAuth(
      createSessionEndTransport(ended$),
      {
        endSession: () => {
          ends += 1;
        },
      },
      lifetime.signal,
    );
    ended$.next();
    ended$.next();
    expect(ends).toBe(2);
    lifetime.abort();
    expect(ended$.observed).toBe(false);
  });

  it("with no transport, does nothing", () => {
    expect(() => {
      relaySessionEndToAuth(
        undefined,
        {
          endSession: () => {
            throw new Error("never called");
          },
        },
        new AbortController().signal,
      );
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
