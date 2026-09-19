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
    const source = createTopic<number>(
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
    source.subscribe(() => {});
    const done = relayTopic(source, new AbortController().signal, () => {
      throw new Error("consumer");
    });
    await expect(done).rejects.toThrow("consumer");
  });

  it("resolves at once when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await relayTopic(createHotTopic(), controller.signal, () => {});
  });

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
