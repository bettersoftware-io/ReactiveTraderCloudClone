import { Effect, type Fiber, Queue, Runtime } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { interruptFiber, runnerFor } from "#/bridge/out";
import {
  createTurnScheduler,
  MAX_WAVES_PER_TURN,
} from "#/bridge/turnScheduler";

describe("bridge/turnScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a task on the next microtask, never inside the call that scheduled it", async () => {
    const scheduler = createTurnScheduler();
    const ran: string[] = [];
    scheduler.scheduleTask(() => {
      ran.push("task");
    }, 0);
    expect(ran).toEqual([]);
    await Promise.resolve();
    expect(ran).toEqual(["task"]);
  });

  it("runs what a task schedules in the SAME turn — ahead of a microtask that was already waiting", async () => {
    const scheduler = createTurnScheduler();
    const order: string[] = [];
    scheduler.scheduleTask(() => {
      order.push("first");
      scheduler.scheduleTask(() => {
        order.push("second");
        scheduler.scheduleTask(() => {
          order.push("third");
        }, 0);
      }, 0);
    }, 0);
    // What a UI's own render microtask is to the core: queued after the
    // core's first step, it must still find the core settled.
    queueMicrotask(() => {
      order.push("bystander");
    });
    await nextMacrotask();
    expect(order).toEqual(["first", "second", "third", "bystander"]);
  });

  it("runs one wave in priority order, lower numbers first, and same-priority tasks in the order they were scheduled", async () => {
    const scheduler = createTurnScheduler();
    const order: string[] = [];

    for (const [name, priority] of [
      ["late", 1],
      ["early", 0],
      ["later", 1],
    ] as const) {
      scheduler.scheduleTask(() => {
        order.push(name);
      }, priority);
    }

    await Promise.resolve();
    expect(order).toEqual(["early", "late", "later"]);
  });

  it("starts a fresh turn for a task scheduled after the last one ended", async () => {
    const scheduler = createTurnScheduler();
    const ran: number[] = [];
    scheduler.scheduleTask(() => {
      ran.push(1);
    }, 0);
    await Promise.resolve();
    scheduler.scheduleTask(() => {
      ran.push(2);
    }, 0);
    await Promise.resolve();
    expect(ran).toEqual([1, 2]);
  });

  it("hands the thread back after MAX_WAVES_PER_TURN waves and carries on from a macrotask — a fiber that never stops yielding cannot starve the event loop", async () => {
    vi.useFakeTimers();
    const scheduler = createTurnScheduler();
    // Bounded, so a scheduler that never hands back fails this case with a
    // wrong count instead of hanging the run.
    const wanted = MAX_WAVES_PER_TURN + 3;
    let runs = 0;

    function runAndReschedule(): void {
      runs += 1;

      if (runs < wanted) {
        scheduler.scheduleTask(runAndReschedule, 0);
      }
    }

    scheduler.scheduleTask(runAndReschedule, 0);
    await Promise.resolve();
    expect(runs).toBe(MAX_WAVES_PER_TURN);
    // Nothing more happens however many microtasks pass: the rest waits for
    // the macrotask.
    await Promise.resolve();
    expect(runs).toBe(MAX_WAVES_PER_TURN);
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toBe(wanted);
  });

  it("settle() runs what is ready, and what that makes ready, before it returns — the queued microtask then finds nothing", async () => {
    const scheduler = createTurnScheduler();
    const ran: string[] = [];
    scheduler.scheduleTask(() => {
      ran.push("first");
      scheduler.scheduleTask(() => {
        ran.push("second");
      }, 0);
    }, 0);

    scheduler.settle();
    expect(ran).toEqual(["first", "second"]);
    await nextMacrotask();
    expect(ran).toEqual(["first", "second"]);
    // And the scheduler still works afterwards: the next task waits for
    // its own microtask.
    scheduler.scheduleTask(() => {
      ran.push("third");
    }, 0);
    expect(ran).toEqual(["first", "second"]);
    await Promise.resolve();
    expect(ran).toEqual(["first", "second", "third"]);
  });

  it("settle() with nothing ready does nothing, and from inside a turn it leaves the work to that turn", async () => {
    const scheduler = createTurnScheduler();
    const order: string[] = [];
    scheduler.settle();
    scheduler.scheduleTask(() => {
      order.push("outer starts");
      scheduler.scheduleTask(() => {
        order.push("inner");
      }, 0);
      // Re-entering here would run "inner" before "outer ends".
      scheduler.settle();
      order.push("outer ends");
    }, 0);
    await nextMacrotask();
    expect(order).toEqual(["outer starts", "outer ends", "inner"]);
  });

  it("a value handed across three fibers arrives within one turn of entering the first", async () => {
    const runner = runnerFor(Runtime.defaultRuntime);
    const [entry, middle, exit] = [
      runner.runSync(Queue.unbounded<number>()),
      runner.runSync(Queue.unbounded<number>()),
      runner.runSync(Queue.unbounded<number>()),
    ];
    const arrived: number[] = [];

    function relay(
      from: Queue.Queue<number>,
      to: Queue.Queue<number>,
    ): Fiber.RuntimeFiber<never> {
      return runner.runFork(
        Queue.take(from).pipe(
          Effect.flatMap((value) => {
            return Queue.offer(to, value);
          }),
          Effect.forever,
        ),
      );
    }

    const fibers = [
      relay(entry, middle),
      relay(middle, exit),
      runner.runFork(
        Queue.take(exit).pipe(
          Effect.flatMap((value) => {
            return Effect.sync(() => {
              arrived.push(value);
            });
          }),
          Effect.forever,
        ),
      ),
    ];
    await nextMacrotask();

    Queue.unsafeOffer(entry, 7);
    let arrivedByNextMicrotask: readonly number[] = [];
    queueMicrotask(() => {
      arrivedByNextMicrotask = [...arrived];
    });
    await nextMacrotask();

    expect(arrivedByNextMicrotask).toEqual([7]);

    for (const fiber of fibers) {
      interruptFiber(fiber);
    }
  });
});

function nextMacrotask(): Promise<void> {
  return new Promise((resume) => {
    setTimeout(resume, 0);
  });
}
