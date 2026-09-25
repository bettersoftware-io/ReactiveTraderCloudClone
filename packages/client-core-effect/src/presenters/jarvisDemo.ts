import { Effect, Fiber, Scope } from "effect";

import {
  advanceDemoPatch,
  createDemoStepWatch,
  demoBeatMs,
  JARVIS_DEMO_INITIAL_STATE,
  JARVIS_DEMO_STEPS,
  type JarvisEvent,
  lastEntryId,
} from "@rtc/client-core";
import type {
  JarvisDemoMachineHandle,
  JarvisDemoState,
  JarvisDemoStep,
  JarvisIntents,
  JarvisState,
} from "@rtc/core-api";
import { DEMO_STEP_TIMEOUT_MS, type PowerSaverLevel } from "@rtc/domain";

import { createChildHost, type EffectHost } from "#/bridge/out";
import { createSyncRef } from "#/presenters/syncRef";

export interface JarvisDemoDeps {
  readonly jarvisStateNow: () => JarvisState;
  /** The Jarvis state and events, heard synchronously and in order — the
   * step watcher must see a turn's [user, jarvis] pair before its `done`. */
  readonly listenState: (listener: (state: JarvisState) => void) => () => void;
  readonly listenEvents: (listener: (event: JarvisEvent) => void) => () => void;
  readonly jarvis: Pick<
    JarvisIntents,
    "open" | "close" | "sendScripted" | "declineConfirmation"
  >;
  readonly powerSaverLevel: () => PowerSaverLevel;
}

type StepOutcome = "done" | "error";

/** One run's identity: a stop flips `stopped` synchronously, before the
 * run's fiber interrupt (itself scheduled) lands. */
interface DemoRun {
  stopped: boolean;
  fiber: Fiber.RuntimeFiber<void> | null;
}

/**
 * `presenters.jarvisDemo` on the Effect core: the shared script and step
 * watcher (`createDemoStepWatch`, client-core) decide; this file owns the
 * timing. A run is one fiber, exhaust-style (a second start while one runs
 * is dropped); each step is an `Effect.async` settled by the watcher and
 * raced against `DEMO_STEP_TIMEOUT_MS`; a beat (`Effect.sleep`) follows
 * each settle; `stopDemo` marks the run stopped and interrupts its fiber.
 * An errored or timed-out step ends the run the way the RxJS demo's
 * `catchError` does: overlay reopened, state back to idle.
 */
export function createJarvisDemo(
  parent: EffectHost,
  deps: JarvisDemoDeps,
): JarvisDemoMachineHandle {
  const host = createChildHost(parent);
  const ref = createSyncRef<JarvisDemoState>(host, JARVIS_DEMO_INITIAL_STATE);
  let active: DemoRun | null = null;
  let closedByDemo = false;

  function openOverlay(): void {
    deps.jarvis.open();
    closedByDemo = false;
  }

  /** One step's turn to its own done or error. The watcher listens BEFORE
   * the send; a confirming step declines its card one beat after it
   * appears; no settle within `DEMO_STEP_TIMEOUT_MS` counts as an error. */
  function runStep(
    step: JarvisDemoStep,
    run: DemoRun,
  ): Effect.Effect<StepOutcome> {
    return Effect.async<StepOutcome>((resume) => {
      if (run.stopped) {
        resume(Effect.interrupt);
        return;
      }

      const watch = createDemoStepWatch(
        step,
        lastEntryId(deps.jarvisStateNow().entries),
      );
      let decline: Fiber.RuntimeFiber<void> | null = null;
      const unlistenState = deps.listenState((state: JarvisState) => {
        watch.observeState(state);
      });

      const unlistenEvents = deps.listenEvents((event: JarvisEvent) => {
        const signalled = watch.observeEvent(event);

        if (signalled === "decline") {
          decline = host.runtime.runFork(
            Effect.sleep(demoBeatMs(deps.powerSaverLevel())).pipe(
              Effect.andThen(
                Effect.sync(() => {
                  deps.jarvis.declineConfirmation();
                }),
              ),
            ),
            { scope: host.scope },
          );
          return;
        }

        if (signalled !== null) {
          resume(Effect.succeed(signalled));
        }
      });
      deps.jarvis.sendScripted(step.command);

      return Effect.sync(() => {
        unlistenState();
        unlistenEvents();

        if (decline !== null) {
          Effect.runFork(Fiber.interrupt(decline));
        }
      });
    }).pipe(
      Effect.timeoutTo({
        duration: DEMO_STEP_TIMEOUT_MS,
        onSuccess: (outcome: StepOutcome) => {
          return outcome;
        },
        onTimeout: (): StepOutcome => {
          return "error";
        },
      }),
    );
  }

  function runSteps(index: number, run: DemoRun): Effect.Effect<void> {
    return Effect.suspend(() => {
      const step = JARVIS_DEMO_STEPS[index];

      if (step === undefined || run.stopped) {
        return Effect.void;
      }

      if (step.closesOverlay) {
        deps.jarvis.close();
        closedByDemo = true;
      }

      ref.set(advanceDemoPatch(step, index));

      return runStep(step, run).pipe(
        Effect.flatMap((outcome) => {
          if (outcome === "error") {
            return Effect.void;
          }

          return Effect.sleep(demoBeatMs(deps.powerSaverLevel())).pipe(
            Effect.andThen(runSteps(index + 1, run)),
          );
        }),
      );
    });
  }

  function runDemo(run: DemoRun): Effect.Effect<void> {
    return Effect.sync(() => {
      openOverlay();
      ref.set((previous) => {
        return { ...previous, running: true };
      });
    }).pipe(
      Effect.andThen(runSteps(0, run)),
      Effect.andThen(
        Effect.sync(() => {
          if (run.stopped) {
            return;
          }

          // Free the slot BEFORE the idle write: a listener that restarts
          // the demo the moment it reads `running: false` must be let in.
          if (active === run) {
            active = null;
          }

          openOverlay();
          ref.set(() => {
            return JARVIS_DEMO_INITIAL_STATE;
          });
        }),
      ),
    );
  }

  function startDemo(): void {
    if (active !== null) {
      return;
    }

    const run: DemoRun = { stopped: false, fiber: null };
    active = run;
    run.fiber = host.runtime.runFork(runDemo(run), { scope: host.scope });
  }

  function stopDemo(): void {
    if (deps.jarvisStateNow().pendingConfirmation !== null) {
      deps.jarvis.declineConfirmation();
    }

    if (closedByDemo) {
      openOverlay();
    }

    const run = active;
    active = null;

    if (run !== null) {
      run.stopped = true;

      if (run.fiber !== null) {
        Effect.runFork(Fiber.interrupt(run.fiber));
      }
    }

    ref.set(() => {
      return JARVIS_DEMO_INITIAL_STATE;
    });
  }

  const warm = ref.warm();
  host.runtime.runSync(
    Scope.addFinalizer(
      host.scope,
      Effect.sync(() => {
        if (active !== null) {
          active.stopped = true;
          active = null;
        }

        warm.release();
      }),
    ),
  );

  return {
    state$: warm.state$,
    intents: { startDemo, stopDemo },
  };
}
