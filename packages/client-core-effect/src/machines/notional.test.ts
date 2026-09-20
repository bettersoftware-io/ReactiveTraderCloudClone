import { describe, expect, it } from "vitest";

import type { NotionalView, Stream } from "@rtc/core-api";

import { createNotionalMachine } from "#/machines/notional";

describe("createNotionalMachine", () => {
  it("starts from the formatted default synchronously", () => {
    const m = createNotionalMachine(1_000_000);
    const seen = collect(m.state$);
    expect(seen).toEqual([INITIAL]);
    m.dispose();
  });

  it("change() and reset() move the view, and equal consecutive states are not re-emitted", async () => {
    const m = createNotionalMachine(1_000_000);
    const seen = collect(m.state$);
    m.intents.change("2m");
    await tick();
    expect(seen.at(-1)?.numericValue).toBe(2_000_000);
    m.intents.reset();
    await tick();
    expect(seen.at(-1)).toEqual(INITIAL);
    const before = seen.length;
    m.intents.reset();
    await tick();
    expect(seen).toHaveLength(before);
    m.dispose();
  });

  it("dispose() makes the intents inert, and a fresh subscription then yields the current value synchronously", async () => {
    const m = createNotionalMachine(1_000_000);
    const seen = collect(m.state$);
    m.intents.change("2m");
    await tick();
    m.intents.reset();
    await tick();
    m.dispose();
    m.intents.change("3m");
    await tick();
    expect(seen.at(-1)).toEqual(INITIAL);
    const fresh = collect(m.state$);
    expect(fresh).toEqual([INITIAL]);
  });
});

function collect(stream: Stream<NotionalView>): NotionalView[] {
  const values: NotionalView[] = [];
  stream.subscribe((value: NotionalView) => {
    values.push(value);
  });
  return values;
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const INITIAL: NotionalView = {
  displayValue: "1,000,000",
  numericValue: 1_000_000,
  error: null,
  isRfq: false,
  isDefault: true,
};
