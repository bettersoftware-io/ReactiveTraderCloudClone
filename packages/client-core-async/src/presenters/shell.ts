import type {
  AnimationDirector,
  AnimationIntent,
  AuthPresenter,
  AuthViewState,
  BootGatePresenter,
  EquityFillSignal,
  ExecutionOutcome,
  Stream,
} from "@rtc/core-api";
import {
  type AuthDeps,
  describeAuthFailure,
  nextLoginWaitVariant,
} from "@rtc/core-logic";
import {
  type AuthOutcome,
  type ConnectionStatus,
  type CurrencyPair,
  DEFAULT_LOGIN_WAIT_VARIANT,
  ExecutionStatus,
  type LoginWaitVariant,
  type Price,
  type RfqEvent,
  RfqState,
  type SessionUser,
} from "@rtc/domain";

import { once, relay } from "#/bridge/in";
import { storeToStateStream, topicToStream } from "#/bridge/out";
import { relayTopic } from "#/kernel/relayTopic";
import { reportAsync } from "#/kernel/reportAsync";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";
import { createTopic, type Topic } from "#/kernel/topic";

/** Whether the boot splash shows: a Store seeded once from the platform's
 * decision, readable synchronously and as a replay-current stream. */
export function createBootGatePresenter(
  initiallyVisible: boolean,
): BootGatePresenter {
  const store = createStore<boolean>(initiallyVisible);

  return {
    visible$: storeToStateStream(store),
    get visible(): boolean {
      return store.get();
    },
    reboot: () => {
      store.set(true);
    },
    dismiss: () => {
      store.set(false);
    },
  };
}

const SIGNED_OUT: AuthViewState = {
  status: "unauthenticated",
  user: null,
  locked: false,
  unlocking: false,
  error: null,
  waitVariant: DEFAULT_LOGIN_WAIT_VARIANT,
};

/** The login / lock / unlock / logout lifecycle over `createAuthDeps(ports)`
 * — the RxJS `AuthPresenter`'s transitions over a Store. The session is
 * resumed at construction from the store (an entry that has not expired
 * signs in; anything else clears it). Each login or unlock is one
 * `auth.login` call, committed when it lands. */
export function createAuthPresenter(
  deps: AuthDeps,
  lifetime: AbortSignal,
  now: () => number = Date.now,
): AuthPresenter {
  let currentUsername: string | null = null;

  function resume(): AuthViewState {
    const entry = deps.store.read();

    if (entry !== null && entry.exp > now()) {
      currentUsername = entry.username;
      return { ...SIGNED_OUT, status: "authenticated", user: entry.user };
    }

    deps.store.clear();
    return SIGNED_OUT;
  }

  const store = createStore<AuthViewState>(resume());

  function pickWaitVariant(): LoginWaitVariant {
    const variant = deps.cycle.current();
    deps.cycle.advance(nextLoginWaitVariant(variant));
    return variant;
  }

  function writeSession(
    username: string,
    token: string,
    user: SessionUser,
    exp: number,
  ): void {
    deps.store.write({ token, user, username, exp });
  }

  function commitLogin(username: string, outcome: AuthOutcome): void {
    if (outcome.ok) {
      currentUsername = username;
      writeSession(username, outcome.token, outcome.user, outcome.exp);
      store.set((view) => {
        return {
          ...SIGNED_OUT,
          status: "authenticated",
          user: outcome.user,
          waitVariant: view.waitVariant,
        };
      });
      return;
    }

    store.set((view) => {
      return {
        ...SIGNED_OUT,
        error: describeAuthFailure(outcome.reason),
        waitVariant: view.waitVariant,
      };
    });
  }

  function commitUnlock(username: string, outcome: AuthOutcome): void {
    if (outcome.ok) {
      writeSession(username, outcome.token, outcome.user, outcome.exp);
      store.set((view) => {
        return {
          ...view,
          user: outcome.user,
          locked: false,
          unlocking: false,
          error: null,
        };
      });
      return;
    }

    store.set((view) => {
      return {
        ...view,
        locked: true,
        unlocking: false,
        error: describeAuthFailure(outcome.reason),
      };
    });
  }

  function attempt(
    username: string,
    password: string,
    commit: (username: string, outcome: AuthOutcome) => void,
  ): void {
    const outcome$ = deps.auth.login(username, password);
    void spawn(async () => {
      commit(username, await once(outcome$, lifetime));
    }, reportAsync);
  }

  return {
    state$: storeToStateStream(store),
    login: (username: string, password: string) => {
      store.set({
        ...SIGNED_OUT,
        status: "authenticating",
        waitVariant: pickWaitVariant(),
      });
      attempt(username, password, commitLogin);
    },
    lock: () => {
      store.set((view) => {
        return view.status === "authenticated"
          ? { ...view, locked: true }
          : view;
      });
    },
    unlock: (password: string) => {
      const username = currentUsername;

      if (username === null) {
        return;
      }

      store.set((view) => {
        return {
          ...view,
          unlocking: true,
          error: null,
          waitVariant: pickWaitVariant(),
        };
      });
      attempt(username, password, commitUnlock);
    },
    logout: () => {
      deps.store.clear();
      currentUsername = null;
      store.set(SIGNED_OUT);
    },
  };
}

/** What the director listens to — the native members' own streams. */
export interface AnimationDirectorSources {
  readonly pairs$: Stream<readonly CurrencyPair[]>;
  readonly priceFor: (pair: CurrencyPair) => Stream<Price>;
  readonly connectionStatus$: Stream<ConnectionStatus>;
  readonly executions$: Stream<ExecutionOutcome>;
  readonly rfqEvents$: Stream<RfqEvent>;
  readonly equityFills$: Stream<EquityFillSignal>;
}

/** The choreography intents, keyed by target — the RxJS `AnimationDirector`
 * as one refCounted topic over the six sources. Each roster restarts the
 * per-pair tick relays (the `switchMap`); a pair's first price only primes
 * it (the `pairwise`); the connection status replayed at subscribe is not
 * a change (the `skip(1)`). */
export function createAnimationDirector(
  sources: AnimationDirectorSources,
): AnimationDirector {
  const all: Topic<AnimationIntent> = createTopic<AnimationIntent>(
    (signal, publish) => {
      let roster: AbortController | null = null;

      function tickPairs(pairs: readonly CurrencyPair[]): void {
        roster?.abort();
        const current = new AbortController();
        roster = current;

        for (const pair of pairs) {
          let previous: number | null = null;
          void spawn(
            () => {
              return relay(sources.priceFor(pair), current.signal, (p) => {
                if (previous !== null) {
                  publish({
                    target: `tile:${pair.symbol}`,
                    kind: p.mid >= previous ? "tickUp" : "tickDown",
                  });
                }

                previous = p.mid;
              });
            },
            (error) => {
              all.fail(error);
            },
          );
        }
      }

      signal.addEventListener(
        "abort",
        () => {
          roster?.abort();
        },
        { once: true },
      );

      let statusSeen = false;

      return Promise.all([
        relay(sources.pairs$, signal, tickPairs),
        relay(sources.executions$, signal, ({ symbol, status }) => {
          publish({
            target: `tile:${symbol}`,
            kind: status === ExecutionStatus.Done ? "fill" : "reject",
          });
        }),
        relay(sources.rfqEvents$, signal, (event) => {
          if (
            event.type === "rfqClosed" &&
            event.payload.state === RfqState.Expired
          ) {
            publish({ target: `rfq:${event.payload.id}`, kind: "expiry" });
          } else if (event.type === "quoteAccepted") {
            publish({ target: `rfq:${event.payload.rfqId}`, kind: "fill" });
          }
        }),
        relay(sources.connectionStatus$, signal, () => {
          if (statusSeen) {
            publish({ target: "banner:connection", kind: "connectionChange" });
          }

          statusSeen = true;
        }),
        relay(sources.equityFills$, signal, ({ symbol }) => {
          publish({ target: `ticket:${symbol}`, kind: "fill" });
        }),
      ]).then(() => {});
    },
    { replay: true },
  );

  return {
    intentsFor: (target: string) => {
      const forTarget = createTopic<AnimationIntent>(
        (signal, publish) => {
          return relayTopic(all, signal, (intent) => {
            if (intent.target === target) {
              publish(intent);
            }
          });
        },
        { replay: true },
      );

      return topicToStream(forTarget);
    },
  };
}
