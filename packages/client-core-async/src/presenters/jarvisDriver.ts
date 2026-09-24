import {
  applyDriveCommand,
  type DriveCommandDeps,
  driveStaggerMs,
  type JarvisEvent,
} from "@rtc/client-core";
import type {
  DriveOutcome,
  JarvisDriverMachineHandle,
  JarvisDriverState,
  Stream,
} from "@rtc/core-api";
import type { PowerSaverLevel } from "@rtc/domain";

import { relay } from "#/bridge/in";
import { storeToWarmStateStream, topicToStream } from "#/bridge/out";
import { reportAsync } from "#/kernel/reportAsync";
import { sleep } from "#/kernel/sleep";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";
import { createTopic } from "#/kernel/topic";
import { untilAborted } from "#/kernel/untilAborted";

export interface JarvisDriverDeps {
  /** Every Jarvis turn event — subscribed at construction (hot). */
  readonly events$: Stream<JarvisEvent>;
  /** What each command touches, read synchronously. */
  readonly commands: DriveCommandDeps;
  /** The power-saver level now — read before each later command. */
  readonly powerSaverLevel: () => PowerSaverLevel;
}

type DriveBatch = Extract<JarvisEvent, CommandTag>["batch"];

interface CommandTag {
  readonly type: "command";
}

/**
 * `presenters.jarvisDriver` on the async core: the shared interpreter
 * (`applyDriveCommand`, client-core) does every command; this file owns the
 * timing. Batches queue and drain one at a time — a batch arriving
 * mid-stagger waits — and within a batch each command waits
 * `driveStaggerMs` (0 for the first, and under freeze) on a timer, as the
 * RxJS driver's `timer(0)` does, before it applies. `lastBatch` resets at
 * each batch's start; `outcomes$` is hot and emits in application order.
 */
export function createJarvisDriver(
  deps: JarvisDriverDeps,
  lifetime: AbortSignal,
): JarvisDriverMachineHandle {
  const store = createStore<JarvisDriverState>({ lastBatch: [] });
  const outcomes = createTopic<DriveOutcome>((signal) => {
    return untilAborted(signal);
  });

  const releaseOutcomes = outcomes.subscribe(() => {
    // held open for the driver's life, like the RxJS Subject
  });
  const batches: DriveBatch[] = [];
  let draining = false;

  async function drainBatches(): Promise<void> {
    draining = true;

    try {
      for (
        let batch = batches.shift();
        batch !== undefined && !lifetime.aborted;
        batch = batches.shift()
      ) {
        store.set({ lastBatch: [] });

        for (const [index, command] of batch.commands.entries()) {
          const staggerMs =
            index === 0 ? 0 : driveStaggerMs(index, deps.powerSaverLevel());
          await sleep(staggerMs, lifetime);
          const outcome = applyDriveCommand(command, deps.commands);
          outcomes.publish(outcome);
          store.set((previous) => {
            return { lastBatch: [...previous.lastBatch, outcome] };
          });
        }
      }
    } finally {
      draining = false;
    }
  }

  void relay(deps.events$, lifetime, (event: JarvisEvent) => {
    if (event.type !== "command") {
      return;
    }

    batches.push(event.batch);

    if (!draining) {
      void spawn(drainBatches, reportAsync);
    }
  }).catch(reportAsync);

  const warm = storeToWarmStateStream(store);
  lifetime.addEventListener(
    "abort",
    () => {
      releaseOutcomes();
      warm.release();
    },
    { once: true },
  );

  return { state$: warm.state$, outcomes$: topicToStream(outcomes) };
}
