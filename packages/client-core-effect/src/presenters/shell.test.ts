import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import type { AuthDeps } from "@rtc/client-core";
import type {
  AnimationIntent,
  AuthViewState,
  EquityFillSignal,
  ExecutionOutcome,
  StoredSession,
} from "@rtc/core-api";
import {
  type AuthOutcome,
  type ConnectionStatus,
  type CurrencyPair,
  DEFAULT_LOGIN_WAIT_VARIANT,
  type Price,
  type RfqEvent,
  ROSTER,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import {
  createAnimationDirector,
  createAuthPresenter,
  createBootGatePresenter,
} from "#/presenters/shell";

describe("shell presenters (effect)", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("bootGate reads the seed synchronously and a subscriber follows dismiss/reboot", async () => {
    const gate = createBootGatePresenter(useHost(), false);
    const seen: boolean[] = [];
    const sub = gate.visible$.subscribe((v) => {
      seen.push(v);
    });
    gate.reboot();
    await tick();
    gate.dismiss();
    await tick();

    expect(seen).toEqual([false, true, false]);
    expect(gate.visible).toBe(false);
    sub.unsubscribe();
  });

  // The contract suite cannot prove this for a sibling (slice-6 ledger A-5).
  it("auth: a stored session that has expired is cleared at resume", () => {
    const rig = createAuthRig(createSession(1_000));
    createAuthPresenter(useHost(), rig.deps, () => {
      return 1_000;
    });

    expect(rig.stored()).toBeNull();
  });

  it("auth: a live session resumes signed in, and is left in the store", () => {
    const session = createSession(2_000);
    const rig = createAuthRig(session);
    const auth = createAuthPresenter(useHost(), rig.deps, () => {
      return 1_000;
    });
    const first: AuthViewState[] = [];
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

  it("auth: a login whose outcome lands after the host scope closes commits nothing", async () => {
    const rig = createAuthRig(null);
    const host = useHost();
    const auth = createAuthPresenter(host, rig.deps);
    auth.login("demo", "pw");
    await tick();
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    rig.reply.next({
      ok: true,
      token: "t",
      user: ROSTER[0].user,
      exp: Date.now() + 1_000,
    });
    await tick();

    expect(rig.reply.observed).toBe(false);
    expect(rig.stored()).toBeNull();
  });

  it("director: releases a dropped pair's price stream when the roster changes, and every source on the last unsubscribe", async () => {
    const rig = createDirectorRig();
    const director = createAnimationDirector(useHost(), rig.sources);
    const seen: AnimationIntent[] = [];
    const sub = director.intentsFor("tile:EURUSD").subscribe((i) => {
      seen.push(i);
    });
    await tick();
    rig.pairs.next([EURUSD]);
    await tick();
    expect(rig.price("EURUSD").observed).toBe(true);
    rig.pairs.next([GBPUSD]);
    await tick();
    expect(rig.price("EURUSD").observed).toBe(false);
    expect(rig.price("GBPUSD").observed).toBe(true);
    sub.unsubscribe();
    await tick();

    expect(rig.pairs.observed).toBe(false);
    expect(rig.price("GBPUSD").observed).toBe(false);
    expect(rig.executions.observed).toBe(false);
    expect(seen).toEqual([]);
  });

  const hosts: TestHost[] = [];

  function useHost(): TestHost {
    const host: TestHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}

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
  readonly sources: Parameters<typeof createAnimationDirector>[1];
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

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
