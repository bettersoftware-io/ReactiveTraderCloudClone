import { describe, expect, it } from "vitest";

import { createPendingQueue } from "#/harness/pendingQueue";

describe("createPendingQueue", () => {
  it("a request is pending from SUBSCRIBE (not from open) until resolved; resolve is FIFO and next+complete", () => {
    const queue = createPendingQueue<string, number>();
    const first = queue.open("a");
    const second = queue.open("b");
    expect(queue.pending()).toEqual([]);
    const seenA: number[] = [];
    const seenB: number[] = [];
    let completedA = false;
    first.subscribe({
      next: (value: number) => {
        seenA.push(value);
      },
      complete: () => {
        completedA = true;
      },
    });
    second.subscribe((value) => {
      seenB.push(value);
    });
    expect(queue.pending()).toEqual(["a", "b"]);
    queue.resolve(1);
    expect(seenA).toEqual([1]);
    expect(completedA).toBe(true);
    expect(seenB).toEqual([]);
    expect(queue.pending()).toEqual(["b"]);
  });

  it("unsubscribing withdraws the request; fail errors the oldest; both are no-ops when nothing is pending", () => {
    const queue = createPendingQueue<string, number>();
    const sub = queue.open("a").subscribe();
    expect(queue.pending()).toEqual(["a"]);
    sub.unsubscribe();
    expect(queue.pending()).toEqual([]);
    queue.resolve(1);
    queue.fail(new Error("nobody"));
    const errors: unknown[] = [];
    queue.open("b").subscribe({
      error: (error: unknown) => {
        errors.push(error);
      },
    });
    queue.fail(new Error("bust"));
    expect(errors).toHaveLength(1);
    expect(queue.pending()).toEqual([]);
  });

  it("drain completes every pending result and empties the queue", () => {
    const queue = createPendingQueue<string, number>();
    let completed = 0;
    queue.open("a").subscribe({
      complete: () => {
        completed += 1;
      },
    });
    queue.open("b").subscribe({
      complete: () => {
        completed += 1;
      },
    });
    queue.drain();
    expect(completed).toBe(2);
    expect(queue.pending()).toEqual([]);
  });

  it("emit delivers to the OLDEST pending result without completing it, and it stays pending", () => {
    const queue = createPendingQueue<string, number>();
    const seenA: number[] = [];
    const seenB: number[] = [];
    let completedA = false;
    queue.open("a").subscribe({
      next: (value: number) => {
        seenA.push(value);
      },
      complete: () => {
        completedA = true;
      },
    });
    queue.open("b").subscribe((value) => {
      seenB.push(value);
    });
    queue.emit(1);
    queue.emit(2);
    expect(seenA).toEqual([1, 2]);
    expect(seenB).toEqual([]);
    expect(completedA).toBe(false);
    expect(queue.pending()).toEqual(["a", "b"]);
  });

  it("complete completes the OLDEST and drops it; a following emit reaches the next one", () => {
    const queue = createPendingQueue<string, number>();
    const seenA: number[] = [];
    const seenB: number[] = [];
    let completedA = false;
    queue.open("a").subscribe({
      next: (value: number) => {
        seenA.push(value);
      },
      complete: () => {
        completedA = true;
      },
    });
    queue.open("b").subscribe((value) => {
      seenB.push(value);
    });
    queue.complete();
    expect(completedA).toBe(true);
    expect(queue.pending()).toEqual(["b"]);
    queue.emit(3);
    expect(seenA).toEqual([]);
    expect(seenB).toEqual([3]);
  });

  it("emit and complete are no-ops when nothing is pending", () => {
    const queue = createPendingQueue<string, number>();
    queue.emit(1);
    queue.complete();
    expect(queue.pending()).toEqual([]);
  });
});
