import { describe, expect, it } from "vitest";

import { createNotionalMachine, type NotionalView } from "../NotionalMachine";

describe("createNotionalMachine", () => {
  function make(defaultNotional = 1_000_000) {
    return createNotionalMachine(defaultNotional);
  }

  function current(machine: ReturnType<typeof make>): NotionalView {
    let view: NotionalView | undefined;
    const sub = machine.state$.subscribe((s) => {
      view = s;
    });
    sub.unsubscribe();
    if (!view)
      throw new Error("NotionalMachine state$ did not emit synchronously");
    return view;
  }

  it("initialises from the default notional, formatted with commas", () => {
    const m = make(1_000_000);
    const v = current(m);
    expect(v.displayValue).toBe("1,000,000");
    expect(v.numericValue).toBe(1_000_000);
    expect(v.isDefault).toBe(true);
    expect(v.error).toBeNull();
    expect(v.isRfq).toBe(false);
    m.dispose();
  });

  it("flags an RFQ when the default already exceeds the threshold", () => {
    const m = make(10_000_000);
    expect(current(m).isRfq).toBe(true);
    m.dispose();
  });

  it("change() parses a valid edit and reformats it", () => {
    const m = make(1_000_000);
    m.intents.change("2500");
    const v = current(m);
    expect(v.numericValue).toBe(2_500);
    expect(v.displayValue).toBe("2,500");
    expect(v.isDefault).toBe(false);
    expect(v.error).toBeNull();
    m.dispose();
  });

  it("change() expands k/m suffixes and flags RFQ above the threshold", () => {
    const m = make(1_000_000);
    m.intents.change("20m");
    const v = current(m);
    expect(v.numericValue).toBe(20_000_000);
    expect(v.isRfq).toBe(true);
    m.dispose();
  });

  it("change() marks the value as default when an edit matches the default", () => {
    const m = make(1_000_000);
    m.intents.change("500");
    expect(current(m).isDefault).toBe(false);
    m.intents.change("1000000");
    expect(current(m).isDefault).toBe(true);
    m.dispose();
  });

  it("change() records raw input and error when parsing fails", () => {
    const m = make(1_000_000);
    m.intents.change("abc");
    const v = current(m);
    expect(v.numericValue).toBe(0);
    expect(v.displayValue).toBe("abc");
    expect(v.error).toBe("Invalid input");
    expect(v.isRfq).toBe(false);
    expect(v.isDefault).toBe(false);
    m.dispose();
  });

  it("change() surfaces a max-exceeded error while keeping the parsed value", () => {
    const m = make(1_000_000);
    m.intents.change("2000m");
    const v = current(m);
    expect(v.error).toBe("Max exceeded");
    expect(v.numericValue).toBe(2_000_000_000);
    m.dispose();
  });

  it("reset() after a max-exceeded warning restores the initial view", () => {
    const m = make(1_000_000);
    m.intents.change("2000m");
    expect(current(m).error).toBe("Max exceeded");
    m.intents.reset();
    const v = current(m);
    expect(v.error).toBeNull();
    expect(v.isDefault).toBe(true);
    expect(v.displayValue).toBe("1,000,000");
    m.dispose();
  });

  it("reset() returns to the formatted default", () => {
    const m = make(1_000_000);
    m.intents.change("123");
    m.intents.reset();
    const v = current(m);
    expect(v.displayValue).toBe("1,000,000");
    expect(v.numericValue).toBe(1_000_000);
    expect(v.isDefault).toBe(true);
    expect(v.error).toBeNull();
    m.dispose();
  });

  it("dispose() completes the machine without error", () => {
    const m = make(1_000_000);
    expect(() => {
      return m.dispose();
    }).not.toThrow();
  });
});
