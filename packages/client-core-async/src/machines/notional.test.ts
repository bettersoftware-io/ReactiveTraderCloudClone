import { describe, expect, it } from "vitest";

import type { NotionalView } from "@rtc/core-api";

import { createNotionalMachine } from "#/machines/notional";

describe("createNotionalMachine (async)", () => {
  it("starts from the initial view; change() and reset() drive it", () => {
    const m = createNotionalMachine(1_000_000);
    const seen: NotionalView[] = [];
    const sub = m.state$.subscribe((view) => {
      seen.push(view);
    });
    expect(seen).toEqual([
      {
        displayValue: "1,000,000",
        numericValue: 1_000_000,
        error: null,
        isRfq: false,
        isDefault: true,
      },
    ]);
    m.intents.change("2m");
    expect(seen.at(-1)?.numericValue).toBe(2_000_000);
    m.intents.reset();
    expect(seen.at(-1)?.isDefault).toBe(true);
    sub.unsubscribe();
    m.dispose();
  });

  it("each change publishes a fresh view, even for the same input", () => {
    const m = createNotionalMachine(1_000_000);
    const seen: NotionalView[] = [];
    const sub = m.state$.subscribe((view) => {
      seen.push(view);
    });
    m.intents.change("1m");
    m.intents.change("1m");
    // `reduceNotionalInput` mints a NEW object per call, so the Store's
    // `Object.is` drop never fires: two changes are two emissions.
    expect(seen).toHaveLength(3);
    expect(seen[1]).not.toBe(seen[2]);
    sub.unsubscribe();
    m.dispose();
  });

  it("dispose() makes the intents inert", () => {
    const m = createNotionalMachine(1_000_000);
    const seen: NotionalView[] = [];
    const sub = m.state$.subscribe((view) => {
      seen.push(view);
    });
    sub.unsubscribe();
    m.dispose();
    m.intents.change("3m");
    m.intents.reset();
    const fresh: NotionalView[] = [];
    m.state$
      .subscribe((view) => {
        fresh.push(view);
      })
      .unsubscribe();
    expect(fresh[0]?.numericValue).toBe(1_000_000);
  });
});
