import { Effect, ExecutionStrategy, Exit, Fiber, Scope, Stream } from "effect";

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
  Stream as CoreStream,
  DriveOutcome,
  JarvisAvailability,
  JarvisMachineHandle,
  JarvisPort,
  JarvisState,
} from "@rtc/core-api";
import {
  JARVIS_CONFIRM_TIMEOUT_MS,
  type JarvisBrain,
  type JarvisEffort,
  type JarvisSkin,
} from "@rtc/domain";

import {
  createChildHost,
  createHotStream,
  type EffectHost,
  fromPortIn,
} from "#/bridge/out";
import { createSyncRef } from "#/presenters/syncRef";

export interface JarvisMachineDeps {
  readonly port: JarvisPort;
  readonly skin$: CoreStream<JarvisSkin>;
  readonly setSkin: (skin: JarvisSkin) => void;
  /** The port's optional live availability; absent → always available with
   * the scripted brain alone. */
  readonly availability$?: CoreStream<JarvisAvailability>;
  readonly preferredBrain$: CoreStream<JarvisBrain>;
  readonly effort$: CoreStream<JarvisEffort>;
  /** Defaults to `JARVIS_CONFIRM_TIMEOUT_MS`. */
  readonly confirmTimeoutMs?: number;
}

/** The machine, plus the synchronous reads and listeners this core's own
 * Jarvis family needs beside the public handle. */
export interface NativeJarvis {
  readonly handle: JarvisMachineHandle;
  stateNow(): JarvisState;
  listenState(listener: (state: JarvisState) => void): () => void;
  listenEvents(listener: (event: JarvisEvent) => void): () => void;
}

/**
 * `presenters.jarvis` on the Effect core: the shared `createJarvisController`
 * (client-core) holds every rule; this file owns only the timing, on its
 * own child host.
 * - State is a `SyncRef`, committed synchronously; each patch is applied
 *   exactly once (`SyncRef.set` runs it once inside `runSync`).
 * - Turns queue and run one `ask` at a time, each planned when it starts;
 *   an idle `send` subscribes its `ask` in the same tick (so a same-tick
 *   reply is buffered, never lost) and a fiber folds the replies; a failed
 *   `ask` closes its turn as an error event.
 * - The confirmation countdown is a forked fiber a newer card, approve,
 *   decline or the scope's close interrupts (its patches are guarded, so an
 *   interrupt that lands a tick late is harmless).
 * - `events$` is a synchronous hot stream (`createHotStream`), so a reader
 *   subscribed in the same tick as a turn never misses its events.
 * - The preference and availability sources are relayed into the
 *   controller on the host scope; closing the scope — `dispose()` or the
 *   parent host's close — ends everything.
 */
export function createJarvisMachine(
  parent: EffectHost,
  deps: JarvisMachineDeps,
): NativeJarvis {
  const host = createChildHost(parent);
  const fromPort = fromPortIn(host.scope);
  const confirmTimeoutMs = deps.confirmTimeoutMs ?? JARVIS_CONFIRM_TIMEOUT_MS;
  const controller = createJarvisController();
  const ref = createSyncRef<JarvisState>(host, JARVIS_INITIAL_STATE);
  const events = createHotStream<JarvisEvent>();
  let countdown: Fiber.RuntimeFiber<void> | null = null;
  let closed = false;

  function apply(patch: JarvisPatch): void {
    ref.set(patch);
  }

  // Looked up on every call, never captured: a port whose `confirm` is
  // replaced after construction is still the one told.
  function confirmThroughPort(confirmationId: string, approved: boolean): void {
    deps.port.confirm(confirmationId, approved);
  }

  function endCountdown(): void {
    // `Fiber.interrupt` is itself scheduled, so a tick can still land after
    // this — harmless, the tick and expiry patches are pending-guarded.
    if (countdown !== null) {
      Effect.runFork(Fiber.interrupt(countdown));
      countdown = null;
    }
  }

  function startCountdown(confirmationId: string): void {
    endCountdown();

    if (closed) {
      return;
    }

    const totalTicks = confirmTotalTicks(confirmTimeoutMs);
    countdown = host.runtime.runFork(
      Effect.forEach(
        Array.from({ length: totalTicks }, (_, index) => {
          return index + 1;
        }),
        (ticks) => {
          return Effect.sleep(1000).pipe(
            Effect.andThen(
              Effect.sync(() => {
                apply(
                  controller.confirmTickPatch(
                    confirmationId,
                    ticks,
                    totalTicks,
                    confirmThroughPort,
                  ),
                );
              }),
            ),
          );
        },
        { discard: true },
      ),
      { scope: host.scope },
    );
  }

  function foldEvent(event: JarvisEvent, origin: "narrator" | undefined): void {
    apply(controller.eventPatch(event, origin));

    // The countdown starts BEFORE outside subscribers hear the card, as the
    // RxJS machine's own countdown (subscribed first) does.
    if (event.type === "confirmRequest") {
      startCountdown(event.confirmationId);
    }

    events.publish(event);
  }

  const pendingTurns: JarvisTurnRequest[] = [];
  let turnInFlight = false;

  /** Start the next queued turn, if any. Called synchronously from `send`
   * when idle, so the turn's `ask` is subscribed IN the sending tick — a
   * reply that arrives in that same tick is buffered, never lost (the
   * lost-turn lesson of slice 7 wave 1). The replies fold on a fiber; its
   * end starts the next turn. Each turn is planned when it starts, i.e.
   * when dequeued. */
  function startNextTurn(): void {
    // No closed check here: after the scope closes, the only way back in is
    // the turn fiber's completion, which the close interrupts; `send` is
    // guarded in `enqueueTurn`.
    for (;;) {
      const request = pendingTurns.shift();

      if (request === undefined) {
        turnInFlight = false;
        return;
      }

      const plan = controller.planTurn(request);

      if (plan === null) {
        continue;
      }

      turnInFlight = true;
      apply(plan.start);
      const turnScope = host.runtime.runSync(
        Scope.fork(host.scope, ExecutionStrategy.sequential),
      );

      const replies = fromPortIn(turnScope)(
        deps.port.ask(plan.wireText, plan.options),
      );
      host.runtime.runFork(
        replies.pipe(
          Stream.runForEach((event: JarvisEvent) => {
            return Effect.sync(() => {
              foldEvent(event, plan.origin);
            });
          }),
          Effect.catchAll((error: unknown) => {
            // The turn ends as an error the user sees rather than hanging
            // "speaking" (the WS adapter already turns its own failures
            // into error events).
            return Effect.sync(() => {
              foldEvent(
                {
                  type: "error",
                  message:
                    error instanceof Error ? error.message : String(error),
                },
                plan.origin,
              );
            });
          }),
          Effect.ensuring(Scope.close(turnScope, Exit.void)),
          Effect.andThen(
            Effect.sync(() => {
              startNextTurn();
            }),
          ),
        ),
        { scope: host.scope },
      );
      return;
    }
  }

  function enqueueTurn(request: JarvisTurnRequest): void {
    if (closed) {
      return;
    }

    pendingTurns.push(request);

    if (!turnInFlight) {
      startNextTurn();
    }
  }

  function relayInto<T>(source: CoreStream<T>, fold: (value: T) => void): void {
    host.runtime.runFork(
      fromPort(source).pipe(
        Stream.runForEach((value: T) => {
          return Effect.sync(() => {
            fold(value);
          });
        }),
        Effect.catchAll(() => {
          // A failed preference or availability source leaves the machine
          // on its last value; it never takes the machine down.
          return Effect.void;
        }),
      ),
      { scope: host.scope },
    );
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

  const warm = ref.warm();
  host.runtime.runSync(
    Scope.addFinalizer(
      host.scope,
      Effect.sync(() => {
        closed = true;
        countdown = null;
        warm.release();
      }),
    ),
  );

  const handle: JarvisMachineHandle = {
    state$: warm.state$,
    events$: events.stream$,
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
        endCountdown();
        apply(approvePatch(confirmThroughPort));
      },
      declineConfirmation: () => {
        endCountdown();
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
      closed = true;
      endCountdown();
      Effect.runFork(Scope.close(host.scope, Exit.void));
    },
  };

  return {
    handle,
    stateNow: ref.get,
    listenState: ref.listen,
    listenEvents: events.listen,
  };
}

/** Registers the transcript's model-facing history with a port that takes
 * one (`setHistorySource`, WS-real mode), read straight from the machine's
 * synchronous state. */
export function wireJarvisHistorySource(
  port: JarvisPort,
  jarvis: NativeJarvis,
): void {
  port.setHistorySource?.(() => {
    return modelFacingHistory(jarvis.stateNow().entries);
  });
}
