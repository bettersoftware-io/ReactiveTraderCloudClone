import { Observable, of, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthOutcome, AuthPort } from "@rtc/domain";

import { withLoginDelay } from "#/adapters/delayedAuthPort";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withLoginDelay", () => {
  it("passes the outcome through synchronously when the delay is zero", () => {
    // The whole point of the `ms <= 0` branch: users who never touch this
    // preference must not have their sign-in pushed onto a later macrotask.
    const port = withLoginDelay(portEmitting(OK), () => {
      return 0;
    });
    const seen: AuthOutcome[] = [];
    port.login("astark", "pw").subscribe((o) => {
      seen.push(o);
    });
    expect(seen).toEqual([OK]);
  });

  it("holds the outcome for the supplied delay, then emits it unchanged", () => {
    const port = withLoginDelay(portEmitting(OK), () => {
      return 3_000;
    });
    const seen: AuthOutcome[] = [];
    port.login("astark", "pw").subscribe((o) => {
      seen.push(o);
    });

    vi.advanceTimersByTime(2_999);
    expect(seen).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(seen).toEqual([OK]);
  });

  it("delays a rejection just as it delays a success", () => {
    // The wait treatment renders for failed attempts too — a delay that only
    // applied to the happy path would leave the failure case uninspectable.
    const port = withLoginDelay(portEmitting(DENIED), () => {
      return 1_000;
    });
    const seen: AuthOutcome[] = [];
    port.login("astark", "wrong").subscribe((o) => {
      seen.push(o);
    });

    vi.advanceTimersByTime(1_000);
    expect(seen).toEqual([DENIED]);
  });

  it("re-reads the supplier per attempt, so a preference change lands on the next login", () => {
    let ms = 0;
    const port = withLoginDelay(portEmitting(OK), () => {
      return ms;
    });

    const first: AuthOutcome[] = [];
    port.login("astark", "pw").subscribe((o) => {
      first.push(o);
    });
    expect(first).toEqual([OK]);

    ms = 5_000;
    const second: AuthOutcome[] = [];
    port.login("astark", "pw").subscribe((o) => {
      second.push(o);
    });
    expect(second).toEqual([]);
    vi.advanceTimersByTime(5_000);
    expect(second).toEqual([OK]);
  });

  it("forwards the credentials to the wrapped port untouched", () => {
    const calls: Array<readonly [string, string]> = [];
    const inner: AuthPort = {
      login: (username: string, password: string) => {
        calls.push([username, password]);
        return of(OK);
      },
    };
    withLoginDelay(inner, () => {
      return 0;
    })
      .login("nromanoff", "mcdc2026")
      .subscribe();
    expect(calls).toEqual([["nromanoff", "mcdc2026"]]);
  });

  it("stays as cold as the port it wraps — no work until the caller subscribes", () => {
    // Counts SUBSCRIPTIONS, not calls to login(): the real WS port does its
    // work inside `new Observable(...)`, so building the pipeline is free and
    // only subscribing dispatches. The wrapper must not change that.
    let subscribed = 0;
    const inner: AuthPort = {
      login: () => {
        return new Observable<AuthOutcome>((subscriber) => {
          subscribed += 1;
          subscriber.next(OK);
          subscriber.complete();
        });
      },
    };

    const pending = withLoginDelay(inner, () => {
      return 0;
    }).login("astark", "pw");
    expect(subscribed).toBe(0);
    pending.subscribe();
    expect(subscribed).toBe(1);
  });

  it("drops a pending delayed outcome when the caller unsubscribes first", () => {
    const port = withLoginDelay(portEmitting(OK), () => {
      return 3_000;
    });
    const seen: AuthOutcome[] = [];
    const sub = port.login("astark", "pw").subscribe((o) => {
      seen.push(o);
    });
    sub.unsubscribe();
    vi.advanceTimersByTime(10_000);
    expect(seen).toEqual([]);
  });

  it("delays a late outcome from an async port by the full duration", () => {
    const outcome$ = new Subject<AuthOutcome>();
    const port = withLoginDelay(
      {
        login: () => {
          return outcome$;
        },
      },
      () => {
        return 1_000;
      },
    );
    const seen: AuthOutcome[] = [];
    port.login("astark", "pw").subscribe((o) => {
      seen.push(o);
    });

    vi.advanceTimersByTime(4_000);
    outcome$.next(OK);
    expect(seen).toEqual([]);

    vi.advanceTimersByTime(1_000);
    expect(seen).toEqual([OK]);
  });
});

const OK: AuthOutcome = {
  ok: true,
  token: "tok",
  user: {
    name: "Anthony Stark",
    initials: "AS",
    role: "Trader",
    id: "astark",
    email: "astark@rtc.dev",
    desk: "FX",
    clearance: "L3",
  },
  exp: 1,
};

const DENIED: AuthOutcome = { ok: false, reason: "invalid" };

function portEmitting(outcome: AuthOutcome): AuthPort {
  return {
    login: () => {
      return of(outcome);
    },
  };
}
