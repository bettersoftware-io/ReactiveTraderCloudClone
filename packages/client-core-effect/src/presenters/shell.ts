import { Cause, Effect, Option, Stream, SubscriptionRef } from "effect";

import {
  type AuthDeps,
  describeAuthFailure,
  nextLoginWaitVariant,
} from "@rtc/client-core";
import type {
  AnimationDirector,
  AnimationIntent,
  AuthPresenter,
  AuthViewState,
  BootGatePresenter,
  Stream as CoreStream,
  EquityFillSignal,
  ExecutionOutcome,
} from "@rtc/core-api";
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

import {
  createChildHost,
  type EffectHost,
  type FoldUpdate,
  type FromPort,
  refToStateStream,
  reportOutOfBand,
  scopedPortStream,
  setRefIfChanged,
  sharedFold,
} from "#/bridge/out";
import { rpc } from "#/bridge/rpc";

/** Whether the boot splash shows: a SubscriptionRef seeded once from the
 * platform's decision. `visible` reads it synchronously; `visible$` replays
 * it to each subscriber and follows it on a fiber. */
export function createBootGatePresenter(
  host: EffectHost,
  initiallyVisible: boolean,
): BootGatePresenter {
  const ref = host.runtime.runSync(SubscriptionRef.make(initiallyVisible));

  function write(visible: boolean): void {
    host.runtime.runSync(
      setRefIfChanged(ref, () => {
        return visible;
      }),
    );
  }

  return {
    visible$: refToStateStream(host, ref),
    get visible(): boolean {
      return host.runtime.runSync(SubscriptionRef.get(ref));
    },
    reboot: () => {
      write(true);
    },
    dismiss: () => {
      write(false);
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
 * — the RxJS `AuthPresenter`'s transitions over a SubscriptionRef. The
 * session is resumed at construction from the store; each login or unlock is
 * one `auth.login` call, run as a fiber in a child of the app host's scope,
 * so `app.dispose()` drops an outcome still in flight. */
export function createAuthPresenter(
  parent: EffectHost,
  deps: AuthDeps,
  now: () => number = Date.now,
): AuthPresenter {
  const host = createChildHost(parent);
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

  const ref = host.runtime.runSync(SubscriptionRef.make(resume()));

  function update(next: (view: AuthViewState) => AuthViewState): void {
    host.runtime.runSync(setRefIfChanged(ref, next));
  }

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
      update((view) => {
        return {
          ...SIGNED_OUT,
          status: "authenticated",
          user: outcome.user,
          waitVariant: view.waitVariant,
        };
      });
      return;
    }

    update((view) => {
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
      update((view) => {
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

    update((view) => {
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
    host.runtime.runFork(
      rpc(outcome$).pipe(
        Effect.flatMap((outcome) => {
          return Effect.sync(() => {
            commit(username, outcome);
          });
        }),
        Effect.catchAllCause((cause) => {
          return Effect.sync(() => {
            if (!Cause.isInterruptedOnly(cause)) {
              reportOutOfBand(cause);
            }
          });
        }),
      ),
      { scope: host.scope },
    );
  }

  return {
    state$: refToStateStream(host, ref),
    login: (username: string, password: string) => {
      update(() => {
        return {
          ...SIGNED_OUT,
          status: "authenticating",
          waitVariant: pickWaitVariant(),
        };
      });
      attempt(username, password, commitLogin);
    },
    lock: () => {
      update((view) => {
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

      const waitVariant = pickWaitVariant();
      update((view) => {
        return { ...view, unlocking: true, error: null, waitVariant };
      });
      attempt(username, password, commitUnlock);
    },
    logout: () => {
      deps.store.clear();
      currentUsername = null;
      update(() => {
        return SIGNED_OUT;
      });
    },
  };
}

/** What the director listens to — the native members' own streams. */
export interface AnimationDirectorSources {
  readonly pairs$: CoreStream<readonly CurrencyPair[]>;
  readonly priceFor: (pair: CurrencyPair) => CoreStream<Price>;
  readonly connectionStatus$: CoreStream<ConnectionStatus>;
  readonly executions$: CoreStream<ExecutionOutcome>;
  readonly rfqEvents$: CoreStream<RfqEvent>;
  readonly equityFills$: CoreStream<EquityFillSignal>;
}

/** Ticks for one roster: each pair's price stream (scoped, so a roster
 * switch releases it), paired with its previous mid — the first price only
 * primes it, the RxJS `pairwise`. */
function ticksFor(
  sources: AnimationDirectorSources,
  pairs: readonly CurrencyPair[],
): Stream.Stream<AnimationIntent, unknown> {
  return Stream.mergeAll(
    pairs.map((pair) => {
      return scopedPortStream(() => {
        return sources.priceFor(pair);
      }).pipe(
        Stream.zipWithPrevious,
        Stream.filterMap(([previous, price]) => {
          return Option.map(previous, (prior): AnimationIntent => {
            return {
              target: `tile:${pair.symbol}`,
              kind: price.mid >= prior.mid ? "tickUp" : "tickDown",
            };
          });
        }),
      );
    }),
    { concurrency: "unbounded" },
  );
}

/** The choreography intents, keyed by target — the RxJS `AnimationDirector`
 * as one refCounted fold over the six sources, the latest intent replayed
 * (its `shareReplay(1)`). Each roster switches the per-pair tick streams
 * (the `switchMap`); the connection status replayed at subscribe is dropped
 * (the `skip(1)`). */
export function createAnimationDirector(
  host: EffectHost,
  sources: AnimationDirectorSources,
): AnimationDirector {
  const all = sharedFold<AnimationIntent>(host, {
    seed: () => {
      return Option.none();
    },
    run: (update: FoldUpdate<AnimationIntent>, fromPort: FromPort) => {
      const intents: Stream.Stream<AnimationIntent, unknown> = Stream.mergeAll(
        [
          fromPort(sources.pairs$).pipe(
            Stream.flatMap(
              (pairs) => {
                return ticksFor(sources, pairs);
              },
              { switch: true },
            ),
          ),
          fromPort(sources.executions$).pipe(
            Stream.map(({ symbol, status }): AnimationIntent => {
              return {
                target: `tile:${symbol}`,
                kind: status === ExecutionStatus.Done ? "fill" : "reject",
              };
            }),
          ),
          fromPort(sources.rfqEvents$).pipe(
            Stream.filterMap((event): Option.Option<AnimationIntent> => {
              if (
                event.type === "rfqClosed" &&
                event.payload.state === RfqState.Expired
              ) {
                return Option.some({
                  target: `rfq:${event.payload.id}`,
                  kind: "expiry",
                });
              }

              if (event.type === "quoteAccepted") {
                return Option.some({
                  target: `rfq:${event.payload.rfqId}`,
                  kind: "fill",
                });
              }

              return Option.none();
            }),
          ),
          fromPort(sources.connectionStatus$).pipe(
            Stream.drop(1),
            Stream.map((): AnimationIntent => {
              return { target: "banner:connection", kind: "connectionChange" };
            }),
          ),
          fromPort(sources.equityFills$).pipe(
            Stream.map(({ symbol }): AnimationIntent => {
              return { target: `ticket:${symbol}`, kind: "fill" };
            }),
          ),
        ],
        { concurrency: "unbounded" },
      );

      return intents.pipe(
        Stream.runForEach((intent) => {
          return update(() => {
            return intent;
          });
        }),
      );
    },
  });

  return {
    intentsFor: (target: string) => {
      return sharedFold<AnimationIntent>(host, {
        seed: () => {
          return Option.none();
        },
        run: (update: FoldUpdate<AnimationIntent>, fromPort: FromPort) => {
          return fromPort(all).pipe(
            Stream.filter((intent) => {
              return intent.target === target;
            }),
            Stream.runForEach((intent) => {
              return update(() => {
                return intent;
              });
            }),
          );
        },
      });
    },
  };
}
