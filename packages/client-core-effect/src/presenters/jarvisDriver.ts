import { Effect, Queue, Scope } from "effect";

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
} from "@rtc/core-api";
import type { PowerSaverLevel } from "@rtc/domain";

import {
  createChildHost,
  createHotStream,
  type EffectHost,
} from "#/bridge/out";
import { createSyncRef } from "#/presenters/syncRef";

export interface JarvisDriverDeps {
  /** Every Jarvis turn event, heard synchronously. */
  readonly listenEvents: (listener: (event: JarvisEvent) => void) => () => void;
  /** What each command touches, read synchronously. */
  readonly commands: DriveCommandDeps;
  /** The power-saver level now — read before each later command. */
  readonly powerSaverLevel: () => PowerSaverLevel;
}

interface CommandTag {
  readonly type: "command";
}

type DriveBatch = Extract<JarvisEvent, CommandTag>["batch"];

/**
 * `presenters.jarvisDriver` on the Effect core: the shared interpreter
 * (`applyDriveCommand`, client-core) does every command; this file owns the
 * timing. Batches queue (an Effect `Queue`) and one consumer fiber drains
 * them — a batch arriving mid-stagger waits — and within a batch each
 * command waits `driveStaggerMs` (0 for the first, and under freeze) on an
 * `Effect.sleep`, as the RxJS driver's `timer(0)` does. `lastBatch` resets
 * at each batch's start; `outcomes$` is a synchronous hot stream in
 * application order.
 */
/** The driver, plus the synchronous outcome listener its family folds the
 * transcript through. */
export interface NativeJarvisDriver {
  readonly handle: JarvisDriverMachineHandle;
  listenOutcomes(listener: (outcome: DriveOutcome) => void): () => void;
}

export function createJarvisDriver(
  parent: EffectHost,
  deps: JarvisDriverDeps,
): NativeJarvisDriver {
  const host = createChildHost(parent);
  const ref = createSyncRef<JarvisDriverState>(host, { lastBatch: [] });
  const outcomes = createHotStream<DriveOutcome>();
  const batches = host.runtime.runSync(Queue.unbounded<DriveBatch>());

  function applyBatch(batch: DriveBatch): Effect.Effect<void> {
    return Effect.sync(() => {
      ref.set(() => {
        return { lastBatch: [] };
      });
    }).pipe(
      Effect.andThen(
        Effect.forEach(
          [...batch.commands.entries()],
          ([index, command]) => {
            return Effect.suspend(() => {
              return Effect.sleep(
                index === 0 ? 0 : driveStaggerMs(index, deps.powerSaverLevel()),
              );
            }).pipe(
              Effect.andThen(
                Effect.sync(() => {
                  const outcome = applyDriveCommand(command, deps.commands);
                  outcomes.publish(outcome);
                  ref.set((previous) => {
                    return { lastBatch: [...previous.lastBatch, outcome] };
                  });
                }),
              ),
            );
          },
          { discard: true },
        ),
      ),
    );
  }

  host.runtime.runFork(
    Effect.forever(Queue.take(batches).pipe(Effect.flatMap(applyBatch))),
    { scope: host.scope },
  );
  const unlisten = deps.listenEvents((event: JarvisEvent) => {
    if (event.type === "command") {
      host.runtime.runSync(Queue.offer(batches, event.batch));
    }
  });
  const warm = ref.warm();
  host.runtime.runSync(
    Scope.addFinalizer(
      host.scope,
      Effect.sync(() => {
        unlisten();
        warm.release();
      }),
    ),
  );

  return {
    handle: { state$: warm.state$, outcomes$: outcomes.stream$ },
    listenOutcomes: outcomes.listen,
  };
}
