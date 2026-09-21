import { Duration, Effect, Either, SubscriptionRef } from "effect";

import type {
  Machine,
  RfqSubmissionIntents,
  RfqSubmissionState,
  Stream,
} from "@rtc/core-api";
import { type CreateRfqInput, RFQ_REDIRECT_DELAY_MS } from "@rtc/domain";

import { createDetachedHost, refToStateStream } from "#/bridge/out";
import { rpc } from "#/bridge/rpc";
import { createRunSlot, type Run } from "#/machines/runSlot";

export interface RfqSubmissionDeps {
  /** The create-RFQ command (`RfqsPresenter.createRfq`). */
  createRfq: (input: CreateRfqInput) => Stream<number>;
}

const EDITING: RfqSubmissionState = { status: "editing" };
const SUBMITTING: RfqSubmissionState = { status: "submitting" };

/** The body of the one live run `createRfqSubmissionMachine`'s `submit()`
 * starts. */
function runSubmit(
  input: CreateRfqInput,
  onRedirect: (rfqId: number) => void,
  deps: RfqSubmissionDeps,
  run: Run<RfqSubmissionState>,
): Effect.Effect<void> {
  return Effect.gen(function* runCreateRfq() {
    yield* run.write(() => {
      return SUBMITTING;
    });
    const created = yield* Effect.either(rpc(deps.createRfq(input)));

    if (Either.isLeft(created)) {
      yield* run.write(() => {
        return EDITING;
      });
      return;
    }

    const rfqId = created.right;
    yield* run.write(() => {
      return { status: "confirmed", rfqId };
    });
    yield* Effect.sleep(Duration.millis(RFQ_REDIRECT_DELAY_MS));
    // Guarded like a write, and for the same reason: the timer may fire
    // with the run already superseded or the machine already disposed,
    // and interruption only lands at the run's next suspension. This is
    // belt AND braces, deliberately: MEASURED on effect 3.22.2, a fiber
    // resumed out of `Effect.sleep` processes the interrupt signal
    // `slot.end()` forked before it runs this step, so the interrupt
    // alone already suppresses the callback and no external test can
    // tell the two apart (`rfqSubmission.test.ts` pins the outcome; the
    // unguarded variant passes it too). The guard is here so the
    // invariant rests on the run token — the thing this machine owns —
    // rather than on that delivery order, which is Effect's to change.
    yield* run.guarded(
      Effect.sync(() => {
        onRedirect(rfqId);
      }),
    );
    yield* run.write(() => {
      return EDITING;
    });
  });
}

/** editing → submitting → confirmed{rfqId} → (RFQ_REDIRECT_DELAY_MS)
 * onRedirect(rfqId) → editing; a failed create returns to editing. A new
 * `submit()` supersedes the run in flight (`createRunSlot`'s switch-map
 * semantics), which withdraws its port call through `rpc`'s finalizer;
 * `dispose()` ends it too. A pending redirect never fires: every
 * externally visible step — `onRedirect` as much as a state write — runs
 * through `run.guarded`, so that promise rests on the run token
 * `createRunSlot` owns and not only on when Effect chooses to deliver an
 * interrupt. The RxJS machine's shape on a `SubscriptionRef` under a
 * detached host, with `createRunSlot` owning the run token and fiber. */
export function createRfqSubmissionMachine(
  deps: RfqSubmissionDeps,
): Machine<RfqSubmissionState, RfqSubmissionIntents> {
  const host = createDetachedHost();
  const ref = host.runtime.runSync(
    SubscriptionRef.make<RfqSubmissionState>(EDITING),
  );
  const slot = createRunSlot(host, ref);

  return {
    state$: refToStateStream(host, ref),
    intents: {
      submit: (input: CreateRfqInput, onRedirect: (rfqId: number) => void) => {
        if (slot.isDisposed()) {
          return;
        }

        slot.start((run: Run<RfqSubmissionState>) => {
          return runSubmit(input, onRedirect, deps, run);
        });
      },
    },
    dispose: () => {
      slot.dispose();
    },
  };
}
