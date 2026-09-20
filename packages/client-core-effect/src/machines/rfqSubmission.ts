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

/** What a run writes with — the same run-token guard `rfqTile` uses. */
type Write = (next: RfqSubmissionState) => Effect.Effect<void>;

const EDITING: RfqSubmissionState = { status: "editing" };
const SUBMITTING: RfqSubmissionState = { status: "submitting" };

/** editing → submitting → confirmed{rfqId} → (RFQ_REDIRECT_DELAY_MS)
 * onRedirect(rfqId) → editing; a failed create returns to editing. A new
 * `submit()` interrupts the run in flight (the RxJS `switchMap`), which
 * withdraws its port call through `rpc`'s finalizer; `dispose()` interrupts
 * it too, so a pending redirect never fires. */
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

  function runSubmit(
    input: CreateRfqInput,
    onRedirect: (rfqId: number) => void,
    write: Write,
  ): Effect.Effect<void> {
    return Effect.gen(function* runCreateRfq() {
      yield* write(SUBMITTING);
      const created = yield* Effect.either(rpc(deps.createRfq(input)));

      if (Either.isLeft(created)) {
        yield* write(EDITING);
        return;
      }

      const rfqId = created.right;
      yield* write({ status: "confirmed", rfqId });
      yield* Effect.sleep(Duration.millis(RFQ_REDIRECT_DELAY_MS));
      yield* Effect.sync(() => {
        onRedirect(rfqId);
      });
      yield* write(EDITING);
    });
  }

  function start(build: (write: Write) => Effect.Effect<void>): void {
    endActive();
    const token = {};
    active = token;

    function write(next: RfqSubmissionState): Effect.Effect<void> {
      return Effect.suspend(() => {
        return active === token
          ? setRefIfChanged(ref, () => {
              return next;
            })
          : Effect.void;
      });
    }

    activeFiber = host.runtime.runFork(build(write), { scope: host.scope });
  }

  return {
    state$: refToStateStream(host, ref),
    intents: {
      submit: (input: CreateRfqInput, onRedirect: (rfqId: number) => void) => {
        if (disposed) {
          return;
        }

        start((write: Write) => {
          return runSubmit(input, onRedirect, write);
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
