import { describe, expect, it } from "vitest";

import { untilAborted } from "#/kernel/untilAborted";

describe("untilAborted", () => {
  it("resolves when the signal aborts", async () => {
    const controller = new AbortController();
    let resolved = false;
    const done = untilAborted(controller.signal).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    controller.abort();
    await done;
    expect(resolved).toBe(true);
  });

  it("resolves immediately for an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(untilAborted(controller.signal)).resolves.toBeUndefined();
  });
});
