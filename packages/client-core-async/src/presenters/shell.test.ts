import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type {
  AnimationIntent,
  EquityFillSignal,
  ExecutionOutcome,
  StoredSession,
} from "@rtc/core-api";
import type { AuthDeps } from "@rtc/core-logic";
import {
  type AuthOutcome,
  type ConnectionStatus,
  type CurrencyPair,
  DEFAULT_LOGIN_WAIT_VARIANT,
  type Price,
  type RfqEvent,
  ROSTER,
} from "@rtc/domain";

import {
  createAnimationDirector,
  createAuthPresenter,
  createBootGatePresenter,
} from "#/presenters/shell";

describe("createBootGatePresenter (async)", () => {
  it("reads the seed synchronously and follows dismiss/reboot", () => {
    const gate = createBootGatePresenter(false);
    const seen: boolean[] = [];
    const sub = gate.visible$.subscribe((v) => {
      seen.push(v);
    });
    gate.reboot();
    gate.dismiss();

    expect(seen).toEqual([false, true, false]);
    expect(gate.visible).toBe(false);
    sub.unsubscribe();
  });
});

describe("createAuthPresenter (async)", () => {
  // Also contracted (the auth suite's expired-session case); pinned here at
  // the presenter, without composition.
  it("a stored session that has expired is cleared at resume", () => {
    const rig = createAuthRig(createSession(1_000));
    createAuthPresenter(rig.deps, new AbortController().signal, () => {
      return 1_000;
    });

    expect(rig.stored()).toBeNull();
  });

  it("a live session resumes signed in, and is left in the store", () => {
    const session = createSession(2_000);
    const rig = createAuthRig(session);
    const auth = createAuthPresenter(
      rig.deps,
      new AbortController().signal,
      () => {
        return 1_000;
      },
    );

    const first: unknown[] = [];
    auth.state$
      .subscribe((view) => {
        first.push(view);
      })
      .unsubscribe();

    expect(first[0]).toMatchObject({
      status: "authenticated",
      user: session.user,
    });
    expect(rig.stored()).toBe(session);
  });

  it("a login whose outcome lands after the lifetime aborts commits nothing", async () => {
    const rig = createAuthRig(null);
    const lifetime = new AbortController();
    const auth = createAuthPresenter(rig.deps, lifetime.signal);
    // Subscribed first: a cold getValue() returns the construction-time
    // state whether or not anything later landed.
    const seen: string[] = [];
    const sub = auth.state$.subscribe((view) => {
      seen.push(view.status);
    });
    auth.login("demo", "pw");
    lifetime.abort();
    rig.reply.next({
      ok: true,
      token: "t",
      user: ROSTER[0].user,
      exp: Date.now() + 1_000,
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(rig.reply.observed).toBe(false);
    expect(seen.at(-1)).toBe("authenticating");
    expect(rig.stored()).toBeNull();
    sub.unsubscribe();
  });
});

describe("createAnimationDirector (async)", () => {
  it("releases a dropped pair's price stream when the roster changes, and every source on the last unsubscribe", () => {
    const rig = createDirectorRig();
    const director = createAnimationDirector(rig.sources);
    const seen: AnimationIntent[] = [];
    const sub = director.intentsFor("tile:EURUSD").subscribe((i) => {
      seen.push(i);
    });
    rig.pairs.next([EURUSD]);
    expect(rig.price("EURUSD").observed).toBe(true);
    rig.pairs.next([GBPUSD]);
    expect(rig.price("EURUSD").observed).toBe(false);
    expect(rig.price("GBPUSD").observed).toBe(true);
    sub.unsubscribe();

    expect(rig.pairs.observed).toBe(false);
    expect(rig.price("GBPUSD").observed).toBe(false);
    expect(rig.executions.observed).toBe(false);
    expect(seen).toEqual([]);
  });
});

const EURUSD = { symbol: "EURUSD" } as CurrencyPair;
const GBPUSD = { symbol: "GBPUSD" } as CurrencyPair;

function createSession(exp: number): StoredSession {
  return {
    token: "stored",
    user: ROSTER[0].user,
    username: ROSTER[0].username,
    exp,
  };
}

interface AuthRig {
  readonly deps: AuthDeps;
  readonly reply: Subject<AuthOutcome>;
  stored(): StoredSession | null;
}

function createAuthRig(initial: StoredSession | null): AuthRig {
  let stored = initial;
  const reply = new Subject<AuthOutcome>();

  return {
    deps: {
      auth: {
        login: () => {
          return reply;
        },
      },
      store: {
        read: () => {
          return stored;
        },
        write: (session: StoredSession) => {
          stored = session;
        },
        clear: () => {
          stored = null;
        },
      },
      cycle: {
        current: () => {
          return DEFAULT_LOGIN_WAIT_VARIANT;
        },
        advance: () => {},
      },
    },
    reply,
    stored: () => {
      return stored;
    },
  };
}

interface DirectorRig {
  readonly sources: Parameters<typeof createAnimationDirector>[0];
  readonly pairs: Subject<readonly CurrencyPair[]>;
  readonly executions: Subject<ExecutionOutcome>;
  price(symbol: string): Subject<Price>;
}

function createDirectorRig(): DirectorRig {
  const pairs = new Subject<readonly CurrencyPair[]>();
  const executions = new Subject<ExecutionOutcome>();
  const prices = new Map<string, Subject<Price>>();

  function price(symbol: string): Subject<Price> {
    const existing = prices.get(symbol);

    if (existing !== undefined) {
      return existing;
    }

    const created = new Subject<Price>();
    prices.set(symbol, created);
    return created;
  }

  return {
    sources: {
      pairs$: pairs,
      priceFor: (pair: CurrencyPair) => {
        return price(pair.symbol);
      },
      connectionStatus$: new Subject<ConnectionStatus>(),
      executions$: executions,
      rfqEvents$: new Subject<RfqEvent>(),
      equityFills$: new Subject<EquityFillSignal>(),
    },
    pairs,
    executions,
    price,
  };
}
