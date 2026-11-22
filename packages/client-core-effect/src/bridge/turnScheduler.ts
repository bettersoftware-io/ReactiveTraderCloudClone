import type { Fiber, Scheduler } from "effect";

/** How many waves one turn runs before the scheduler hands the thread back
 * with a macrotask. The same cap Effect 3's default scheduler put on its own
 * microtask chain (`MixedScheduler(2048)`), for the same reason: a fiber that
 * never stops yielding must not starve the event loop. */
export const MAX_WAVES_PER_TURN = 2048;

/** A scheduler that SETTLES THE CORE IN ONE TURN: every fiber step that is
 * ready runs inside one microtask, including the steps those steps make
 * ready, until nothing is left.
 *
 * Why not Effect's default. Effect 3.20+ gave each fiber a microtask of its
 * own per resume (`SchedulerRunner.cached`); effect 4's `MixedScheduler`
 * gives each fiber a DISPATCHER of its own, flushed on a `setImmediate` /
 * `setTimeout` — so a value that crosses N fibers arrives N tasks after it
 * entered. Everything else that waits on a microtask runs in between — and a UI is one of those
 * things: React and Solid re-render once per turn. One price tick crosses the
 * price fold, then the animation director, then the per-tile intent fold, so
 * the tile heard its price in one turn and the flash that price causes in a
 * later one.
 *
 * MEASURED 2026-10-04 (React client, nine FX tiles, 6 s of steady state):
 * 624 tile renders on this core against 404 on the RxJS core — three renders
 * per tick against two. With this scheduler: ~430 against ~420, and the price
 * arrives together with its intent. The contract case "a tick's price and
 * the flash it causes reach the tile in one turn" (`@rtc/core-contract`,
 * `animationDirector`) pins it for all three cores.
 *
 * What does not change. Fibers still interleave fairly — a wave runs every
 * ready fiber once, in priority order, before any of them runs again — and a
 * fiber still yields after its operation budget (`shouldYield` is Effect's
 * default). The thread is not held any longer than before either: a chain of
 * microtasks never lets the browser paint or take input between its links,
 * so running the same steps in one microtask blocks nothing that was not
 * already blocked. Only the ORDER against other microtasks moves: they now
 * run after the core has settled, not in the middle of it. */
export function createTurnScheduler(): TurnScheduler {
  let ready: PriorityBuckets = [];
  let scheduled = false;
  let running = false;

  function runTurn(): void {
    // `settle()` called from inside a turn — a subscriber that subscribes
    // another fold from its `next` — has nothing to do: the turn already
    // running takes whatever that made ready in its next wave.
    if (running) {
      return;
    }

    running = true;

    try {
      let waves = 0;

      while (ready.length > 0) {
        if (waves === MAX_WAVES_PER_TURN) {
          setTimeout(runTurn, 0);
          return;
        }

        waves += 1;
        const wave = ready;
        ready = [];

        for (const [, tasks] of wave) {
          for (const task of tasks) {
            task();
          }
        }
      }

      scheduled = false;
    } finally {
      running = false;
    }
  }

  function scheduleTask(task: () => void, priority: number): void {
    addToBucket(ready, task, priority);

    if (!scheduled) {
      scheduled = true;
      // A resolved promise, as Effect's own scheduler uses: fake timers
      // never capture it, so a test on fake timers still sees fibers run.
      void Promise.resolve().then(runTurn);
    }
  }

  // Effect 4 hands every fiber a DISPATCHER of its own scheduler's making
  // (`makeDispatcher`, cached per fiber) and queues the fiber's steps there;
  // a `Queue` keeps the dispatcher of the fiber that made it. This scheduler
  // is its own one dispatcher, so every fiber's steps — and every queue's
  // hand-overs — land in the same waves.
  const scheduler: TurnScheduler = {
    executionMode: "async",
    // Effect's default budget: a fiber yields after `MaxOpsBeforeYield`
    // operations (2048 unless a fiber is given another).
    shouldYield: (fiber: Fiber.Fiber<unknown, unknown>) => {
      return fiber.currentOpCount >= fiber.cache.maxOpsBeforeYield;
    },
    makeDispatcher: () => {
      return scheduler;
    },
    scheduleTask,
    flush: runTurn,
    settle: runTurn,
  };

  return scheduler;
}

/** Ready tasks by priority, lower numbers first and same-priority tasks in
 * the order they were scheduled — the order of Effect's own
 * `PriorityBuckets`, which effect 4 no longer exports. */
type PriorityBuckets = [priority: number, tasks: (() => void)[]][];

function addToBucket(
  buckets: PriorityBuckets,
  task: () => void,
  priority: number,
): void {
  let index = buckets.findIndex(([bucketPriority]) => {
    return bucketPriority > priority;
  });

  if (index === -1) {
    index = buckets.length;
  }

  const before = buckets[index - 1];

  if (before !== undefined && before[0] === priority) {
    before[1].push(task);
    return;
  }

  buckets.splice(index, 0, [priority, [task]]);
}

/** The scheduler, plus a way for PLAIN code to have the turn now. */
export interface TurnScheduler
  extends Scheduler.Scheduler,
    Scheduler.SchedulerDispatcher {
  /** Run every ready fiber step, and what those make ready, before
   * returning — the turn itself, taken synchronously instead of at the next
   * microtask. For plain code that has just handed the core work whose
   * result its caller reads in the same call: a fold's `subscribe`
   * (`sharedFold`, `bridge/out.ts`, which says why). A no-op when nothing is
   * ready or a turn is already running; the microtask already queued then
   * finds nothing left. */
  settle(): void;
}

/** The one scheduler every host of this core runs on (`runnerFor`,
 * `bridge/out.ts`). ONE instance, not one per host, because the app's fibers
 * and each machine's fibers hand values to one another: they settle together
 * only if they share a queue. */
export const turnScheduler: TurnScheduler = createTurnScheduler();
