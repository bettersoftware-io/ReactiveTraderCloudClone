import { Cause, Effect, Option, Stream } from "effect";

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

import {
  createChildHost,
  type EffectHost,
  type FoldUpdate,
  type FromPort,
  filterStream,
  type PortEvents,
  portEvents,
  reportOutOfBand,
  sharedFold,
  switchedPortEvents,
} from "#/bridge/out";
import { rpc } from "#/bridge/rpc";
import { createSyncRef } from "#/bridge/syncRef";

/** Whether the boot splash shows: a `SyncRef` seeded once from the
 * platform's decision. `visible` reads it synchronously; `visible$` replays
 * it to each subscriber and follows every change. */
export function createBootGatePresenter(
  initiallyVisible: boolean,
): BootGatePresenter {
  const ref = createSyncRef(initiallyVisible);

  function write(visible: boolean): void {
    ref.set(() => {
      return visible;
    });
  }

  return {
    visible$: ref.stateStream(),
    get visible(): boolean {
      return ref.get();
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

/** The login / lock / unlock / logout lifecycle over `createAuthDeps(ports, authDepsPrimitives)`
 * — the RxJS `AuthPresenter`'s transitions over a `SyncRef`. The
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

  const ref = createSyncRef(resume());

  function update(next: (view: AuthViewState) => AuthViewState): void {
    ref.set(next);
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
    state$: ref.stateStream(),
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

/** Ticks for the latest roster, as one source of the director's merged
 * stream: each pair's price against its previous mid — the first price of a
 * pair only primes it, the RxJS `pairwise`. The previous mid lives in the
 * group's own closure, so a roster switch starts every pair afresh. */
function ticksOfLatestRoster(
  sources: AnimationDirectorSources,
): PortEvents<Option.Option<AnimationIntent>> {
  return switchedPortEvents(
    sources.pairs$,
    (pairs: readonly CurrencyPair[]) => {
      return pairs.map((pair) => {
        let prior: Option.Option<number> = Option.none();

        return portEvents(sources.priceFor(pair), (price: Price) => {
          const tick = Option.map(prior, (mid): AnimationIntent => {
            return {
              target: `tile:${pair.symbol}`,
              kind: price.mid >= mid ? "tickUp" : "tickDown",
            };
          });
          prior = Option.some(price.mid);
          return tick;
        });
      });
    },
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
      // The connection status current at subscribe is not a change: the
      // first value this period hears from that port is dropped (the RxJS
      // `skip(1)`).
      let statusSeen = false;
      const intents = fromPort.merged<Option.Option<AnimationIntent>>([
        ticksOfLatestRoster(sources),
        portEvents(sources.executions$, ({ symbol, status }) => {
          return Option.some<AnimationIntent>({
            target: `tile:${symbol}`,
            kind: status === ExecutionStatus.Done ? "fill" : "reject",
          });
        }),
        portEvents(
          sources.rfqEvents$,
          (event): Option.Option<AnimationIntent> => {
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
          },
        ),
        portEvents(
          sources.connectionStatus$,
          (): Option.Option<AnimationIntent> => {
            if (!statusSeen) {
              statusSeen = true;
              return Option.none();
            }

            return Option.some({
              target: "banner:connection",
              kind: "connectionChange",
            });
          },
        ),
        portEvents(sources.equityFills$, ({ symbol }) => {
          return Option.some<AnimationIntent>({
            target: `ticket:${symbol}`,
            kind: "fill",
          });
        }),
      ]);

      return intents.pipe(
        Stream.filterMap((intent) => {
          return intent;
        }),
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
      return filterStream(all, (intent: AnimationIntent) => {
        return intent.target === target;
      });
    },
  };
}
