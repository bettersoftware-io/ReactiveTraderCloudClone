import { describe, expect, it } from "vitest";

import { relayTopic } from "#/kernel/relayTopic";
import { createTopic, type Topic } from "#/kernel/topic";

describe("relayTopic", () => {
  it("hands every value to next and stops SYNCHRONOUSLY on abort", async () => {
    const source = createHotTopic();
    const controller = new AbortController();
    const seen: number[] = [];
    const done = relayTopic(source, controller.signal, (v) => {
      seen.push(v);
    });
    source.publish(1);
    source.publish(2);
    expect(seen).toEqual([1, 2]);
    controller.abort();
    source.publish(3);
    expect(seen).toEqual([1, 2]);
    await done;
  });

  it("rejects when the source fails", async () => {
    const source = createHotTopic();
    const done = relayTopic(source, new AbortController().signal, () => {});
    source.fail(new Error("source"));
    await expect(done).rejects.toThrow("source");
  });

  it("rejects when next throws — including on a replayed value — and releases the source", async () => {
    const { topic, counted } = createReplayingSource();
    // A keep-alive taken on the RAW topic (so it is not counted) holds the
    // producer warm, which is what makes the value REPLAY into the relay's
    // own `subscribe` — the path where `fail` runs before `stop` has been
    // assigned, and the only reason `relayTopic`'s `failed` flag exists.
    const keepAlive = topic.subscribe(() => {});
    const done = relayTopic(counted, new AbortController().signal, () => {
      throw new Error("consumer");
    });
    // The witness for the post-subscribe `if (failed) { stop(); }`: the
    // release is SYNCHRONOUS — already done by the time `relayTopic`
    // returns, let alone by the time `done` has rejected. Without that
    // branch the relay would stay subscribed forever, since the `stop?.()`
    // inside `fail` is a no-op on the replayed-value path.
    expect(counted.active()).toBe(0);
    await expect(done).rejects.toThrow("consumer");
    expect(counted.active()).toBe(0);
    keepAlive();
  });

  it("resolves at once when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await relayTopic(createHotTopic(), controller.signal, () => {});
  });

  /** A replay-1 source plus a subscription-counting facade over it. The
   * facade is what the code under test is handed, so `active()` reads the
   * relay's own hold on the source and nothing else. */
  function createReplayingSource(): ReplayingSource {
    const topic = createTopic<number>(
      (signal, publish) => {
        publish(1);
        return new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => {
            resolve();
          });
        });
      },
      { replay: true },
    );
    let active = 0;

    return {
      topic,
      counted: {
        publish: (value: number) => {
          topic.publish(value);
        },
        fail: (error: unknown) => {
          topic.fail(error);
        },
        active: () => {
          return active;
        },
        subscribe: (
          next: (value: number) => void,
          error?: (error: unknown) => void,
        ) => {
          active += 1;
          const stop = topic.subscribe(next, error);

          return () => {
            active -= 1;
            stop();
          };
        },
      },
    };
  }

  function createHotTopic(): Topic<number> {
    return createTopic<number>((signal) => {
      return new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => {
          resolve();
        });
      });
    });
  }
});

/** A Topic that also reports how many live subscriptions it has handed out. */
interface CountedTopic extends Topic<number> {
  active(): number;
}

interface ReplayingSource {
  topic: Topic<number>;
  counted: CountedTopic;
}
