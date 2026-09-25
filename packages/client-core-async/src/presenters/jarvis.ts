import {
  approvePatch,
  closePatch,
  confirmTotalTicks,
  createJarvisController,
  declinePatch,
  JARVIS_INITIAL_STATE,
  JARVIS_SIM_AVAILABILITY,
  type JarvisEvent,
  type JarvisPatch,
  type JarvisTurnRequest,
  modelFacingHistory,
  openPatch,
  skinPatch,
  togglePatch,
} from "@rtc/client-core";
import type {
  DriveOutcome,
  JarvisAvailability,
  JarvisMachineHandle,
  JarvisPort,
  JarvisState,
  Stream,
} from "@rtc/core-api";
import {
  JARVIS_CONFIRM_TIMEOUT_MS,
  type JarvisBrain,
  type JarvisEffort,
  type JarvisSkin,
} from "@rtc/domain";

import { relay } from "#/bridge/in";
import { storeToWarmStateStream, topicToStream } from "#/bridge/out";
import { reportAsync } from "#/kernel/reportAsync";
import { createRunSlot } from "#/kernel/runSlot";
import { sleep } from "#/kernel/sleep";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";
import { createTopic } from "#/kernel/topic";
import { untilAborted } from "#/kernel/untilAborted";

export interface JarvisMachineDeps {
  readonly port: JarvisPort;
  readonly skin$: Stream<JarvisSkin>;
  readonly setSkin: (skin: JarvisSkin) => void;
  /** The port's optional live availability; absent → always available with
   * the scripted brain alone. */
  readonly availability$?: Stream<JarvisAvailability>;
  readonly preferredBrain$: Stream<JarvisBrain>;
  readonly effort$: Stream<JarvisEffort>;
  /** Defaults to `JARVIS_CONFIRM_TIMEOUT_MS`. */
  readonly confirmTimeoutMs?: number;
}

/**
 * `presenters.jarvis` on the async core: the shared `createJarvisController`
 * (client-core) holds every rule; this file owns only the timing.
 * - State is a `Store`, committed synchronously, so readers can peek it.
 * - Turns drain from ONE queue, one `ask` at a time; each is planned when it
 *   is DEQUEUED (`planTurn` — an availability flip while queued is honoured,
 *   as in the RxJS `concatMap`).
 * - The confirmation countdown is a run slot: a newer card supersedes it;
 *   approve, decline and dispose end it.
 * - `events$` is a hot topic, published as each turn's events arrive.
 * - The preference and availability sources are subscribed at construction
 *   (they replay synchronously), in the RxJS machine's order: effort, skin,
 *   availability, preferred brain.
 */
export function createJarvisMachine(
  deps: JarvisMachineDeps,
  lifetime: AbortSignal,
): JarvisMachineHandle {
  const own = new AbortController();
  lifetime.addEventListener(
    "abort",
    () => {
      own.abort();
    },
    { once: true },
  );
  const { signal } = own;
  const confirmTimeoutMs = deps.confirmTimeoutMs ?? JARVIS_CONFIRM_TIMEOUT_MS;
  const controller = createJarvisController();
  const store = createStore<JarvisState>(JARVIS_INITIAL_STATE);
  const countdown = createRunSlot(store);
  const events = createTopic<JarvisEvent>((producerSignal) => {
    return untilAborted(producerSignal);
  });
  const queue: JarvisTurnRequest[] = [];
  let draining = false;

  function apply(patch: JarvisPatch): void {
    store.set(patch);
  }

  // Looked up on every call, never captured: a port whose `confirm` is
  // replaced after construction is still the one told.
  function confirmThroughPort(confirmationId: string, approved: boolean): void {
    deps.port.confirm(confirmationId, approved);
  }

  function startCountdown(confirmationId: string): void {
    countdown.start(async (run) => {
      const totalTicks = confirmTotalTicks(confirmTimeoutMs);

      for (let ticks = 1; ticks <= totalTicks; ticks++) {
        await sleep(1000, run.signal);
        run.set(
          controller.confirmTickPatch(
            confirmationId,
            ticks,
            totalTicks,
            confirmThroughPort,
          ),
        );
      }
    });
  }

  function foldEvent(event: JarvisEvent, origin: "narrator" | undefined): void {
    apply(controller.eventPatch(event, origin));

    // The countdown starts BEFORE outside subscribers hear the card, as the
    // RxJS machine's own countdown (subscribed first) does — an outside
    // subscriber that resolves the card on the spot then ends it.
    if (event.type === "confirmRequest") {
      startCountdown(event.confirmationId);
    }

    events.publish(event);
  }

  async function drainTurns(): Promise<void> {
    draining = true;

    try {
      for (
        let request = queue.shift();
        request !== undefined;
        request = queue.shift()
      ) {
        const plan = controller.planTurn(request);

        if (plan === null) {
          continue;
        }

        apply(plan.start);
        await relay(
          deps.port.ask(plan.wireText, plan.options),
          signal,
          (event: JarvisEvent) => {
            foldEvent(event, plan.origin);
          },
        ).catch((error: unknown) => {
          // The turn ends as an error the user sees — the stub settles and
          // the machine idles — rather than hanging "speaking" (the WS
          // adapter already turns its own failures into error events).
          foldEvent(
            {
              type: "error",
              message: error instanceof Error ? error.message : String(error),
            },
            plan.origin,
          );
        });
      }
    } finally {
      draining = false;
    }
  }

  function enqueueTurn(request: JarvisTurnRequest): void {
    if (signal.aborted) {
      return;
    }

    queue.push(request);

    if (!draining) {
      void spawn(drainTurns, reportAsync);
    }
  }

  function relayInto<T>(source: Stream<T>, fold: (value: T) => void): void {
    void relay(source, signal, fold).catch(reportAsync);
  }

  relayInto(deps.effort$, (effort) => {
    controller.setEffort(effort);
  });
  relayInto(deps.skin$, (skin) => {
    apply(skinPatch(skin));
  });

  if (deps.availability$ === undefined) {
    apply(controller.availabilityPatch(JARVIS_SIM_AVAILABILITY));
  } else {
    relayInto(deps.availability$, (availability) => {
      apply(controller.availabilityPatch(availability));
    });
  }

  relayInto(deps.preferredBrain$, (brain) => {
    apply(controller.preferredBrainPatch(brain));
  });

  // Hot, like the RxJS Subject: the topic's producer has no work of its own,
  // so it must be held open for `publish` to reach anyone — retained for the
  // machine's life.
  const releaseEvents = events.subscribe(() => {
    // held open; subscribers attach through `events$`
  });
  const warm = storeToWarmStateStream(store);

  // One teardown for both ends of the machine's life: `dispose()` and the
  // app `lifetime` aborting reach it alike.
  signal.addEventListener(
    "abort",
    () => {
      countdown.dispose();
      queue.length = 0;
      releaseEvents();
      warm.release();
    },
    { once: true },
  );

  return {
    state$: warm.state$,
    events$: topicToStream(events),
    intents: {
      open: () => {
        apply(openPatch);
      },
      close: () => {
        apply(closePatch);
      },
      toggle: () => {
        apply(togglePatch);
      },
      send: (text: string) => {
        enqueueTurn({ kind: "send", text });
      },
      sendScripted: (text: string) => {
        enqueueTurn({ kind: "sendScripted", text });
      },
      narrate: (prompt: string) => {
        enqueueTurn({ kind: "narrate", prompt });
      },
      approveConfirmation: () => {
        countdown.end();
        apply(approvePatch(confirmThroughPort));
      },
      declineConfirmation: () => {
        countdown.end();
        apply(declinePatch(confirmThroughPort));
      },
      setSkin: (skin: JarvisSkin) => {
        deps.setSkin(skin);
      },
      recordDriveOutcome: (outcome: DriveOutcome) => {
        const patch = controller.driveOutcomePatch(outcome);

        if (patch !== null) {
          apply(patch);
        }
      },
    },
    dispose: () => {
      own.abort();
    },
  };
}

/** Registers the transcript's model-facing history with a port that takes
 * one (`setHistorySource`, WS-real mode): a subscription mirrors the latest
 * entries (`state$` replays synchronously), released with the machine's own
 * `dispose` — the RxJS composition's `wireJarvisHistorySource`, natively. */
export function wireJarvisHistorySource(
  port: JarvisPort,
  jarvis: JarvisMachineHandle,
): void {
  if (port.setHistorySource === undefined) {
    return;
  }

  let entries: JarvisState["entries"] = [];
  const subscription = jarvis.state$.subscribe((state: JarvisState) => {
    entries = state.entries;
  });
  const dispose = jarvis.dispose;

  jarvis.dispose = (): void => {
    subscription.unsubscribe();
    dispose();
  };

  port.setHistorySource(() => {
    return modelFacingHistory(entries);
  });
}
