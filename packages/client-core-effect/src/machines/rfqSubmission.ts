import {
  Duration,
  Effect,
  Either,
  Exit,
  Fiber,
  Scope,
  SubscriptionRef,
} from "effect";

import type {
  Machine,
  RfqSubmissionIntents,
  RfqSubmissionState,
  Stream,
} from "@rtc/core-api";
import { type CreateRfqInput, RFQ_REDIRECT_DELAY_MS } from "@rtc/domain";

import {
  createDetachedHost,
  refToStateStream,
  setRefIfChanged,
} from "#/bridge/out";
import { rpc } from "#/bridge/rpc";

export interface RfqSubmissionDeps {
  /** The create-RFQ command (`RfqsPresenter.createRfq`). */
  createRfq: (input: CreateRfqInput) => Stream<number>;
}

/** What a run acts through — the same run-token guard `rfqTile` writes
 * behind, widened from "a write" to "any step with an effect the world can
 * see". EVERY externally visible step goes through it, the `onRedirect`
 * callback included: a run superseded a fiber-step ago must not write over
 * its successor's state, and must not navigate on its behalf either. */
type Guarded = (step: Effect.Effect<void>) => Effect.Effect<void>;

const EDITING: RfqSubmissionState = { status: "editing" };
const SUBMITTING: RfqSubmissionState = { status: "submitting" };

/** editing → submitting → confirmed{rfqId} → (RFQ_REDIRECT_DELAY_MS)
 * onRedirect(rfqId) → editing; a failed create returns to editing. A new
 * `submit()` interrupts the run in flight (the RxJS `switchMap`), which
 * withdraws its port call through `rpc`'s finalizer; `dispose()` interrupts
 * it too. A pending redirect never fires: every externally visible step —
 * `onRedirect` as much as a state write — runs through `Guarded`, so that
 * promise rests on the run token this machine owns and not only on when
 * Effect chooses to deliver an interrupt. */
export function createRfqSubmissionMachine(
  deps: RfqSubmissionDeps,
): Machine<RfqSubmissionState, RfqSubmissionIntents> {
  const host = createDetachedHost();
  const ref = host.runtime.runSync(
    SubscriptionRef.make<RfqSubmissionState>(EDITING),
  );
  let active: object | null = null;
  let activeFiber: Fiber.RuntimeFiber<void> | null = null;
  let disposed = false;

  function endActive(): void {
    active = null;

    if (activeFiber !== null) {
      Effect.runFork(Fiber.interrupt(activeFiber));
      activeFiber = null;
    }
  }

  function writeState(next: RfqSubmissionState): Effect.Effect<void> {
    return setRefIfChanged(ref, () => {
      return next;
    });
  }

  function runSubmit(
    input: CreateRfqInput,
    onRedirect: (rfqId: number) => void,
    guarded: Guarded,
  ): Effect.Effect<void> {
    return Effect.gen(function* runCreateRfq() {
      yield* guarded(writeState(SUBMITTING));
      const created = yield* Effect.either(rpc(deps.createRfq(input)));

      if (Either.isLeft(created)) {
        yield* guarded(writeState(EDITING));
        return;
      }

      const rfqId = created.right;
      yield* guarded(writeState({ status: "confirmed", rfqId }));
      yield* Effect.sleep(Duration.millis(RFQ_REDIRECT_DELAY_MS));
      // Guarded like a write, and for the same reason: the timer may fire
      // with the run already superseded or the machine already disposed,
      // and interruption only lands at the run's next suspension. This is
      // belt AND braces, deliberately: MEASURED on effect 3.22.2, a fiber
      // resumed out of `Effect.sleep` processes the interrupt signal
      // `endActive()` forked before it runs this step, so the interrupt
      // alone already suppresses the callback and no external test can
      // tell the two apart (`rfqSubmission.test.ts` pins the outcome; the
      // unguarded variant passes it too). The guard is here so the
      // invariant rests on the run token — the thing this machine owns —
      // rather than on that delivery order, which is Effect's to change.
      yield* guarded(
        Effect.sync(() => {
          onRedirect(rfqId);
        }),
      );
      yield* guarded(writeState(EDITING));
    });
  }

  function start(build: (guarded: Guarded) => Effect.Effect<void>): void {
    endActive();
    const token = {};
    active = token;

    function runIfCurrent(step: Effect.Effect<void>): Effect.Effect<void> {
      return Effect.suspend(() => {
        return active === token ? step : Effect.void;
      });
    }

    activeFiber = host.runtime.runFork(build(runIfCurrent), {
      scope: host.scope,
    });
  }

  return {
    state$: refToStateStream(host, ref),
    intents: {
      submit: (input: CreateRfqInput, onRedirect: (rfqId: number) => void) => {
        if (disposed) {
          return;
        }

        start((guarded: Guarded) => {
          return runSubmit(input, onRedirect, guarded);
        });
      },
    },
    dispose: () => {
      disposed = true;
      endActive();
      Effect.runFork(Scope.close(host.scope, Exit.void));
    },
  };
}
