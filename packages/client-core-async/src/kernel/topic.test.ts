import { describe, expect, it } from "vitest";

import { createTopic } from "#/kernel/topic";

describe("Topic", () => {
  it("starts the producer on the first subscriber and aborts it on the last unsubscribe", () => {
    let starts = 0;
    let aborted = false;
    const topic = createTopic<number>(async (signal) => {
      starts += 1;
      signal.addEventListener("abort", () => {
        aborted = true;
      });
    });
    const a = topic.subscribe(() => {});
    const b = topic.subscribe(() => {});
    expect(starts).toBe(1);
    a();
    expect(aborted).toBe(false);
    b();
    expect(aborted).toBe(true);
  });

  it("multicasts publish() to every subscriber and replays the last value to late subscribers when replay is on", () => {
    const topic = createTopic<string>(async () => {}, { replay: true });
    const seenA: string[] = [];
    topic.subscribe((v) => {
      seenA.push(v);
    });
    topic.publish("x");
    const seenB: string[] = [];
    topic.subscribe((v) => {
      seenB.push(v);
    });
    expect(seenA).toEqual(["x"]);
    expect(seenB).toEqual(["x"]);
  });

  it("forgets the replayed value after teardown", () => {
    const topic = createTopic<string>(async () => {}, { replay: true });
    const stop = topic.subscribe(() => {});
    topic.publish("x");
    stop();
    const seen: string[] = [];
    topic.subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual([]);
  });

  it("fail() is silent for a subscriber that supplied no error handler", () => {
    const topic = createTopic<number>(async () => {});
    topic.subscribe(() => {});
    expect(() => {
      topic.fail(new Error("boom"));
    }).not.toThrow();
  });

  it("fail() delivers the error to every subscriber and ends the topic", () => {
    const topic = createTopic<number>(async () => {});
    const errors: unknown[] = [];
    topic.subscribe(
      () => {},
      (e) => {
        errors.push(e);
      },
    );
    topic.fail(new Error("boom"));
    expect(errors).toHaveLength(1);
  });
});
