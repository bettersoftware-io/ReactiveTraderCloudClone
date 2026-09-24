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
  Stream,
} from "@rtc/core-api";
import { DEMO_STEP_TIMEOUT_MS, type PowerSaverLevel } from "@rtc/domain";

import { relay } from "#/bridge/in";
import { storeToWarmStateStream } from "#/bridge/out";
import { AbortError } from "#/kernel/AbortError";
import { reportAsync } from "#/kernel/reportAsync";
import { sleep } from "#/kernel/sleep";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

export interface JarvisDemoDeps {
  /** The Jarvis state — mirrored for the step watermark and `stopDemo`'s
   * card check, and watched per step for the step's own turn. */
  readonly jarvisState$: Stream<JarvisState>;
  readonly jarvisEvents$: Stream<JarvisEvent>;
  readonly jarvis: Pick<
    JarvisIntents,
    "open" | "close" | "sendScripted" | "declineConfirmation"
  >;
  /** The power-saver level now — read before each beat. */
  readonly powerSaverLevel: () => PowerSaverLevel;
}

type StepOutcome = "done" | "error";

/**
 * `presenters.jarvisDemo` on the async core: the shared script and step
 * watcher (`createDemoStepWatch`, client-core) decide; this file owns the
 * timing. A run is exhaust-style (a second start while running is dropped),
 * each step races its settle against `DEMO_STEP_TIMEOUT_MS`, a beat follows
 * each settle, and `stopDemo` aborts the run where it stands. An errored or
 * timed-out step ends the run the way the RxJS demo's `catchError` does:
 * the overlay reopens and the state returns to idle.
 */
export function createJarvisDemo(
  deps: JarvisDemoDeps,
  lifetime: AbortSignal,
): JarvisDemoMachineHandle {
  const store = createStore<JarvisDemoState>(JARVIS_DEMO_INITIAL_STATE);
  let jarvisNow: JarvisState | null = null;
  void relay(deps.jarvisState$, lifetime, (state: JarvisState) => {
    jarvisNow = state;
  }).catch(reportAsync);
  let active: AbortController | null = null;
  let closedByDemo = false;

  function openOverlay(): void {
    deps.jarvis.open();
    closedByDemo = false;
  }

  /** One step's turn, to its own done or error. The watcher subscribes
   * BEFORE the send (the events are hot, with no replay); a confirming step
   * declines its card one beat after it appears. */
  function runStep(
    step: JarvisDemoStep,
    signal: AbortSignal,
  ): Promise<StepOutcome> {
    const stepAbort = new AbortController();
    signal.addEventListener(
      "abort",
      () => {
        stepAbort.abort();
      },
      { once: true },
    );
    const watch = createDemoStepWatch(step, lastEntryId(jarvisNow?.entries));

    return new Promise<StepOutcome>((resolve, reject) => {
      function settle(outcome: StepOutcome): void {
        stepAbort.abort();
        resolve(outcome);
      }

      stepAbort.signal.addEventListener(
        "abort",
        () => {
          if (signal.aborted) {
            reject(new AbortError());
          }
        },
        { once: true },
      );
      void relay(deps.jarvisState$, stepAbort.signal, (state: JarvisState) => {
        watch.observeState(state);
      }).catch(reportAsync);
      void relay(deps.jarvisEvents$, stepAbort.signal, (event: JarvisEvent) => {
        const signalled = watch.observeEvent(event);

        if (signalled === "decline") {
          void sleep(demoBeatMs(deps.powerSaverLevel()), stepAbort.signal)
            .then(() => {
              deps.jarvis.declineConfirmation();
            })
            .catch(ignoreAbort);
          return;
        }

        if (signalled !== null) {
          settle(signalled);
        }
      }).catch(reportAsync);
      void sleep(DEMO_STEP_TIMEOUT_MS, stepAbort.signal)
        .then(() => {
          settle("error");
        })
        .catch(ignoreAbort);
      deps.jarvis.sendScripted(step.command);
    });
  }

  async function runDemo(signal: AbortSignal): Promise<void> {
    openOverlay();
    store.set((previous) => {
      return { ...previous, running: true };
    });

    for (const [index, step] of JARVIS_DEMO_STEPS.entries()) {
      if (step.closesOverlay) {
        deps.jarvis.close();
        closedByDemo = true;
      }

      store.set(advanceDemoPatch(step, index));
      const outcome = await runStep(step, signal);

      if (outcome === "error") {
        break;
      }

      await sleep(demoBeatMs(deps.powerSaverLevel()), signal);
    }

    openOverlay();
    store.set(JARVIS_DEMO_INITIAL_STATE);
  }

  function startDemo(): void {
    if (active !== null || lifetime.aborted) {
      return;
    }

    const run = new AbortController();
    active = run;
    void spawn(() => {
      return runDemo(run.signal);
    }, reportAsync).finally(() => {
      if (active === run) {
        active = null;
      }
    });
  }

  function stopDemo(): void {
    if (jarvisNow?.pendingConfirmation) {
      deps.jarvis.declineConfirmation();
    }

    if (closedByDemo) {
      openOverlay();
    }

    active?.abort();
    active = null;
    store.set(JARVIS_DEMO_INITIAL_STATE);
  }

  lifetime.addEventListener(
    "abort",
    () => {
      active?.abort();
      active = null;
    },
    { once: true },
  );
  const warm = storeToWarmStateStream(store);
  lifetime.addEventListener(
    "abort",
    () => {
      warm.release();
    },
    { once: true },
  );

  return {
    state$: warm.state$,
    intents: { startDemo, stopDemo },
  };
}

function ignoreAbort(error: unknown): void {
  if (!(error instanceof AbortError)) {
    reportAsync(error);
  }
}
